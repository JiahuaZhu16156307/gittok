/**
 * Cold start strategy for GitTok.
 * Used when a user has insufficient interaction history (< 10 events)
 * to generate profile-based recommendations.
 *
 * Strategy: Use trending repos from the last 7 days across popular languages
 * and score them based on star count and recency.
 */

import type { IGitHubClient } from './github-client';
import type { UserProfile, RepoCard, ScoredRepo } from '@/lib/types';

/** Minimum interactions before profile-based scoring kicks in */
export const COLD_START_THRESHOLD = 10;

/** Popular languages to fetch trending repos for during cold start */
const POPULAR_LANGUAGES = ['TypeScript', 'Python', 'Rust', 'Go', 'Java'];

/**
 * Determines whether the cold start strategy should be used for a given user.
 * Returns true if the user has fewer than COLD_START_THRESHOLD total interactions.
 */
export function shouldUseColdStart(profile: UserProfile): boolean {
  return profile.totalInteractions < COLD_START_THRESHOLD;
}

/**
 * Generates cold start candidate repos by fetching trending repos from the last 7 days.
 * Fetches general trending repos plus trending repos for each popular language,
 * then deduplicates by repo ID.
 */
export async function generateColdStartCandidates(
  githubClient: IGitHubClient
): Promise<RepoCard[]> {
  // Fetch general trending repos only (single API call for speed)
  // The search query already returns diverse results across languages
  const trending = await githubClient.fetchTrendingRepos(undefined, 'weekly');

  // Deduplicate by repo ID (shouldn't have dupes from single call, but safety)
  const seen = new Set<string>();
  const deduplicated: RepoCard[] = [];

  for (const repo of trending) {
    if (!seen.has(repo.id)) {
      seen.add(repo.id);
      deduplicated.push(repo);
    }
  }

  return deduplicated;
}

/**
 * Scores cold start repos based on star count (normalized via log10) and recency.
 *
 * Formula:
 *   score = log10(starCount + 1) * 0.5 + recencyBonus
 *   recencyBonus = max(0, 1 - daysSinceLastCommit / 30) * 0.5
 *
 * All items are marked as isExploration: false (cold start items are not exploration per se).
 * Results are sorted in descending order by score.
 */
export function scoreColdStartRepos(repos: RepoCard[]): ScoredRepo[] {
  const now = new Date();

  const scored: ScoredRepo[] = repos.map((repo) => {
    // Star component: log10(starCount + 1) * 0.5
    const starScore = Math.log10(repo.starCount + 1) * 0.5;

    // Recency component: max(0, 1 - daysSinceLastCommit / 30) * 0.5
    const daysSinceLastCommit =
      (now.getTime() - repo.lastCommitAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyBonus = Math.max(0, 1 - daysSinceLastCommit / 30) * 0.5;

    const score = starScore + recencyBonus;

    return {
      repo,
      score,
      explanation: '热门趋势推荐',
      isExploration: false,
    };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored;
}
