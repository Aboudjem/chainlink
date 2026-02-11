/**
 * Medic Labels - Utility functions for managing PR labels
 * 
 * Handles:
 * - Attempt tracking labels (medic-attempts:1, :2, :3)
 * - Lock label (medic-in-progress) for concurrency control
 */

import * as core from '@actions/core';
import type { OctokitClient } from './types.js';
import { ATTEMPT_LABEL_PREFIX, LOCK_LABEL, MAX_ATTEMPTS } from './config.js';

const ATTEMPT_LABELS = [
  `${ATTEMPT_LABEL_PREFIX}1`,
  `${ATTEMPT_LABEL_PREFIX}2`,
  `${ATTEMPT_LABEL_PREFIX}3`
];

/**
 * Increment the attempt counter label
 * Transitions: none -> :1, :1 -> :2, :2 -> :3
 */
export async function incrementAttempts(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  prNumber: number,
  current: number
): Promise<void> {
  // Remove current label if exists
  if (current > 0 && current <= MAX_ATTEMPTS) {
    try {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: prNumber,
        name: `${ATTEMPT_LABEL_PREFIX}${current}`
      });
      core.info(`Removed label ${ATTEMPT_LABEL_PREFIX}${current}`);
    } catch {
      // Label might not exist, ignore
      core.debug(`Label ${ATTEMPT_LABEL_PREFIX}${current} not present`);
    }
  }

  // Add incremented label (cap at MAX_ATTEMPTS)
  const nextAttempt = Math.min(current + 1, MAX_ATTEMPTS);
  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: prNumber,
    labels: [`${ATTEMPT_LABEL_PREFIX}${nextAttempt}`]
  });
  core.info(`Added label ${ATTEMPT_LABEL_PREFIX}${nextAttempt}`);
}

/**
 * Remove all attempt labels from a PR
 * Called on successful resolution or manual invocation
 */
export async function removeAllAttemptLabels(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> {
  for (const label of ATTEMPT_LABELS) {
    try {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: prNumber,
        name: label
      });
      core.info(`Removed label ${label}`);
    } catch {
      // Label might not exist, ignore
      core.debug(`Label ${label} not present`);
    }
  }
}

/**
 * Acquire the lock label to prevent concurrent processing
 * Should be called at the start of the fixer job
 */
export async function acquireLock(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> {
  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: prNumber,
    labels: [LOCK_LABEL]
  });
  core.info(`Acquired lock: added label ${LOCK_LABEL}`);
}

/**
 * Release the lock label to allow future processing
 * Should be called in the finally block of the fixer job
 */
export async function releaseLock(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> {
  try {
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: prNumber,
      name: LOCK_LABEL
    });
    core.info(`Released lock: removed label ${LOCK_LABEL}`);
  } catch {
    // Label might not exist, ignore
    core.debug(`Lock label ${LOCK_LABEL} not present`);
  }
}

