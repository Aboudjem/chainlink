/**
 * Medic Fixer - Resolves merge conflicts using Claude Code
 * 
 * This action:
 * 1. Acquires lock label to prevent concurrent processing
 * 2. Checks out PR branch and merges base to surface conflicts
 * 3. Runs Claude Code CLI with conflict resolution prompt
 * 4. Parses token usage from Claude output
 * 5. Runs gitleaks scan on staged changes
 * 6. On success: pushes, removes attempt labels, upserts success comment
 * 7. On failure: increments attempt label, upserts failure comment
 * 8. Always releases lock in finally block
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';
import { acquireLock, releaseLock, incrementAttempts, removeAllAttemptLabels } from './labels.js';
import { upsertComment } from './comments.js';
import type { ClaudeResult, FixerInputs } from './types.js';

/**
 * Parse token usage from Claude stream-json output
 */
export function parseClaudeTokens(output: string): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  
  try {
    // Parse each line looking for result messages with usage info
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('"type":"result"') || line.includes('"type": "result"')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.input_tokens) inputTokens = parsed.input_tokens;
          if (parsed.output_tokens) outputTokens = parsed.output_tokens;
        } catch {
          // Continue to next line
        }
      }
    }
  } catch (error) {
    core.warning(`Failed to parse Claude tokens: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return { inputTokens, outputTokens };
}

/**
 * Run Claude Code CLI with the conflict resolution prompt
 */
export async function runClaude(prompt: string, dryRun: boolean, mockClaude: boolean): Promise<ClaudeResult> {
  // Mock mode for testing
  if (mockClaude) {
    core.info('[MOCK] Skipping Claude invocation');
    return {
      success: true,
      inputTokens: 1000,
      outputTokens: 500
    };
  }

  if (dryRun) {
    core.info('[DRY-RUN] Would run Claude with prompt');
    return {
      success: true,
      inputTokens: 0,
      outputTokens: 0
    };
  }

  let output = '';
  let errorOutput = '';

  try {
    const exitCode = await exec.exec(
      'claude',
      ['--dangerously-skip-permissions', '-p', prompt, '--output-format', 'stream-json'],
      {
        listeners: {
          stdout: (data: Buffer) => {
            output += data.toString();
          },
          stderr: (data: Buffer) => {
            errorOutput += data.toString();
          }
        },
        ignoreReturnCode: true
      }
    );

    const tokens = parseClaudeTokens(output);

    if (exitCode !== 0) {
      return {
        success: false,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        error: errorOutput || `Claude exited with code ${exitCode}`
      };
    }

    return {
      success: true,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens
    };
  } catch (error) {
    return {
      success: false,
      inputTokens: 0,
      outputTokens: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Run gitleaks to scan for secrets in staged changes
 */
export async function runGitleaks(): Promise<{ success: boolean; error?: string }> {
  try {
    const exitCode = await exec.exec('gitleaks', ['detect', '--staged', '--verbose'], {
      ignoreReturnCode: true
    });

    if (exitCode !== 0) {
      return {
        success: false,
        error: 'Gitleaks detected potential secrets in the changes'
      };
    }

    return { success: true };
  } catch (error) {
    // If gitleaks is not installed, log warning but continue
    core.warning(`Gitleaks not available: ${error instanceof Error ? error.message : String(error)}`);
    return { success: true };
  }
}

/**
 * Check if there are staged changes to commit
 */
async function hasChanges(): Promise<boolean> {
  let output = '';
  await exec.exec('git', ['diff', '--cached', '--name-only'], {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      }
    }
  });
  return output.trim().length > 0;
}

/**
 * Load the prompt template and fill in variables
 */
function loadPrompt(baseBranch: string, prBranch: string): string {
  const promptPath = path.join(process.cwd(), '.github', 'scripts', 'medic-conflict-prompt.md');
  
  if (fs.existsSync(promptPath)) {
    let template = fs.readFileSync(promptPath, 'utf-8');
    template = template.replace(/\{\{BASE_BRANCH\}\}/g, baseBranch);
    template = template.replace(/\{\{PR_BRANCH\}\}/g, prBranch);
    return template;
  }
  
  // Fallback prompt if template not found
  return `You are resolving merge conflicts in a Git repository.

The PR branch "${prBranch}" has merge conflicts with the base branch "${baseBranch}".

Steps:
1. Identify all files with merge conflicts (look for conflict markers: <<<<<<<, =======, >>>>>>>)
2. For each conflicting file, analyze the changes from both branches
3. Resolve the conflicts by combining changes intelligently, preserving functionality from both sides
4. Remove all conflict markers after resolution
5. Ensure the resolved code compiles and maintains logical consistency

Use git commands to:
- View the conflicting files: git status
- See the conflict markers: git diff
- After resolving, stage the files: git add <file>

Important:
- Do NOT commit the changes, only stage them
- Preserve the intent of both the base branch and PR branch changes
- If in doubt, prefer the PR branch's changes as they represent the newer work`;
}

/**
 * Parse inputs from environment/core
 */
function getInputs(): FixerInputs {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    prNumber: parseInt(core.getInput('pr-number', { required: true }), 10),
    prBranch: core.getInput('pr-branch', { required: true }),
    baseBranch: core.getInput('base-branch', { required: true }),
    currentAttempts: parseInt(core.getInput('current-attempts') || '0', 10),
    dryRun: core.getInput('dry-run') === 'true',
    mockClaude: core.getInput('mock-claude') === 'true'
  };
}

/**
 * Main function - entry point for the action
 */
export async function run(): Promise<void> {
  const inputs = getInputs();
  const octokit = github.getOctokit(inputs.githubToken);
  const { owner, repo } = github.context.repo;
  const attempt = inputs.currentAttempts + 1;

  core.info(`Starting fixer for PR #${inputs.prNumber} (attempt ${attempt})`);
  core.info(`Branch: ${inputs.prBranch} -> ${inputs.baseBranch}`);

  let claudeResult: ClaudeResult = { success: false, inputTokens: 0, outputTokens: 0 };

  try {
    // Step 1: Acquire lock
    if (!inputs.dryRun) {
      await acquireLock(octokit, owner, repo, inputs.prNumber);
    } else {
      core.info('[DRY-RUN] Would acquire lock');
    }

    // Step 2: Configure git
    await exec.exec('git', ['config', 'user.name', 'github-actions[bot]']);
    await exec.exec('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);

    // Step 3: Fetch and checkout PR branch
    await exec.exec('git', ['fetch', 'origin', inputs.prBranch]);
    await exec.exec('git', ['checkout', inputs.prBranch]);

    // Step 4: Fetch base branch and attempt merge to surface conflicts
    await exec.exec('git', ['fetch', 'origin', inputs.baseBranch]);
    
    // Attempt merge - this will fail with conflicts, which is expected
    let mergeOutput = '';
    const mergeResult = await exec.exec('git', ['merge', `origin/${inputs.baseBranch}`, '--no-commit'], {
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          mergeOutput += data.toString();
        },
        stderr: (data: Buffer) => {
          mergeOutput += data.toString();
        }
      }
    });

    if (mergeResult === 0) {
      core.info('Merge succeeded without conflicts - nothing to fix');
      // Abort the merge since there's nothing to do
      await exec.exec('git', ['merge', '--abort'], { ignoreReturnCode: true });
      
      if (!inputs.dryRun) {
        await upsertComment(octokit, owner, repo, inputs.prNumber, {
          success: true,
          attempt,
          inputTokens: 0,
          outputTokens: 0,
          author: 'unknown',
          details: 'No conflicts detected - the branch may have been updated.'
        });
      }
      return;
    }

    core.info('Merge conflicts detected, running Claude to resolve...');

    // Step 5: Run Claude to resolve conflicts
    const prompt = loadPrompt(inputs.baseBranch, inputs.prBranch);
    claudeResult = await runClaude(prompt, inputs.dryRun, inputs.mockClaude);

    if (!claudeResult.success) {
      throw new Error(`Claude failed: ${claudeResult.error || 'Unknown error'}`);
    }

    core.info(`Claude completed: ${claudeResult.inputTokens} input tokens, ${claudeResult.outputTokens} output tokens`);

    // Step 6: Check if there are changes to commit
    if (!await hasChanges()) {
      throw new Error('Claude did not resolve the conflicts - no staged changes found');
    }

    // Step 7: Run gitleaks to check for secrets
    if (!inputs.dryRun && !inputs.mockClaude) {
      const gitleaksResult = await runGitleaks();
      if (!gitleaksResult.success) {
        throw new Error(`Security scan failed: ${gitleaksResult.error}`);
      }
    }

    // Step 8: Commit and push
    if (inputs.dryRun) {
      core.info('[DRY-RUN] Would commit and push changes');
    } else {
      await exec.exec('git', ['commit', '-m', `Medic: Resolve merge conflicts (attempt ${attempt})`]);
      await exec.exec('git', ['push', 'origin', inputs.prBranch]);
      core.info('Successfully pushed resolved conflicts');
    }

    // Step 9: Success - remove attempt labels and upsert comment
    if (!inputs.dryRun) {
      await removeAllAttemptLabels(octokit, owner, repo, inputs.prNumber);
      
      // Get PR author for the comment
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: inputs.prNumber
      });

      await upsertComment(octokit, owner, repo, inputs.prNumber, {
        success: true,
        attempt,
        inputTokens: claudeResult.inputTokens,
        outputTokens: claudeResult.outputTokens,
        author: pr.user?.login || 'unknown'
      });
    }

    core.info(`Successfully resolved conflicts for PR #${inputs.prNumber}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.error(`Fixer failed: ${errorMessage}`);

    // Failure - increment attempts and upsert comment
    if (!inputs.dryRun) {
      await incrementAttempts(octokit, owner, repo, inputs.prNumber, inputs.currentAttempts);

      // Get PR author for the comment
      try {
        const { data: pr } = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: inputs.prNumber
        });

        await upsertComment(octokit, owner, repo, inputs.prNumber, {
          success: false,
          attempt,
          inputTokens: claudeResult.inputTokens,
          outputTokens: claudeResult.outputTokens,
          author: pr.user?.login || 'unknown',
          details: errorMessage
        });
      } catch (commentError) {
        core.warning(`Failed to post failure comment: ${commentError}`);
      }
    }

    core.setFailed(errorMessage);
  } finally {
    // Always release lock
    if (!inputs.dryRun) {
      try {
        await releaseLock(octokit, owner, repo, inputs.prNumber);
      } catch (unlockError) {
        core.warning(`Failed to release lock: ${unlockError}`);
      }
    } else {
      core.info('[DRY-RUN] Would release lock');
    }

    // Clean up git state
    try {
      await exec.exec('git', ['merge', '--abort'], { ignoreReturnCode: true });
      await exec.exec('git', ['checkout', '-'], { ignoreReturnCode: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Run when executed directly (not when imported as a module)
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '');
if (isMainModule || process.env.GITHUB_ACTIONS) {
  run();
}

