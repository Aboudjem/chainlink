/**
 * Shared TypeScript types for Medic action
 */

import type { GitHub } from '@actions/github/lib/utils';

/**
 * Octokit client type from @actions/github
 */
export type OctokitClient = InstanceType<typeof GitHub>;

/**
 * PR data from GraphQL query
 */
export interface GraphQLPullRequest {
  number: number;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  author: { login: string };
  labels: { nodes: { name: string }[] };
  commits: { nodes: { pushedDate: string }[] };
  headRepository: { isFork: boolean } | null;
}

/**
 * Processed PR data for fixer matrix
 */
export interface PRMatrixEntry {
  number: number;
  headRefName: string;
  baseRefName: string;
  author: string;
  currentAttempts: number;
}

/**
 * Matrix format for GitHub Actions
 */
export interface PRMatrix {
  include: PRMatrixEntry[];
}

/**
 * Result from Claude execution
 */
export interface ClaudeResult {
  success: boolean;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

/**
 * Parameters for comment upsert
 */
export interface CommentParams {
  success: boolean;
  attempt: number;
  inputTokens: number;
  outputTokens: number;
  author: string;
  details?: string;
}

/**
 * GitHub repository context
 */
export interface RepoContext {
  owner: string;
  repo: string;
}

/**
 * Fixer action inputs
 */
export interface FixerInputs {
  githubToken: string;
  prNumber: number;
  prBranch: string;
  baseBranch: string;
  currentAttempts: number;
  dryRun: boolean;
  mockClaude: boolean;
}

/**
 * Checker action inputs
 */
export interface CheckerInputs {
  githubToken: string;
}

/**
 * Comment parser action inputs
 */
export interface CommentParserInputs {
  githubToken: string;
  commentBody: string;
  issueNumber: number;
  commenterLogin: string;
}

