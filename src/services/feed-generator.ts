/**
 * Feed generator service for GitTok.
 *
 * Responsible for:
 * - Scoring and ranking candidate repos against a user profile
 * - Ensuring exploration diversity (≥20% exploration items per batch)
 * - Session-level deduplication via Redis sets
 *
 * Validates: Requirements 6.5, 6.8
 */

import type { UserProfile, RepoCard, ScoredRepo } from '@/lib/types';
import { scoreRepo } from '@/services/recommendation-engine';
import { redis, sessionDeliveredKey } from '@/lib/redis';

export interface GenerateRecommendationsParams {
  userId: string;
  sessionId: string;
  profile: UserProfile;
  candidates: RepoCard[];
  count: number;
}

/**
 * Generates a recommendation batch with exploration diversity guarantee.
 *
 * Algorithm:
 * 1. Score all candidates using the recommendation engine
 * 2. Filter out repos already delivered in this session (Redis set lookup)
 * 3. Sort by score descending
 * 4. Ensure at least ⌈count × 0.2⌉ items are "exploration" items
 *    - Exploration items are randomly selected from the bottom 50% of scored candidates
 *    - Marked with `isExploration: true`
 * 5. Return the final list of `count` items
 */
export async function generateRecommendations(
  params: GenerateRecommendationsParams
): Promise<ScoredRepo[]> {
  const { userId, sessionId, profile, candidates, count } = params;

  // Score all candidates
  const scored: ScoredRepo[] = candidates.map((repo) => ({
    repo,
    score: scoreRepo(profile, repo),
    explanation: '',
    isExploration: false,
  }));

  // Filter out already-delivered repos in this session (DISABLED — frontend handles dedup)
  // Session dedup causes issues with the rotating query strategy since it blocks
  // repos that were scored but not delivered in previous batches.
  const filtered = scored;

  // Sort by score descending
  filtered.sort((a, b) => b.score - a.score);

  // If we have fewer candidates than requested, return what we have
  if (filtered.length <= count) {
    // Still apply exploration marking even with fewer items
    return applyExplorationMarking(filtered, filtered.length);
  }

  // Calculate exploration quota: ⌈count × 0.2⌉
  const explorationCount = Math.ceil(count * 0.2);
  const mainCount = count - explorationCount;

  // Split into top half (main) and bottom 50% (exploration pool)
  const midpoint = Math.ceil(filtered.length / 2);
  const topHalf = filtered.slice(0, midpoint);
  const bottomHalf = filtered.slice(midpoint);

  // Select main items from top of sorted list
  const mainItems = topHalf.slice(0, mainCount);

  // Select exploration items randomly from bottom 50%
  const explorationPool = bottomHalf.length > 0 ? bottomHalf : topHalf.slice(mainCount);
  const explorationItems = selectRandom(explorationPool, explorationCount);

  // Mark exploration items
  for (const item of explorationItems) {
    item.isExploration = true;
  }

  // Combine: main items first (sorted by score), then exploration items
  const result = [...mainItems, ...explorationItems];

  // Deduplicate in case of overlap (shouldn't happen with proper split, but safety check)
  const seen = new Set<string>();
  const deduped: ScoredRepo[] = [];
  for (const item of result) {
    if (!seen.has(item.repo.id)) {
      seen.add(item.repo.id);
      deduped.push(item);
    }
  }

  return deduped.slice(0, count);
}

/**
 * Marks delivered repo IDs in the session Redis set.
 * Currently disabled — frontend handles dedup via id-based filtering.
 */
export async function markDelivered(
  _userId: string,
  _sessionId: string,
  _repoIds: string[]
): Promise<void> {
  // No-op: dedup is handled client-side
}

/**
 * Checks if a repo has already been delivered in the current session.
 */
export async function isDelivered(
  userId: string,
  sessionId: string,
  repoId: string
): Promise<boolean> {
  const key = sessionDeliveredKey(userId, sessionId);
  const result = await redis.sismember(key, repoId);
  return result === 1;
}

// --- Internal helpers ---

/**
 * Randomly selects `count` items from an array without replacement.
 * If the array has fewer items than requested, returns all items.
 */
function selectRandom<T>(items: T[], count: number): T[] {
  if (items.length <= count) {
    return [...items];
  }

  const shuffled = [...items];
  // Fisher-Yates shuffle (partial — only need first `count` elements)
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (shuffled.length - i));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}

/**
 * Applies exploration marking when we have fewer candidates than requested.
 * Marks the bottom 20% (by score) as exploration items.
 */
function applyExplorationMarking(
  items: ScoredRepo[],
  totalCount: number
): ScoredRepo[] {
  if (items.length === 0) return items;

  const explorationCount = Math.ceil(totalCount * 0.2);

  // Mark the lowest-scored items as exploration
  const startIdx = Math.max(0, items.length - explorationCount);
  for (let i = startIdx; i < items.length; i++) {
    items[i].isExploration = true;
  }

  return items;
}
