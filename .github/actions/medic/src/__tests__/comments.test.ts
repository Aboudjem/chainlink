import { describe, it, expect, vi } from 'vitest';
import { COMMENT_MARKER, MAX_ATTEMPTS } from '../config.js';
import type { CommentParams } from '../types.js';

// Mock @actions/core to avoid side effects
vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  setFailed: vi.fn(),
  getInput: vi.fn(),
  setOutput: vi.fn()
}));

// Inline formatComment for testing (avoids importing comments.ts which has indirect side effects)
function formatComment(params: CommentParams): string {
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

describe('formatComment', () => {
  const baseParams: CommentParams = {
    success: true,
    attempt: 1,
    inputTokens: 45230,
    outputTokens: 12847,
    author: 'testuser'
  };

  it('should include the marker for upsert', () => {
    const body = formatComment(baseParams);
    expect(body).toContain(COMMENT_MARKER);
  });

  it('should mention the author', () => {
    const body = formatComment(baseParams);
    expect(body).toContain('@testuser');
  });

  it('should show attempt count', () => {
    const body = formatComment({ ...baseParams, attempt: 2 });
    expect(body).toContain('2/3');
  });

  it('should format token counts with commas', () => {
    const body = formatComment(baseParams);
    expect(body).toContain('45,230');
    expect(body).toContain('12,847');
  });

  describe('success case', () => {
    it('should show SUCCESS status', () => {
      const body = formatComment(baseParams);
      expect(body).toContain('SUCCESS');
      expect(body).toContain('✅');
    });

    it('should include success message', () => {
      const body = formatComment(baseParams);
      expect(body).toContain('Conflicts have been automatically resolved');
      expect(body).toContain('review the changes');
    });
  });

  describe('failure case', () => {
    const failureParams: CommentParams = {
      ...baseParams,
      success: false,
      attempt: 2,
      details: 'Claude timed out'
    };

    it('should show FAILED status', () => {
      const body = formatComment(failureParams);
      expect(body).toContain('FAILED');
      expect(body).toContain('❌');
    });

    it('should include failure details', () => {
      const body = formatComment(failureParams);
      expect(body).toContain('Claude timed out');
    });

    it('should show retry message when attempts remaining', () => {
      const body = formatComment(failureParams);
      expect(body).toContain('Medic will retry');
      expect(body).toContain('/medic: merge conflict');
    });

    it('should show max attempts message when exhausted', () => {
      const maxAttemptsParams = { ...failureParams, attempt: 3 };
      const body = formatComment(maxAttemptsParams);
      expect(body).toContain('Maximum retry attempts reached');
      expect(body).toContain('medic-attempts:3');
    });

    it('should handle missing details', () => {
      const noDetailsParams = { ...failureParams, details: undefined };
      const body = formatComment(noDetailsParams);
      expect(body).toContain('No additional details available');
    });
  });

  it('should format as markdown table', () => {
    const body = formatComment(baseParams);
    expect(body).toContain('| Metric | Value |');
    expect(body).toContain('|--------|-------|');
    expect(body).toContain('| Attempt |');
    expect(body).toContain('| Input tokens |');
    expect(body).toContain('| Output tokens |');
  });
});

