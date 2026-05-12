/**
 * Recommendation explainer service for GitTok.
 * Provides detailed explanations of why a repository was recommended,
 * including feature contributions sorted by value and human-readable reason strings.
 */

import type { UserProfile, RepoCard, Explanation } from '@/lib/types';
import { getStarRangeBucket } from './recommendation-engine';

/** A single feature contribution to the recommendation score */
interface FeatureContribution {
  feature: string;
  contribution: number;
}

/**
 * Generates a detailed recommendation explanation for a given user profile and repository.
 * Calculates the contribution of each feature dimension and returns them sorted by value,
 * along with a human-readable reason string based on the top contributing feature.
 */
export function getRecommendationExplanation(
  profile: UserProfile,
  repo: RepoCard
): Explanation {
  const contributions: FeatureContribution[] = [];

  // Language dimension
  if (repo.language && profile.languageWeights[repo.language] !== undefined) {
    contributions.push({
      feature: `language:${repo.language}`,
      contribution: profile.languageWeights[repo.language],
    });
  }

  // Topics dimension
  for (const topic of repo.topics) {
    if (profile.topicWeights[topic] !== undefined) {
      contributions.push({
        feature: `topic:${topic}`,
        contribution: profile.topicWeights[topic],
      });
    }
  }

  // Star range dimension
  const starBucket = getStarRangeBucket(repo.starCount);
  if (profile.starRangeWeights[starBucket] !== undefined) {
    contributions.push({
      feature: `stars:${starBucket}`,
      contribution: profile.starRangeWeights[starBucket],
    });
  }

  // Author dimension
  if (profile.authorWeights[repo.owner] !== undefined) {
    contributions.push({
      feature: `author:${repo.owner}`,
      contribution: profile.authorWeights[repo.owner],
    });
  }

  // Sort by contribution descending
  contributions.sort((a, b) => b.contribution - a.contribution);

  const reason = generateReason(contributions);

  return {
    topFeatures: contributions,
    reason,
  };
}

/**
 * Generates a human-readable reason string based on the top contributing feature.
 */
function generateReason(contributions: FeatureContribution[]): string {
  if (contributions.length === 0) {
    return '探索性推荐';
  }

  const top = contributions[0];

  if (top.feature.startsWith('language:')) {
    const language = top.feature.replace('language:', '');
    return `因为你喜欢 ${language} 项目`;
  }

  if (top.feature.startsWith('topic:')) {
    const topic = top.feature.replace('topic:', '');
    return `因为你对 ${topic} 感兴趣`;
  }

  if (top.feature.startsWith('author:')) {
    const author = top.feature.replace('author:', '');
    return `因为你关注了 ${author}`;
  }

  if (top.feature.startsWith('stars:')) {
    const range = top.feature.replace('stars:', '');
    return `因为你偏好 ${range} Star 区间的项目`;
  }

  return '探索性推荐';
}
