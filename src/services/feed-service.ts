/**
 * Feed service for GitTok.
 *
 * Orchestrates the feed generation pipeline:
 * 1. Get user profile (via profile-service)
 * 2. Determine strategy: cold start vs profile-based
 * 3. Fetch candidate repos (cold start or GitHub trending/search)
 * 4. Apply content filters (filter-service)
 * 5. Check negative feedback suppression
 * 6. Generate recommendations (feed-generator with exploration diversity)
 * 7. Mark delivered repos in session
 * 8. Return paginated FeedResponse with cursor
 *
 * Validates: Requirements 3.4, 6.1, 10.2, 11.1-11.6
 */

import type { FeedResponse, RepoCard, UserProfile, UserSettings, ScoredRepo } from '@/lib/types';
import type { IGitHubClient } from './github-client';
import type { IFilterService } from './filter-service';
import { shouldUseColdStart, generateColdStartCandidates, scoreColdStartRepos } from './cold-start-strategy';
import { generateRecommendations, markDelivered as markDeliveredInSession } from './feed-generator';
import { getSuppressionStatus } from './negative-feedback-service';

/** Default batch size */
const DEFAULT_LIMIT = 10;

/** Cursor structure for offset-based pagination */
interface CursorData {
  offset: number;
}

/** Parameters for getNextBatch */
export interface GetNextBatchParams {
  userId: string;
  sessionId: string;
  cursor?: string;
  limit?: number;
}

/** Dependencies injected into the feed service */
export interface FeedServiceDeps {
  getProfile: (userId: string) => Promise<UserProfile | null>;
  createDefaultProfile: (userId: string) => UserProfile;
  getUserSettings: (userId: string) => Promise<UserSettings>;
  githubClient: IGitHubClient;
  filterService: IFilterService;
  checkSuppression: (userId: string, repo: RepoCard) => Promise<{ blocked: boolean; reason?: string }>;
  generateRecommendations: typeof generateRecommendations;
  markDelivered: typeof markDeliveredInSession;
}

/** Interface for the feed service */
export interface IFeedService {
  getNextBatch(params: GetNextBatchParams): Promise<FeedResponse>;
  markDelivered(userId: string, sessionId: string, repoIds: string[]): Promise<void>;
}

/**
 * Parses a cursor string into offset data.
 * Returns offset 0 if cursor is null/undefined or invalid.
 */
export function parseCursor(cursor?: string): CursorData {
  if (!cursor) {
    return { offset: 0 };
  }
  try {
    const data = JSON.parse(cursor) as CursorData;
    if (typeof data.offset === 'number' && data.offset >= 0) {
      return data;
    }
    return { offset: 0 };
  } catch {
    return { offset: 0 };
  }
}

/**
 * Encodes cursor data into a string for the client.
 */
export function encodeCursor(data: CursorData): string {
  return JSON.stringify(data);
}

/**
 * Creates a feed service instance with the given dependencies.
 */
export function createFeedService(deps: FeedServiceDeps): IFeedService {
  return {
    async getNextBatch(params: GetNextBatchParams): Promise<FeedResponse> {
      const { userId, sessionId, cursor, limit = DEFAULT_LIMIT } = params;

      // 1. Get user profile
      const profile = (await deps.getProfile(userId)) ?? deps.createDefaultProfile(userId);

      // 2. Get user settings for filtering
      const userSettings = await deps.getUserSettings(userId);

      // 3. Parse cursor to determine which "page" of GitHub results to fetch
      const { offset } = parseCursor(cursor);
      // Use the batch number (offset / limit) to rotate queries each fetch
      const batchNumber = Math.floor(offset / limit);

      // 4. Get candidates — rotate through diverse search strategies so
      //    each fetch returns different repos (prevents "no more data").
      let candidates: RepoCard[];
      try {
        const daysAgo = (n: number) =>
          new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const searchQueries = [
          'stars:>1000',
          'stars:>5000',
          'stars:>1000',
          'stars:500..5000',
          'stars:100..500',
          'stars:>500 language:TypeScript',
          'stars:>500 language:Python',
          'stars:>500 language:Rust',
          'stars:>500 language:Go',
          'stars:>500 language:JavaScript',
          'stars:>500 language:Java',
          'stars:>300 language:C++',
          'stars:>300 language:Swift',
          'stars:>300 language:Kotlin',
          `stars:>100 pushed:>${daysAgo(7)}`,
          `stars:>50 pushed:>${daysAgo(3)}`,
          'stars:>1000 topic:ai',
          'stars:>1000 topic:machine-learning',
          'stars:>500 topic:web',
          'stars:>500 topic:cli',
        ];
        const query = searchQueries[batchNumber % searchQueries.length];
        // GitHub Search API page (1-indexed); rotate pages after cycling all queries
        const githubSearchPage = Math.floor(batchNumber / searchQueries.length) + 1;

        candidates = await deps.githubClient.searchRepos(
          query,
          'stars',
          Math.min(limit * 5, 100), // Fetch 5x what we need to account for dedup+filtering
          githubSearchPage
        );
      } catch (err) {
        console.error('[FeedService] GitHub search failed, using cold start:', err);
        candidates = await generateColdStartCandidates(deps.githubClient);
      }

      // 5. Apply content filters (archived, low-quality, forks, blocked languages)
      candidates = deps.filterService.applyFilters(candidates, userSettings);

      // 5. Check negative feedback suppression for each candidate
      const suppressionResults = await Promise.all(
        candidates.map(async (repo) => {
          const status = await deps.checkSuppression(userId, repo);
          return { repo, blocked: status.blocked };
        })
      );
      candidates = suppressionResults
        .filter((r) => !r.blocked)
        .map((r) => r.repo);

      // 6. Generate recommendations with exploration diversity
      const scored = await deps.generateRecommendations({
        userId,
        sessionId,
        profile,
        candidates,
        count: limit,
      });

      // 7. Apply cursor-based pagination (offset already parsed in step 3)
      const paginatedScored = scored.slice(0, limit);

      // 8. Build cards from scored results
      const cards: RepoCard[] = paginatedScored.map((s) => s.repo);

      // 9. Mark delivered repos in session
      if (cards.length > 0) {
        const repoIds = cards.map((c) => c.id);
        await deps.markDelivered(userId, sessionId, repoIds);
      }

      // 10. Determine pagination state — always hasMore since GitHub has infinite repos
      const hasMore = cards.length >= limit;
      const nextCursor = hasMore
        ? encodeCursor({ offset: offset + limit })
        : null;

      return {
        cards,
        nextCursor,
        hasMore,
      };
    },

    async markDelivered(userId: string, sessionId: string, repoIds: string[]): Promise<void> {
      await deps.markDelivered(userId, sessionId, repoIds);
    },
  };
}
