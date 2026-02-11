/**
 * Medic Comments - Utility functions for managing PR comments
 * 
 * Implements upsert functionality to avoid spamming PRs with multiple comments.
 * Uses a marker to identify existing medic comments for updates.
 */

import * as core from '@actions/core';
import type { OctokitClient, CommentParams } from './types.js';
import { COMMENT_MARKER, MAX_ATTEMPTS } from './config.js';

/**
 * Format the comment body for medic status updates
 */
export function formatComment(params: CommentParams): string {
  const status = params.success ? 'SUCCESS ✅' : 'FAILED ❌';
  const statusEmoji = params.success ? '🎉' : '⚠️';
  
  let body = `${COMMENT_MARKER}
## ${statusEmoji} Medic: Merge Conflict Resolution - ${status}

@${params.author}

| Metric | Value |
|--------|-------|
| Attempt | ${params.attempt}/${MAX_ATTEMPTS} |
| Input tokens | ${params.inputTokens.toLocaleString()} |
| Output tokens | ${params.outputTokens.toLocaleString()} |

`;

  if (params.success) {
    body += `Conflicts have been automatically resolved and pushed to this branch.

Please review the changes and ensure they are correct before merging.`;
  } else {
    body += `Unable to resolve conflicts automatically.

${params.details || 'No additional details available.'}`;
    
    if (params.attempt < MAX_ATTEMPTS) {
      body += `

Medic will retry on the next cron run, or you can trigger manually with \`/medic: merge conflict\`.`;
    } else {
      body += `

Maximum retry attempts reached. Please resolve conflicts manually or remove the \`medic-attempts:3\` label to allow medic to try again.`;
    }
  }

  return body;
}

/**
 * Upsert a comment on a PR (update existing or create new)
 * Uses a marker to identify existing medic comments
 */
export async function upsertComment(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  prNumber: number,
  params: CommentParams
): Promise<void> {
  const body = formatComment(params);

  try {
    // Find existing comment with marker
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber
    });
    
    const existing = comments.find(c => c.body?.includes(COMMENT_MARKER));

    if (existing) {
      // Update existing comment
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body
      });
      core.info(`Updated existing comment #${existing.id}`);
    } else {
      // Create new comment
      const { data: newComment } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body
      });
      core.info(`Created new comment #${newComment.id}`);
    }
  } catch (error) {
    core.warning(`Failed to upsert comment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Post a simple status message (not upserted, always creates new)
 * Used for informational messages that don't need to be updated
 */
export async function postMessage(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  prNumber: number,
  message: string
): Promise<void> {
  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `**Medic:** ${message}`
    });
    core.info('Posted status message');
  } catch (error) {
    core.warning(`Failed to post message: ${error instanceof Error ? error.message : String(error)}`);
  }
}

