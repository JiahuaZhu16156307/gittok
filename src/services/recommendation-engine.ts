/**
 * Recommendation engine for GitTok.
 * Implements content-based scoring using a weighted dot product across four feature dimensions:
 * 1. Language — match between repo language and user language preferences
 * 2. Topics — overlap between repo topics and user topic preferences
 * 3. Star Range — repo star count bucket vs user star range preferences
 * 4. Author — repo owner vs user author preferences
 */

import type { UserProfile, RepoCard, ScoredRepo } from '@/lib/types';

/** Star range bucket boundaries */
const STAR_RANGE_BUCKETS = [
  { max: 10, key: '0-10' },
  { max: 100, key: '10-100' },
  { max: 1000, key: '100-1000' },
  { max: 10000, key: '1000-10000' },
] as const;

const STAR_RANGE_TOP_KEY = '10000+';

/**
 * Maps a star count to its corresponding bucket key.
 * Buckets: 0-10, 10-100, 100-1000, 1000-10000, 10000+
 */
export function getStarRangeBucket(starCount: number): string {
  for (const bucket of STAR_RANGE_BUCKETS) {
    if (starCount <= bucket.max) {
      return bucket.key;
    }
  }
  return STAR_RANGE_TOP_KEY;
}

/**
 * Scores a single repository against a user profile using a weighted dot product
 * across four feature dimensions.
 *
 * score = languageScore + topicsScore + starRangeScore + authorScore
 *
 * Each dimension contributes independently to the final score.
 */
export function scoreRepo(profile: UserProfile, repo: RepoCard): number {
  let score = 0;

  // Dimension 1: Language
  if (repo.language && profile.languageWeights[repo.language] !== undefined) {
    score += profile.languageWeights[repo.language] * 1.0;
  }

  // Dimension 2: Topics
  for (const topic of repo.topics) {
    if (profile.topicWeights[topic] !== undefined) {
      score += profile.topicWeights[topic];
    }
  }

  // Dimension 3: Star Range
  const starBucket = getStarRangeBucket(repo.starCount);
  if (profile.starRangeWeights[starBucket] !== undefined) {
    score += profile.starRangeWeights[starBucket];
  }

  // Dimension 4: Author
  if (profile.authorWeights[repo.owner] !== undefined) {
    score += profile.authorWeights[repo.owner];
  }

  return score;
}

/**
 * Scores and sorts a list of repositories in descending order by recommendation score.
 * Returns ScoredRepo objects with score, explanation, and exploration flag.
 */
export function rankRepos(profile: UserProfile, repos: RepoCard[]): ScoredRepo[] {
  const scored: ScoredRepo[] = repos.map((repo) => {
    const score = scoreRepo(profile, repo);
    const explanation = buildExplanation(profile, repo);
    return {
      repo,
      score,
      explanation,
      isExploration: false,
    };
  });

  // Sort in descending order by score
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * Builds a human-readable explanation of why a repo was recommended.
 */
function buildExplanation(profile: UserProfile, repo: RepoCard): string {
  const contributions: { feature: string; value: number }[] = [];

  if (repo.language && profile.languageWeights[repo.language] !== undefined) {
    contributions.push({
      feature: `language:${repo.language}`,
      value: profile.languageWeights[repo.language],
    });
  }

  for (const topic of repo.topics) {
    if (profile.topicWeights[topic] !== undefined) {
      contributions.push({
        feature: `topic:${topic}`,
        value: profile.topicWeights[topic],
      });
    }
  }

  const starBucket = getStarRangeBucket(repo.starCount);
  if (profile.starRangeWeights[starBucket] !== undefined) {
    contributions.push({
      feature: `stars:${starBucket}`,
      value: profile.starRangeWeights[starBucket],
    });
  }

  if (profile.authorWeights[repo.owner] !== undefined) {
    contributions.push({
      feature: `author:${repo.owner}`,
      value: profile.authorWeights[repo.owner],
    });
  }

  // Sort by contribution value descending
  contributions.sort((a, b) => b.value - a.value);

  if (contributions.length === 0) {
    return '探索性推荐';
  }

  const top = contributions[0];
  if (top.feature.startsWith('language:')) {
    return `因为你喜欢 ${top.feature.replace('language:', '')} 项目`;
  }
  if (top.feature.startsWith('topic:')) {
    return `因为你对 ${top.feature.replace('topic:', '')} 感兴趣`;
  }
  if (top.feature.startsWith('author:')) {
    return `因为你关注了 ${top.feature.replace('author:', '')}`;
  }
  if (top.feature.startsWith('stars:')) {
    return `因为你偏好 ${top.feature.replace('stars:', '')} Star 区间的项目`;
  }

  return '基于你的浏览历史推荐';
}
