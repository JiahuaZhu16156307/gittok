/**
 * Content filter service for GitTok.
 * Filters out ineligible repositories based on quality rules and user settings.
 *
 * Requirements: 11.1, 11.3, 11.4, 11.6
 */

import type { RepoCard, UserSettings } from '@/lib/types';

/** Interface for the content filter service */
export interface IFilterService {
  applyFilters(repos: RepoCard[], userSettings: UserSettings): RepoCard[];
  isEligible(repo: RepoCard, userSettings: UserSettings): boolean;
}

/** One year in milliseconds */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Minimum star count threshold for low-quality detection */
const LOW_QUALITY_STAR_THRESHOLD = 5;

/**
 * Determines if a repository is considered low-quality.
 * A repo is low-quality if it has fewer than 5 stars AND
 * its last commit was more than 1 year ago.
 */
function isLowQuality(repo: RepoCard): boolean {
  if (repo.starCount >= LOW_QUALITY_STAR_THRESHOLD) {
    return false;
  }
  const now = Date.now();
  const lastCommitTime = new Date(repo.lastCommitAt).getTime();
  const ageMs = now - lastCommitTime;
  return ageMs > ONE_YEAR_MS;
}

/**
 * Checks if a single repository is eligible for inclusion in the feed.
 *
 * Returns false if:
 * - repo.isArchived === true (Requirement 11.1)
 * - repo.starCount < 5 AND repo.lastCommitAt > 1 year ago (Requirement 11.3)
 * - repo.isFork === true AND userSettings.blockForks === true (Requirement 11.4)
 * - repo.language is in userSettings.blockedLanguages (Requirement 11.6)
 */
export function isEligible(repo: RepoCard, userSettings: UserSettings): boolean {
  // Requirement 11.1: Exclude archived repos
  if (repo.isArchived) {
    return false;
  }

  // Requirement 11.3: Exclude low-quality repos (stars < 5 AND stale > 1 year)
  if (isLowQuality(repo)) {
    return false;
  }

  // Requirement 11.4: Exclude forks if user has blockForks enabled
  if (repo.isFork && userSettings.blockForks) {
    return false;
  }

  // Requirement 11.6: Exclude repos whose language is in the user's blocked list
  if (
    repo.language !== null &&
    userSettings.blockedLanguages.includes(repo.language)
  ) {
    return false;
  }

  return true;
}

/**
 * Filters an array of repositories, returning only those that pass all eligibility checks.
 */
export function applyFilters(repos: RepoCard[], userSettings: UserSettings): RepoCard[] {
  return repos.filter((repo) => isEligible(repo, userSettings));
}

/** Default filter service instance implementing IFilterService */
export const filterService: IFilterService = {
  applyFilters,
  isEligible,
};
