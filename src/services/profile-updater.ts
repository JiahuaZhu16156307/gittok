/**
 * Profile weight update logic for the recommendation engine.
 *
 * Updates user profile feature weights based on interaction events.
 * Positive feedback increases weights; negative feedback decreases them.
 * All weights are clamped to [-1.0, 1.0].
 */

import type { UserProfile } from '@/lib/types/user';
import type { RepoCard } from '@/lib/types/repo';
import type { InteractionType } from '@/lib/types/interaction';

// --- Learning rate constants ---

/** α — weight increase for positive feedback events */
export const POSITIVE_LEARNING_RATE = 0.1;

/** β — weight decrease for "not_interested" events */
export const NEGATIVE_RATE_NOT_INTERESTED = 0.15;

/** β — weight decrease for "quick_skip" events */
export const NEGATIVE_RATE_QUICK_SKIP = 0.03;

/** Minimum allowed weight value */
export const WEIGHT_MIN = -1.0;

/** Maximum allowed weight value */
export const WEIGHT_MAX = 1.0;

// --- Positive and negative event type sets ---

const POSITIVE_EVENT_TYPES: ReadonlySet<InteractionType> = new Set<InteractionType>([
  'like',
  'favorite',
  'follow',
  'open_external',
  'view',
]);

const NEGATIVE_EVENT_TYPES: ReadonlySet<InteractionType> = new Set<InteractionType>([
  'not_interested',
  'quick_skip',
]);

// --- Star range bucket helper ---

/**
 * Maps a star count to a bucket string used as a key in starRangeWeights.
 */
export function getStarRangeBucket(starCount: number): string {
  if (starCount < 10) return '0-10';
  if (starCount < 100) return '10-100';
  if (starCount < 1000) return '100-1000';
  if (starCount < 10000) return '1000-10000';
  return '10000+';
}

// --- Weight utility functions ---

/**
 * Clamps a weight value to the range [WEIGHT_MIN, WEIGHT_MAX].
 */
export function clampWeight(value: number): number {
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, value));
}

/**
 * Adds a delta to the current weight and clamps the result.
 */
export function adjustWeight(current: number, delta: number): number {
  return clampWeight(current + delta);
}

// --- Main profile update function ---

/**
 * Updates user profile feature weights based on an interaction event.
 *
 * Returns a NEW UserProfile object (immutable update).
 *
 * For positive events (like, favorite, follow, open_external, view with dwell >= 1000ms):
 *   - Increases weights by POSITIVE_LEARNING_RATE (α = 0.1)
 *
 * For negative events:
 *   - not_interested: decreases weights by NEGATIVE_RATE_NOT_INTERESTED (β = 0.15)
 *   - quick_skip: decreases weights by NEGATIVE_RATE_QUICK_SKIP (β = 0.03)
 *
 * Features updated: language, topics, star range, author.
 */
export function updateProfileWeights(
  profile: UserProfile,
  repo: RepoCard,
  eventType: InteractionType
): UserProfile {
  let delta: number;

  if (POSITIVE_EVENT_TYPES.has(eventType)) {
    delta = POSITIVE_LEARNING_RATE;
  } else if (eventType === 'not_interested') {
    delta = -NEGATIVE_RATE_NOT_INTERESTED;
  } else if (eventType === 'quick_skip') {
    delta = -NEGATIVE_RATE_QUICK_SKIP;
  } else {
    // Neutral events (unlike, unfavorite, unfollow) don't change weights
    return { ...profile };
  }

  // Clone weight maps
  const languageWeights = { ...profile.languageWeights };
  const topicWeights = { ...profile.topicWeights };
  const starRangeWeights = { ...profile.starRangeWeights };
  const authorWeights = { ...profile.authorWeights };

  // Update language weight
  if (repo.language) {
    const currentLangWeight = languageWeights[repo.language] ?? 0;
    languageWeights[repo.language] = adjustWeight(currentLangWeight, delta);
  }

  // Update topic weights
  for (const topic of repo.topics) {
    const currentTopicWeight = topicWeights[topic] ?? 0;
    topicWeights[topic] = adjustWeight(currentTopicWeight, delta);
  }

  // Update star range weight
  const bucket = getStarRangeBucket(repo.starCount);
  const currentStarWeight = starRangeWeights[bucket] ?? 0;
  starRangeWeights[bucket] = adjustWeight(currentStarWeight, delta);

  // Update author weight
  const currentAuthorWeight = authorWeights[repo.owner] ?? 0;
  authorWeights[repo.owner] = adjustWeight(currentAuthorWeight, delta);

  return {
    ...profile,
    languageWeights,
    topicWeights,
    starRangeWeights,
    authorWeights,
  };
}
