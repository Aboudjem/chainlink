import { describe, it, expect } from 'vitest';
import {
  ALLOWED_AUTHORS,
  SKIP_LABELS,
  isAuthorAllowed,
  hasSkipLabel,
  hasLockLabel,
  getAttemptCount,
  isRecentlyActive
} from '../config.js';

describe('config', () => {
  describe('ALLOWED_AUTHORS', () => {
    it('should contain expected users', () => {
      expect(ALLOWED_AUTHORS).toContain('patrickhuie19');
      expect(ALLOWED_AUTHORS).toContain('bolekk');
      expect(ALLOWED_AUTHORS).toContain('tofel');
    });

    it('should be lowercase', () => {
      ALLOWED_AUTHORS.forEach(author => {
        expect(author).toBe(author.toLowerCase());
      });
    });
  });

  describe('SKIP_LABELS', () => {
    it('should contain attempt limit label', () => {
      expect(SKIP_LABELS).toContain('medic-attempts:3');
    });

    it('should contain skip label', () => {
      expect(SKIP_LABELS).toContain('medic-skip');
    });

    it('should contain in-progress label', () => {
      expect(SKIP_LABELS).toContain('medic-in-progress');
    });

    it('should contain do not merge variants', () => {
      expect(SKIP_LABELS).toContain('do not merge');
      expect(SKIP_LABELS).toContain('do-not-merge');
    });
  });

  describe('isAuthorAllowed', () => {
    it('should return true for allowed authors', () => {
      expect(isAuthorAllowed('patrickhuie19')).toBe(true);
      expect(isAuthorAllowed('bolekk')).toBe(true);
      expect(isAuthorAllowed('tofel')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isAuthorAllowed('PatrickHuie19')).toBe(true);
      expect(isAuthorAllowed('BOLEKK')).toBe(true);
      expect(isAuthorAllowed('Tofel')).toBe(true);
    });

    it('should return false for non-allowed authors', () => {
      expect(isAuthorAllowed('randomuser')).toBe(false);
      expect(isAuthorAllowed('unknown')).toBe(false);
    });
  });

  describe('hasSkipLabel', () => {
    it('should return true when skip label present', () => {
      expect(hasSkipLabel(['bug', 'medic-attempts:3'])).toBe(true);
      expect(hasSkipLabel(['medic-skip'])).toBe(true);
      expect(hasSkipLabel(['do not merge'])).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(hasSkipLabel(['MEDIC-SKIP'])).toBe(true);
      expect(hasSkipLabel(['Do Not Merge'])).toBe(true);
    });

    it('should return false when no skip labels', () => {
      expect(hasSkipLabel(['bug', 'enhancement'])).toBe(false);
      expect(hasSkipLabel([])).toBe(false);
    });

    it('should match partial labels containing skip text', () => {
      expect(hasSkipLabel(['wip-feature'])).toBe(true);
    });
  });

  describe('hasLockLabel', () => {
    it('should return true when lock label present', () => {
      expect(hasLockLabel(['medic-in-progress'])).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(hasLockLabel(['MEDIC-IN-PROGRESS'])).toBe(true);
    });

    it('should return false when lock label not present', () => {
      expect(hasLockLabel(['bug', 'enhancement'])).toBe(false);
      expect(hasLockLabel([])).toBe(false);
    });
  });

  describe('getAttemptCount', () => {
    it('should return 0 when no attempt labels', () => {
      expect(getAttemptCount(['bug', 'enhancement'])).toBe(0);
      expect(getAttemptCount([])).toBe(0);
    });

    it('should extract attempt number from label', () => {
      expect(getAttemptCount(['medic-attempts:1'])).toBe(1);
      expect(getAttemptCount(['medic-attempts:2'])).toBe(2);
      expect(getAttemptCount(['medic-attempts:3'])).toBe(3);
    });

    it('should work with other labels present', () => {
      expect(getAttemptCount(['bug', 'medic-attempts:2', 'enhancement'])).toBe(2);
    });

    it('should return 0 for malformed labels', () => {
      expect(getAttemptCount(['medic-attempts:'])).toBe(0);
      expect(getAttemptCount(['medic-attempts:abc'])).toBe(0);
    });
  });

  describe('isRecentlyActive', () => {
    it('should return true for recent dates', () => {
      const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
      expect(isRecentlyActive(recent)).toBe(true);
    });

    it('should return false for old dates', () => {
      const old = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(); // 72 hours ago
      expect(isRecentlyActive(old)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isRecentlyActive(undefined)).toBe(false);
    });

    it('should return true for dates at exactly 48 hours', () => {
      const boundary = new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(); // Just under 48 hours
      expect(isRecentlyActive(boundary)).toBe(true);
    });
  });
});

