/**
 * Feed-related type definitions for GitTok.
 */

import type { RepoCard } from './repo';

/** Request parameters for fetching the feed */
export interface FeedRequest {
  cursor?: string;
  limit?: number;
}

/** Response from the feed API */
export interface FeedResponse {
  cards: RepoCard[];
  nextCursor: string | null;
  hasMore: boolean;
}
