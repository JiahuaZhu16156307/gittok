import { describe, it, expect } from 'vitest';
import { getStarRangeBucket, scoreRepo, rankRepos } from '@/services/recommendation-engine';
import type { UserProfile, RepoCard } from '@/lib/types';

/**
 * Unit tests for the recommendation scoring engine.
 * Validates Requirements 6.1 (scoring and sorting) and 6.2 (four-dimension scoring).
 */

// --- Test Fixtures ---

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    languageWeights: {},
    topicWeights: {},
    starRangeWeights: {},
    authorWeights: {},
    totalInteractions: 50,
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
    readmeSummary: 'This is a test repo',
    lastCommitAt: new Date('2024-06-01'),
    defaultBranch: 'main',
    updatedAt: new Date('2024-06-01'),
    ...overrides,
  };
}

// --- getStarRangeBucket tests ---

describe('getStarRangeBucket', () => {
  it('should return "0-10" for star counts 0-10', () => {
    expect(getStarRangeBucket(0)).toBe('0-10');
    expect(getStarRangeBucket(5)).toBe('0-10');
    expect(getStarRangeBucket(10)).toBe('0-10');
  });

  it('should return "10-100" for star counts 11-100', () => {
    expect(getStarRangeBucket(11)).toBe('10-100');
    expect(getStarRangeBucket(50)).toBe('10-100');
    expect(getStarRangeBucket(100)).toBe('10-100');
  });

  it('should return "100-1000" for star counts 101-1000', () => {
    expect(getStarRangeBucket(101)).toBe('100-1000');
    expect(getStarRangeBucket(500)).toBe('100-1000');
    expect(getStarRangeBucket(1000)).toBe('100-1000');
  });

  it('should return "1000-10000" for star counts 1001-10000', () => {
    expect(getStarRangeBucket(1001)).toBe('1000-10000');
    expect(getStarRangeBucket(5000)).toBe('1000-10000');
    expect(getStarRangeBucket(10000)).toBe('1000-10000');
  });

  it('should return "10000+" for star counts above 10000', () => {
    expect(getStarRangeBucket(10001)).toBe('10000+');
    expect(getStarRangeBucket(100000)).toBe('10000+');
    expect(getStarRangeBucket(500000)).toBe('10000+');
  });
});

// --- scoreRepo tests ---

describe('scoreRepo', () => {
  it('should return 0 for an empty profile', () => {
    const profile = makeProfile();
    const repo = makeRepo();
    expect(scoreRepo(profile, repo)).toBe(0);
  });

  it('should increase score when profile has matching language weight', () => {
    const profileWithoutLang = makeProfile();
    const profileWithLang = makeProfile({ languageWeights: { TypeScript: 0.8 } });
    const repo = makeRepo({ language: 'TypeScript' });

    const scoreWithout = scoreRepo(profileWithoutLang, repo);
    const scoreWith = scoreRepo(profileWithLang, repo);

    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('should increase score when profile has matching topic weights', () => {
    const profileWithoutTopics = makeProfile();
    const profileWithTopics = makeProfile({ topicWeights: { web: 0.6, frontend: 0.4 } });
    const repo = makeRepo({ topics: ['web', 'frontend'] });

    const scoreWithout = scoreRepo(profileWithoutTopics, repo);
    const scoreWith = scoreRepo(profileWithTopics, repo);

    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('should increase score when profile has matching star range weight', () => {
    const profileWithoutStars = makeProfile();
    const profileWithStars = makeProfile({ starRangeWeights: { '100-1000': 0.7 } });
    const repo = makeRepo({ starCount: 500 }); // falls in 100-1000 bucket

    const scoreWithout = scoreRepo(profileWithoutStars, repo);
    const scoreWith = scoreRepo(profileWithStars, repo);

    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('should increase score when profile has matching author weight', () => {
    const profileWithoutAuthor = makeProfile();
    const profileWithAuthor = makeProfile({ authorWeights: { testuser: 0.9 } });
    const repo = makeRepo({ owner: 'testuser' });

    const scoreWithout = scoreRepo(profileWithoutAuthor, repo);
    const scoreWith = scoreRepo(profileWithAuthor, repo);

    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('should sum contributions from all four dimensions', () => {
    const profile = makeProfile({
      languageWeights: { TypeScript: 0.5 },
      topicWeights: { web: 0.3, frontend: 0.2 },
      starRangeWeights: { '100-1000': 0.4 },
      authorWeights: { testuser: 0.6 },
    });
    const repo = makeRepo({
      language: 'TypeScript',
      topics: ['web', 'frontend'],
      starCount: 500,
      owner: 'testuser',
    });

    const score = scoreRepo(profile, repo);

    // Expected: 0.5 (lang) + 0.3 + 0.2 (topics) + 0.4 (stars) + 0.6 (author) = 2.0
    expect(score).toBeCloseTo(2.0, 5);
  });

  it('should not contribute language score when repo has null language', () => {
    const profile = makeProfile({ languageWeights: { TypeScript: 0.8 } });
    const repoWithLang = makeRepo({ language: 'TypeScript', topics: [], owner: 'nobody', starCount: 0 });
    const repoWithoutLang = makeRepo({ language: null, topics: [], owner: 'nobody', starCount: 0 });

    const scoreWithLang = scoreRepo(profile, repoWithLang);
    const scoreWithoutLang = scoreRepo(profile, repoWithoutLang);

    expect(scoreWithLang).toBeGreaterThan(scoreWithoutLang);
    expect(scoreWithoutLang).toBe(0);
  });

  it('should not contribute topic score when repo has empty topics', () => {
    const profile = makeProfile({ topicWeights: { web: 0.5 } });
    const repoWithTopics = makeRepo({ language: null, topics: ['web'], owner: 'nobody', starCount: 0 });
    const repoWithoutTopics = makeRepo({ language: null, topics: [], owner: 'nobody', starCount: 0 });

    const scoreWithTopics = scoreRepo(profile, repoWithTopics);
    const scoreWithoutTopics = scoreRepo(profile, repoWithoutTopics);

    expect(scoreWithTopics).toBeGreaterThan(scoreWithoutTopics);
    expect(scoreWithoutTopics).toBe(0);
  });

  it('should handle negative weights correctly', () => {
    const profile = makeProfile({
      languageWeights: { TypeScript: -0.5 },
      authorWeights: { testuser: 0.9 },
    });
    const repo = makeRepo({ language: 'TypeScript', owner: 'testuser' });

    const score = scoreRepo(profile, repo);
    // -0.5 + 0.9 = 0.4
    expect(score).toBeCloseTo(0.4, 5);
  });
});

// --- rankRepos tests ---

describe('rankRepos', () => {
  it('should sort repos in descending score order', () => {
    const profile = makeProfile({ languageWeights: { Rust: 0.9, TypeScript: 0.5, Python: 0.2 } });
    const repoLow = makeRepo({ id: 'low', language: 'Python', owner: 'a', fullName: 'a/low', topics: [] });
    const repoHigh = makeRepo({ id: 'high', language: 'Rust', owner: 'b', fullName: 'b/high', topics: [] });
    const repoMid = makeRepo({ id: 'mid', language: 'TypeScript', owner: 'c', fullName: 'c/mid', topics: [] });
    const repos: RepoCard[] = [repoLow, repoHigh, repoMid];

    const ranked = rankRepos(profile, repos);

    expect(ranked[0].repo.id).toBe('high');
    expect(ranked[1].repo.id).toBe('mid');
    expect(ranked[2].repo.id).toBe('low');
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
  });

  it('should return empty array for empty repos list', () => {
    const profile = makeProfile();
    const ranked = rankRepos(profile, []);
    expect(ranked).toEqual([]);
  });

  it('should include score and explanation in each result', () => {
    const profile = makeProfile({ languageWeights: { TypeScript: 0.7 } });
    const repos = [makeRepo({ language: 'TypeScript' })];

    const ranked = rankRepos(profile, repos);

    expect(ranked[0].score).toBeCloseTo(0.7, 5);
    expect(ranked[0].explanation).toContain('TypeScript');
    expect(ranked[0].isExploration).toBe(false);
  });

  it('should produce correct scores reflecting all four dimensions', () => {
    const profile = makeProfile({
      languageWeights: { Rust: 0.3 },
      topicWeights: { cli: 0.4 },
      starRangeWeights: { '1000-10000': 0.2 },
      authorWeights: { rustdev: 0.5 },
    });

    const repo = makeRepo({
      language: 'Rust',
      topics: ['cli'],
      starCount: 5000,
      owner: 'rustdev',
    });

    const ranked = rankRepos(profile, [repo]);

    // 0.3 + 0.4 + 0.2 + 0.5 = 1.4
    expect(ranked[0].score).toBeCloseTo(1.4, 5);
  });

  it('should handle ties by maintaining stable order', () => {
    const profile = makeProfile();
    const repos = [
      makeRepo({ id: 'first', owner: 'a' }),
      makeRepo({ id: 'second', owner: 'b' }),
    ];

    const ranked = rankRepos(profile, repos);

    // Both have score 0, order should be stable
    expect(ranked).toHaveLength(2);
    expect(ranked[0].score).toBe(ranked[1].score);
  });
});
