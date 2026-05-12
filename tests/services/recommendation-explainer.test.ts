import { describe, it, expect } from 'vitest';
import { getRecommendationExplanation } from '@/services/recommendation-explainer';
import type { UserProfile, RepoCard } from '@/lib/types';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    languageWeights: {},
    topicWeights: {},
    starRangeWeights: {},
    authorWeights: {},
    totalInteractions: 10,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<RepoCard> = {}): RepoCard {
  return {
    id: 'repo-1',
    fullName: 'owner/repo',
    owner: 'owner',
    name: 'repo',
    description: 'A test repo',
    language: 'TypeScript',
    starCount: 500,
    forkCount: 50,
    topics: ['web', 'frontend'],
    isArchived: false,
    isFork: false,
    readmeSummary: 'README content',
    lastCommitAt: new Date(),
    defaultBranch: 'main',
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('getRecommendationExplanation', () => {
  describe('top features sorted by contribution', () => {
    it('returns features sorted in descending order by contribution', () => {
      const profile = makeProfile({
        languageWeights: { TypeScript: 0.3 },
        topicWeights: { web: 0.8, frontend: 0.2 },
        authorWeights: { owner: 0.5 },
      });
      const repo = makeRepo();

      const result = getRecommendationExplanation(profile, repo);

      expect(result.topFeatures.length).toBe(4);
      expect(result.topFeatures[0]).toEqual({ feature: 'topic:web', contribution: 0.8 });
      expect(result.topFeatures[1]).toEqual({ feature: 'author:owner', contribution: 0.5 });
      expect(result.topFeatures[2]).toEqual({ feature: 'language:TypeScript', contribution: 0.3 });
      expect(result.topFeatures[3]).toEqual({ feature: 'topic:frontend', contribution: 0.2 });
    });

    it('includes star range contribution when matching bucket exists', () => {
      const profile = makeProfile({
        starRangeWeights: { '100-1000': 0.6 },
      });
      const repo = makeRepo({ starCount: 500 });

      const result = getRecommendationExplanation(profile, repo);

      expect(result.topFeatures).toEqual([
        { feature: 'stars:100-1000', contribution: 0.6 },
      ]);
    });

    it('handles multiple contributing features correctly', () => {
      const profile = makeProfile({
        languageWeights: { Rust: 0.9 },
        topicWeights: { cli: 0.7, systems: 0.4 },
        starRangeWeights: { '1000-10000': 0.5 },
        authorWeights: { rustdev: 0.3 },
      });
      const repo = makeRepo({
        language: 'Rust',
        topics: ['cli', 'systems'],
        starCount: 5000,
        owner: 'rustdev',
      });

      const result = getRecommendationExplanation(profile, repo);

      expect(result.topFeatures.length).toBe(5);
      // Verify descending order
      for (let i = 0; i < result.topFeatures.length - 1; i++) {
        expect(result.topFeatures[i].contribution).toBeGreaterThanOrEqual(
          result.topFeatures[i + 1].contribution
        );
      }
      expect(result.topFeatures[0]).toEqual({ feature: 'language:Rust', contribution: 0.9 });
      expect(result.topFeatures[1]).toEqual({ feature: 'topic:cli', contribution: 0.7 });
    });
  });

  describe('reason string generation', () => {
    it('generates language reason when language is top feature', () => {
      const profile = makeProfile({
        languageWeights: { Rust: 0.9 },
      });
      const repo = makeRepo({ language: 'Rust', topics: [] });

      const result = getRecommendationExplanation(profile, repo);

      expect(result.reason).toBe('因为你喜欢 Rust 项目');
    });

    it('generates topic reason when topic is top feature', () => {
      const profile = makeProfile({
        topicWeights: { 'machine-learning': 0.9 },
      });
      const repo = makeRepo({ language: null, topics: ['machine-learning'] });

      const result = getRecommendationExplanation(profile, repo);

      expect(result.reason).toBe('因为你对 machine-learning 感兴趣');
    });

    it('generates author reason when author is top feature', () => {
      const profile = makeProfile({
        authorWeights: { torvalds: 0.95 },
      });
      const repo = makeRepo({ language: null, topics: [], owner: 'torvalds' });

      const result = getRecommendationExplanation(profile, repo);

      expect(result.reason).toBe('因为你关注了 torvalds');
    });

    it('generates star range reason when star range is top feature', () => {
      const profile = makeProfile({
        starRangeWeights: { '10000+': 0.8 },
      });
      const repo = makeRepo({ language: null, topics: [], starCount: 50000 });

      const result = getRecommendationExplanation(profile, repo);

      expect(result.reason).toBe('因为你偏好 10000+ Star 区间的项目');
    });

    it('returns "探索性推荐" when no features match', () => {
      const profile = makeProfile({
        languageWeights: { Python: 0.8 },
        topicWeights: { ai: 0.7 },
        authorWeights: { someoneelse: 0.6 },
        starRangeWeights: { '10000+': 0.5 },
      });
      const repo = makeRepo({
        language: 'Go',
        topics: ['networking'],
        owner: 'differentowner',
        starCount: 50,
      });

      const result = getRecommendationExplanation(profile, repo);

      expect(result.topFeatures).toEqual([]);
      expect(result.reason).toBe('探索性推荐');
    });
  });

  describe('edge cases', () => {
    it('handles repo with null language', () => {
      const profile = makeProfile({
        languageWeights: { TypeScript: 0.8 },
        topicWeights: { web: 0.5 },
      });
      const repo = makeRepo({ language: null, topics: ['web'] });

      const result = getRecommendationExplanation(profile, repo);

      expect(result.topFeatures).toEqual([
        { feature: 'topic:web', contribution: 0.5 },
      ]);
      expect(result.reason).toBe('因为你对 web 感兴趣');
    });

    it('handles repo with empty topics', () => {
      const profile = makeProfile({
        languageWeights: { TypeScript: 0.6 },
        topicWeights: { web: 0.9 },
      });
      const repo = makeRepo({ topics: [] });

      const result = getRecommendationExplanation(profile, repo);

      expect(result.topFeatures).toEqual([
        { feature: 'language:TypeScript', contribution: 0.6 },
      ]);
    });

    it('handles empty profile weights', () => {
      const profile = makeProfile();
      const repo = makeRepo();

      const result = getRecommendationExplanation(profile, repo);

      expect(result.topFeatures).toEqual([]);
      expect(result.reason).toBe('探索性推荐');
    });
  });
});
