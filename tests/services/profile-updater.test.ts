import { describe, it, expect } from 'vitest';
import {
  updateProfileWeights,
  clampWeight,
  adjustWeight,
  getStarRangeBucket,
  POSITIVE_LEARNING_RATE,
  NEGATIVE_RATE_NOT_INTERESTED,
  NEGATIVE_RATE_QUICK_SKIP,
  WEIGHT_MIN,
  WEIGHT_MAX,
} from '@/services/profile-updater';
import type { UserProfile } from '@/lib/types/user';
import type { RepoCard } from '@/lib/types/repo';

// --- Test fixtures ---

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    languageWeights: {},
    topicWeights: {},
    starRangeWeights: {},
    authorWeights: {},
    totalInteractions: 0,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<RepoCard> = {}): RepoCard {
  return {
    id: 'repo-1',
    fullName: 'testuser/testrepo',
    owner: 'testuser',
    name: 'testrepo',
    description: 'A test repository',
    language: 'TypeScript',
    starCount: 500,
    forkCount: 50,
    topics: ['web', 'frontend'],
    isArchived: false,
    isFork: false,
    readmeSummary: 'Test readme',
    lastCommitAt: new Date('2024-01-01'),
    defaultBranch: 'main',
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// --- clampWeight tests ---

describe('clampWeight', () => {
  it('returns value unchanged when within bounds', () => {
    expect(clampWeight(0.5)).toBe(0.5);
    expect(clampWeight(-0.5)).toBe(-0.5);
    expect(clampWeight(0)).toBe(0);
  });

  it('clamps to WEIGHT_MAX when value exceeds 1.0', () => {
    expect(clampWeight(1.5)).toBe(1.0);
    expect(clampWeight(100)).toBe(1.0);
  });

  it('clamps to WEIGHT_MIN when value is below -1.0', () => {
    expect(clampWeight(-1.5)).toBe(-1.0);
    expect(clampWeight(-100)).toBe(-1.0);
  });

  it('returns exact boundary values', () => {
    expect(clampWeight(1.0)).toBe(1.0);
    expect(clampWeight(-1.0)).toBe(-1.0);
  });
});

// --- adjustWeight tests ---

describe('adjustWeight', () => {
  it('adds delta to current value', () => {
    expect(adjustWeight(0.5, 0.1)).toBeCloseTo(0.6);
  });

  it('clamps result to max', () => {
    expect(adjustWeight(0.95, 0.1)).toBe(1.0);
  });

  it('clamps result to min', () => {
    expect(adjustWeight(-0.95, -0.1)).toBe(-1.0);
  });
});

// --- getStarRangeBucket tests ---

describe('getStarRangeBucket', () => {
  it('returns correct buckets for various star counts', () => {
    expect(getStarRangeBucket(0)).toBe('0-10');
    expect(getStarRangeBucket(9)).toBe('0-10');
    expect(getStarRangeBucket(10)).toBe('10-100');
    expect(getStarRangeBucket(99)).toBe('10-100');
    expect(getStarRangeBucket(100)).toBe('100-1000');
    expect(getStarRangeBucket(999)).toBe('100-1000');
    expect(getStarRangeBucket(1000)).toBe('1000-10000');
    expect(getStarRangeBucket(9999)).toBe('1000-10000');
    expect(getStarRangeBucket(10000)).toBe('10000+');
    expect(getStarRangeBucket(500000)).toBe('10000+');
  });
});

// --- updateProfileWeights tests ---

describe('updateProfileWeights', () => {
  describe('positive feedback increases all relevant weights', () => {
    const positiveTypes = ['like', 'favorite', 'follow', 'open_external', 'view'] as const;

    for (const eventType of positiveTypes) {
      it(`increases weights for "${eventType}" event`, () => {
        const profile = makeProfile({
          languageWeights: { TypeScript: 0.3 },
          topicWeights: { web: 0.2, frontend: 0.1 },
          starRangeWeights: { '100-1000': 0.4 },
          authorWeights: { testuser: 0.5 },
        });
        const repo = makeRepo();

        const updated = updateProfileWeights(profile, repo, eventType);

        expect(updated.languageWeights['TypeScript']).toBeCloseTo(0.3 + POSITIVE_LEARNING_RATE);
        expect(updated.topicWeights['web']).toBeCloseTo(0.2 + POSITIVE_LEARNING_RATE);
        expect(updated.topicWeights['frontend']).toBeCloseTo(0.1 + POSITIVE_LEARNING_RATE);
        expect(updated.starRangeWeights['100-1000']).toBeCloseTo(0.4 + POSITIVE_LEARNING_RATE);
        expect(updated.authorWeights['testuser']).toBeCloseTo(0.5 + POSITIVE_LEARNING_RATE);
      });
    }
  });

  describe('negative feedback (not_interested) decreases all relevant weights', () => {
    it('decreases weights by NEGATIVE_RATE_NOT_INTERESTED', () => {
      const profile = makeProfile({
        languageWeights: { TypeScript: 0.5 },
        topicWeights: { web: 0.4, frontend: 0.3 },
        starRangeWeights: { '100-1000': 0.6 },
        authorWeights: { testuser: 0.7 },
      });
      const repo = makeRepo();

      const updated = updateProfileWeights(profile, repo, 'not_interested');

      expect(updated.languageWeights['TypeScript']).toBeCloseTo(0.5 - NEGATIVE_RATE_NOT_INTERESTED);
      expect(updated.topicWeights['web']).toBeCloseTo(0.4 - NEGATIVE_RATE_NOT_INTERESTED);
      expect(updated.topicWeights['frontend']).toBeCloseTo(0.3 - NEGATIVE_RATE_NOT_INTERESTED);
      expect(updated.starRangeWeights['100-1000']).toBeCloseTo(0.6 - NEGATIVE_RATE_NOT_INTERESTED);
      expect(updated.authorWeights['testuser']).toBeCloseTo(0.7 - NEGATIVE_RATE_NOT_INTERESTED);
    });
  });

  describe('quick_skip decreases weights by less than not_interested', () => {
    it('quick_skip uses a smaller decrement than not_interested', () => {
      const profile = makeProfile({
        languageWeights: { TypeScript: 0.5 },
        topicWeights: { web: 0.4 },
        starRangeWeights: { '100-1000': 0.6 },
        authorWeights: { testuser: 0.7 },
      });
      const repo = makeRepo();

      const afterSkip = updateProfileWeights(profile, repo, 'quick_skip');
      const afterNotInterested = updateProfileWeights(profile, repo, 'not_interested');

      // quick_skip decrease is smaller in magnitude
      const skipDecrease = profile.languageWeights['TypeScript']! - afterSkip.languageWeights['TypeScript']!;
      const notInterestedDecrease = profile.languageWeights['TypeScript']! - afterNotInterested.languageWeights['TypeScript']!;

      expect(skipDecrease).toBeCloseTo(NEGATIVE_RATE_QUICK_SKIP);
      expect(notInterestedDecrease).toBeCloseTo(NEGATIVE_RATE_NOT_INTERESTED);
      expect(skipDecrease).toBeLessThan(notInterestedDecrease);
    });
  });

  describe('weights are clamped at 1.0 (cannot exceed)', () => {
    it('does not exceed 1.0 after positive feedback on high weight', () => {
      const profile = makeProfile({
        languageWeights: { TypeScript: 0.95 },
        topicWeights: { web: 1.0 },
        starRangeWeights: { '100-1000': 0.99 },
        authorWeights: { testuser: 0.98 },
      });
      const repo = makeRepo();

      const updated = updateProfileWeights(profile, repo, 'like');

      expect(updated.languageWeights['TypeScript']).toBe(WEIGHT_MAX);
      expect(updated.topicWeights['web']).toBe(WEIGHT_MAX);
      expect(updated.starRangeWeights['100-1000']).toBe(WEIGHT_MAX);
      expect(updated.authorWeights['testuser']).toBe(WEIGHT_MAX);
    });
  });

  describe('weights are clamped at -1.0 (cannot go below)', () => {
    it('does not go below -1.0 after negative feedback on low weight', () => {
      const profile = makeProfile({
        languageWeights: { TypeScript: -0.9 },
        topicWeights: { web: -1.0 },
        starRangeWeights: { '100-1000': -0.95 },
        authorWeights: { testuser: -0.88 },
      });
      const repo = makeRepo();

      const updated = updateProfileWeights(profile, repo, 'not_interested');

      expect(updated.languageWeights['TypeScript']).toBe(WEIGHT_MIN);
      expect(updated.topicWeights['web']).toBe(WEIGHT_MIN);
      expect(updated.starRangeWeights['100-1000']).toBe(WEIGHT_MIN);
      expect(updated.authorWeights['testuser']).toBe(WEIGHT_MIN);
    });
  });

  describe('unknown/neutral event types do not change weights', () => {
    const neutralTypes = ['unlike', 'unfavorite', 'unfollow'] as const;

    for (const eventType of neutralTypes) {
      it(`does not change weights for "${eventType}" event`, () => {
        const profile = makeProfile({
          languageWeights: { TypeScript: 0.5 },
          topicWeights: { web: 0.3 },
          starRangeWeights: { '100-1000': 0.4 },
          authorWeights: { testuser: 0.6 },
        });
        const repo = makeRepo();

        const updated = updateProfileWeights(profile, repo, eventType);

        expect(updated.languageWeights['TypeScript']).toBe(0.5);
        expect(updated.topicWeights['web']).toBe(0.3);
        expect(updated.starRangeWeights['100-1000']).toBe(0.4);
        expect(updated.authorWeights['testuser']).toBe(0.6);
      });
    }
  });

  describe('new features (not yet in profile) are initialized from 0', () => {
    it('initializes language weight from 0 when not present', () => {
      const profile = makeProfile({ languageWeights: {} });
      const repo = makeRepo({ language: 'Rust' });

      const updated = updateProfileWeights(profile, repo, 'like');

      expect(updated.languageWeights['Rust']).toBeCloseTo(POSITIVE_LEARNING_RATE);
    });

    it('initializes topic weights from 0 when not present', () => {
      const profile = makeProfile({ topicWeights: {} });
      const repo = makeRepo({ topics: ['machine-learning', 'data-science'] });

      const updated = updateProfileWeights(profile, repo, 'favorite');

      expect(updated.topicWeights['machine-learning']).toBeCloseTo(POSITIVE_LEARNING_RATE);
      expect(updated.topicWeights['data-science']).toBeCloseTo(POSITIVE_LEARNING_RATE);
    });

    it('initializes star range weight from 0 when not present', () => {
      const profile = makeProfile({ starRangeWeights: {} });
      const repo = makeRepo({ starCount: 50000 });

      const updated = updateProfileWeights(profile, repo, 'follow');

      expect(updated.starRangeWeights['10000+']).toBeCloseTo(POSITIVE_LEARNING_RATE);
    });

    it('initializes author weight from 0 when not present', () => {
      const profile = makeProfile({ authorWeights: {} });
      const repo = makeRepo({ owner: 'newauthor' });

      const updated = updateProfileWeights(profile, repo, 'open_external');

      expect(updated.authorWeights['newauthor']).toBeCloseTo(POSITIVE_LEARNING_RATE);
    });

    it('initializes from 0 and decreases for negative feedback', () => {
      const profile = makeProfile({});
      const repo = makeRepo({ language: 'Go', topics: ['cli'], starCount: 5, owner: 'someuser' });

      const updated = updateProfileWeights(profile, repo, 'not_interested');

      expect(updated.languageWeights['Go']).toBeCloseTo(-NEGATIVE_RATE_NOT_INTERESTED);
      expect(updated.topicWeights['cli']).toBeCloseTo(-NEGATIVE_RATE_NOT_INTERESTED);
      expect(updated.starRangeWeights['0-10']).toBeCloseTo(-NEGATIVE_RATE_NOT_INTERESTED);
      expect(updated.authorWeights['someuser']).toBeCloseTo(-NEGATIVE_RATE_NOT_INTERESTED);
    });
  });

  describe('immutability', () => {
    it('returns a new object without mutating the input profile', () => {
      const profile = makeProfile({
        languageWeights: { TypeScript: 0.5 },
        topicWeights: { web: 0.3 },
        starRangeWeights: { '100-1000': 0.4 },
        authorWeights: { testuser: 0.6 },
      });
      const repo = makeRepo();

      const updated = updateProfileWeights(profile, repo, 'like');

      // Original profile is unchanged
      expect(profile.languageWeights['TypeScript']).toBe(0.5);
      expect(profile.topicWeights['web']).toBe(0.3);
      expect(profile.starRangeWeights['100-1000']).toBe(0.4);
      expect(profile.authorWeights['testuser']).toBe(0.6);

      // Updated profile is a different object
      expect(updated).not.toBe(profile);
      expect(updated.languageWeights).not.toBe(profile.languageWeights);
      expect(updated.topicWeights).not.toBe(profile.topicWeights);
      expect(updated.starRangeWeights).not.toBe(profile.starRangeWeights);
      expect(updated.authorWeights).not.toBe(profile.authorWeights);
    });
  });

  describe('null language handling', () => {
    it('does not update language weight when repo language is null', () => {
      const profile = makeProfile({ languageWeights: { TypeScript: 0.5 } });
      const repo = makeRepo({ language: null });

      const updated = updateProfileWeights(profile, repo, 'like');

      // Language weights unchanged (no null key added)
      expect(updated.languageWeights).toEqual({ TypeScript: 0.5 });
    });
  });

  describe('empty topics handling', () => {
    it('does not update topic weights when repo has no topics', () => {
      const profile = makeProfile({ topicWeights: { web: 0.5 } });
      const repo = makeRepo({ topics: [] });

      const updated = updateProfileWeights(profile, repo, 'like');

      // Topic weights unchanged
      expect(updated.topicWeights).toEqual({ web: 0.5 });
    });
  });
});
