import { describe, it, expect } from 'vitest';
import { applyFilters, isEligible } from '@/services/filter-service';
import type { RepoCard, UserSettings } from '@/lib/types';

function makeRepoCard(overrides: Partial<RepoCard> = {}): RepoCard {
  return {
    id: 'repo-1',
    fullName: 'owner/repo',
    owner: 'owner',
    name: 'repo',
    description: 'A test repo',
    language: 'TypeScript',
    starCount: 100,
    forkCount: 10,
    topics: ['web'],
    isArchived: false,
    isFork: false,
    readmeSummary: 'Test readme',
    lastCommitAt: new Date(),
    defaultBranch: 'main',
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeUserSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    id: 'settings-1',
    userId: 'user-1',
    blockForks: false,
    blockedLanguages: [],
    ...overrides,
  };
}

describe('FilterService', () => {
  describe('isEligible', () => {
    it('excludes archived repos', () => {
      const repo = makeRepoCard({ isArchived: true });
      const settings = makeUserSettings();

      expect(isEligible(repo, settings)).toBe(false);
    });

    it('excludes low-quality repos (stars < 5 AND stale > 1 year)', () => {
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
      const repo = makeRepoCard({ starCount: 3, lastCommitAt: twoYearsAgo });
      const settings = makeUserSettings();

      expect(isEligible(repo, settings)).toBe(false);
    });

    it('does NOT exclude low-star repos with recent commits', () => {
      const repo = makeRepoCard({ starCount: 2, lastCommitAt: new Date() });
      const settings = makeUserSettings();

      expect(isEligible(repo, settings)).toBe(true);
    });

    it('does NOT exclude repos with stars >= 5 even if stale', () => {
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
      const repo = makeRepoCard({ starCount: 5, lastCommitAt: twoYearsAgo });
      const settings = makeUserSettings();

      expect(isEligible(repo, settings)).toBe(true);
    });

    it('excludes fork repos when blockForks is true', () => {
      const repo = makeRepoCard({ isFork: true });
      const settings = makeUserSettings({ blockForks: true });

      expect(isEligible(repo, settings)).toBe(false);
    });

    it('does NOT exclude fork repos when blockForks is false', () => {
      const repo = makeRepoCard({ isFork: true });
      const settings = makeUserSettings({ blockForks: false });

      expect(isEligible(repo, settings)).toBe(true);
    });

    it('excludes repos whose language is in blockedLanguages', () => {
      const repo = makeRepoCard({ language: 'Java' });
      const settings = makeUserSettings({ blockedLanguages: ['Java', 'PHP'] });

      expect(isEligible(repo, settings)).toBe(false);
    });

    it('does NOT exclude repos whose language is not in blockedLanguages', () => {
      const repo = makeRepoCard({ language: 'TypeScript' });
      const settings = makeUserSettings({ blockedLanguages: ['Java', 'PHP'] });

      expect(isEligible(repo, settings)).toBe(true);
    });

    it('does NOT exclude repos with null language even if blockedLanguages is non-empty', () => {
      const repo = makeRepoCard({ language: null });
      const settings = makeUserSettings({ blockedLanguages: ['Java', 'PHP'] });

      expect(isEligible(repo, settings)).toBe(true);
    });

    it('includes repos that pass all checks', () => {
      const repo = makeRepoCard({
        isArchived: false,
        isFork: false,
        starCount: 50,
        language: 'Rust',
        lastCommitAt: new Date(),
      });
      const settings = makeUserSettings({
        blockForks: true,
        blockedLanguages: ['Java'],
      });

      expect(isEligible(repo, settings)).toBe(true);
    });
  });

  describe('applyFilters', () => {
    it('returns only eligible repos from the array', () => {
      const eligible = makeRepoCard({ id: 'eligible', starCount: 100 });
      const archived = makeRepoCard({ id: 'archived', isArchived: true });
      const fork = makeRepoCard({ id: 'fork', isFork: true });
      const settings = makeUserSettings({ blockForks: true });

      const result = applyFilters([eligible, archived, fork], settings);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('eligible');
    });

    it('returns empty array when all repos are filtered out', () => {
      const archived = makeRepoCard({ id: 'archived', isArchived: true });
      const settings = makeUserSettings();

      const result = applyFilters([archived], settings);

      expect(result).toHaveLength(0);
    });

    it('returns all repos when none are filtered', () => {
      const repos = [
        makeRepoCard({ id: 'r1', starCount: 50 }),
        makeRepoCard({ id: 'r2', starCount: 200 }),
        makeRepoCard({ id: 'r3', starCount: 1000 }),
      ];
      const settings = makeUserSettings();

      const result = applyFilters(repos, settings);

      expect(result).toHaveLength(3);
    });

    it('applies multiple filters simultaneously', () => {
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
      const repos = [
        makeRepoCard({ id: 'good', starCount: 100, language: 'Rust' }),
        makeRepoCard({ id: 'archived', isArchived: true }),
        makeRepoCard({ id: 'low-quality', starCount: 2, lastCommitAt: twoYearsAgo }),
        makeRepoCard({ id: 'fork', isFork: true }),
        makeRepoCard({ id: 'blocked-lang', language: 'PHP' }),
      ];
      const settings = makeUserSettings({
        blockForks: true,
        blockedLanguages: ['PHP'],
      });

      const result = applyFilters(repos, settings);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('good');
    });

    it('handles empty input array', () => {
      const settings = makeUserSettings();
      const result = applyFilters([], settings);
      expect(result).toEqual([]);
    });
  });
});
