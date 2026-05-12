import { describe, it, expect } from 'vitest';
import {
  classifyDwellTime,
  createDwellTimeEvent,
  DWELL_TIME_THRESHOLD_MS,
} from '@/lib/utils/dwell-time-classifier';

describe('dwell-time-classifier', () => {
  describe('DWELL_TIME_THRESHOLD_MS', () => {
    it('should be 1000ms', () => {
      expect(DWELL_TIME_THRESHOLD_MS).toBe(1000);
    });
  });

  describe('classifyDwellTime', () => {
    it('returns "view" for dwellTime >= 1000', () => {
      expect(classifyDwellTime(1500)).toBe('view');
      expect(classifyDwellTime(5000)).toBe('view');
      expect(classifyDwellTime(60000)).toBe('view');
    });

    it('returns "quick_skip" for dwellTime < 1000', () => {
      expect(classifyDwellTime(0)).toBe('quick_skip');
      expect(classifyDwellTime(500)).toBe('quick_skip');
      expect(classifyDwellTime(800)).toBe('quick_skip');
    });

    it('boundary: exactly 1000ms returns "view"', () => {
      expect(classifyDwellTime(1000)).toBe('view');
    });

    it('boundary: 999ms returns "quick_skip"', () => {
      expect(classifyDwellTime(999)).toBe('quick_skip');
    });
  });

  describe('createDwellTimeEvent', () => {
    it('includes exact dwell time value in the event', () => {
      const event = createDwellTimeEvent('repo-123', 'owner/repo', 2500);
      expect(event.dwellTimeMs).toBe(2500);
    });

    it('classifies as "view" when dwellTime >= 1000', () => {
      const event = createDwellTimeEvent('repo-123', 'owner/repo', 1000);
      expect(event.type).toBe('view');
      expect(event.dwellTimeMs).toBe(1000);
    });

    it('classifies as "quick_skip" when dwellTime < 1000', () => {
      const event = createDwellTimeEvent('repo-123', 'owner/repo', 400);
      expect(event.type).toBe('quick_skip');
      expect(event.dwellTimeMs).toBe(400);
    });

    it('includes repoId in the event', () => {
      const event = createDwellTimeEvent('repo-456', 'user/project', 3000);
      expect(event.repoId).toBe('repo-456');
    });

    it('includes repoFullName in metadata', () => {
      const event = createDwellTimeEvent('repo-789', 'org/lib', 1200);
      expect(event.metadata).toEqual({ repoFullName: 'org/lib' });
    });
  });
});
