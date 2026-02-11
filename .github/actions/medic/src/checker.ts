/**
 * Medic Checker - Checks for PRs with merge conflicts
 * 
 * This action is run on cron/dispatch to find eligible PRs with conflicts.
 * It uses GraphQL to efficiently fetch PR data and filters based on:
 * - Author is on allowlist
 * - Not a draft PR
 * - Not a fork PR
 * - Has merge conflicts (CONFLICTING status)
 * - Recently active (pushed < 48h)
 * - No skip labels (medic-attempts:3, medic-skip, etc.)
 * - Not currently being processed (medic-in-progress)
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { 
  isAuthorAllowed, 
  hasSkipLabel, 
  hasLockLabel, 
  getAttemptCount, 
  isRecentlyActive 
} from './config.js';
import type { GraphQLPullRequest, PRMatrix, PRMatrixEntry } from './types.js';

/**
 * GraphQL query for fetching open PRs with all required fields
 */
const QUERY = `
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(states: OPEN, first: 100) {
        nodes {
          number
          headRefName
          baseRefName
          isDraft
          mergeable
          reviewDecision
          author { login }
          labels(first: 50) { nodes { name } }
          commits(last: 1) { nodes { commit { pushedDate } } }
          headRepository { isFork }
        }
      }
    }
  }
`;

/**
 * Response shape from GraphQL query
 */
interface GraphQLResponse {
  repository: {
    pullRequests: {
      nodes: GraphQLPullRequest[];
    };
  };
}

/**
 * Filter PRs to find those eligible for medic conflict resolution
 */
export function filterConflictingPRs(prs: GraphQLPullRequest[]): PRMatrixEntry[] {
  return prs.filter(pr => {
    const labels = pr.labels.nodes.map(l => l.name);
    const authorLogin = pr.author?.login || '';
    // Handle the nested commit structure from GraphQL
    const lastCommit = pr.commits.nodes[0] as unknown as { commit?: { pushedDate?: string } } | undefined;
    const pushedDate = lastCommit?.commit?.pushedDate;
    
    // Log filtering decisions for debugging
    const shouldInclude = (
      !pr.isDraft &&                                    // Not a draft
      !pr.headRepository?.isFork &&                     // Not a fork PR
      isAuthorAllowed(authorLogin) &&                   // Author on allowlist
      pr.mergeable === 'CONFLICTING' &&                 // Has conflicts (skip UNKNOWN)
      isRecentlyActive(pushedDate) &&                   // Active (pushed < 48h)
      !hasSkipLabel(labels) &&                          // No skip labels
      !hasLockLabel(labels)                             // Not already being processed
    );

    if (!shouldInclude) {
      core.debug(`Skipping PR #${pr.number}: isDraft=${pr.isDraft}, isFork=${pr.headRepository?.isFork}, author=${authorLogin}, mergeable=${pr.mergeable}, active=${isRecentlyActive(pushedDate)}, hasSkipLabel=${hasSkipLabel(labels)}, hasLockLabel=${hasLockLabel(labels)}`);
    }

    return shouldInclude;
  }).map(pr => ({
    number: pr.number,
    headRefName: pr.headRefName,
    baseRefName: pr.baseRefName,
    author: pr.author?.login || 'unknown',
    currentAttempts: getAttemptCount(pr.labels.nodes.map(l => l.name))
  }));
}

/**
 * Main function - entry point for the action
 */
export async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    
    core.info(`Checking for conflicting PRs in ${owner}/${repo}`);

    const response = await octokit.graphql<GraphQLResponse>(QUERY, { owner, repo });
    const prs = response.repository.pullRequests.nodes;
    
    core.info(`Found ${prs.length} open PRs`);

    const conflicting = filterConflictingPRs(prs);
    
    const matrix: PRMatrix = { include: conflicting };
    
    core.setOutput('matrix', JSON.stringify(matrix));
    core.setOutput('has_conflicts', conflicting.length > 0);
    
    core.info(`Found ${conflicting.length} eligible PRs with conflicts`);
    
    for (const pr of conflicting) {
      core.info(`  - PR #${pr.number} by ${pr.author} (attempts: ${pr.currentAttempts})`);
    }
  } catch (error) {
    core.setFailed(`Checker failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Run when executed directly (not when imported as a module)
// Using dynamic import check for ESM compatibility
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '');
if (isMainModule || process.env.GITHUB_ACTIONS) {
  run();
}

