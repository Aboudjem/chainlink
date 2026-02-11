/**
 * Medic configuration
 * 
 * Author allowlist - only PRs from these users are eligible for medic.
 * Also used to authorize /medic: command invokers.
 */

/**
 * GitHub usernames allowed to use medic (case-insensitive, stored lowercase)
 */
export const ALLOWED_AUTHORS = [
  'patrickhuie19',
  'bolekk',
  'tofel'
].map(a => a.toLowerCase());

/**
 * Labels that cause medic to skip a PR
 */
export const SKIP_LABELS = [
  'medic-attempts:3',    // Max retries reached
  'medic-skip',          // Manual opt-out
  'medic-in-progress',   // Currently being processed
  'do not merge',        // PR not ready
  'do-not-merge',        // Alternative format
  'wip'                  // Work in progress
];

/**
 * Label prefixes used by medic
 */
export const ATTEMPT_LABEL_PREFIX = 'medic-attempts:';
export const LOCK_LABEL = 'medic-in-progress';

/**
 * Maximum retry attempts before giving up
 */
export const MAX_ATTEMPTS = 3;

/**
 * How old a PR can be (in hours) to still be considered active
 */
export const ACTIVITY_THRESHOLD_HOURS = 48;

/**
 * Comment marker for upsert functionality
 */
export const COMMENT_MARKER = '<!-- medic-comment -->';

/**
 * Check if an author is on the allowlist
 */
export function isAuthorAllowed(login: string): boolean {
  return ALLOWED_AUTHORS.includes(login.toLowerCase());
}

/**
 * Check if a PR has any skip labels
 */
export function hasSkipLabel(labels: string[]): boolean {
  const normalizedLabels = labels.map(l => l.toLowerCase());
  return SKIP_LABELS.some(skip => 
    normalizedLabels.some(l => l.includes(skip.toLowerCase()))
  );
}

/**
 * Check if a PR has the lock label
 */
export function hasLockLabel(labels: string[]): boolean {
  return labels.map(l => l.toLowerCase()).includes(LOCK_LABEL.toLowerCase());
}

/**
 * Get the current attempt count from labels
 */
export function getAttemptCount(labels: string[]): number {
  const label = labels.find(l => l.startsWith(ATTEMPT_LABEL_PREFIX));
  if (!label) return 0;
  const count = parseInt(label.split(':')[1], 10);
  return isNaN(count) ? 0 : count;
}

/**
 * Check if PR activity is within threshold
 */
export function isRecentlyActive(pushedDate: string | undefined): boolean {
  if (!pushedDate) return false;
  const cutoff = Date.now() - ACTIVITY_THRESHOLD_HOURS * 60 * 60 * 1000;
  return new Date(pushedDate).getTime() > cutoff;
}

