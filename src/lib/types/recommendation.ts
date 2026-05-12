/**
 * Recommendation engine type definitions for GitTok.
 */

/** Feature weights map: key is the feature value, value is the weight */
export type FeatureWeights = Record<string, number>;

/** GitHub API rate limit information */
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}
