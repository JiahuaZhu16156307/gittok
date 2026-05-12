/**
 * User-related type definitions for GitTok.
 */

import type { FeatureWeights } from './recommendation';

/** User profile containing feature weights for recommendations */
export interface UserProfile {
  id: string;
  userId: string;
  languageWeights: FeatureWeights;
  topicWeights: FeatureWeights;
  starRangeWeights: FeatureWeights;
  authorWeights: FeatureWeights;
  totalInteractions: number;
}

/** User settings for content filtering preferences */
export interface UserSettings {
  id: string;
  userId: string;
  blockForks: boolean;
  blockedLanguages: string[];
}

/** Response from the session/auth endpoint */
export interface SessionResponse {
  user: {
    id: string;
    name: string;
    avatar: string;
    githubToken: string;
  } | null;
  expires: string;
}
