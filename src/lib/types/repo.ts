/**
 * Repository-related type definitions for GitTok.
 */

/** A repository card displayed in the feed */
export interface RepoCard {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  description: string;
  language: string | null;
  starCount: number;
  forkCount: number;
  topics: string[];
  isArchived: boolean;
  isFork: boolean;
  readmeSummary: string;
  lastCommitAt: Date;
  defaultBranch: string;
  updatedAt: Date;
  /** First image extracted from README (enrichment) */
  readmeImageUrl?: string | null;
  /** Chinese summary extracted from README (enrichment) */
  readmeSummaryCn?: string | null;
}

/** Raw GitHub repository data before scoring (extends RepoCard) */
export interface RepoData extends RepoCard {}

/** A repository with its recommendation score */
export interface ScoredRepo {
  repo: RepoCard;
  score: number;
  explanation: string;
  isExploration: boolean;
}

/** Detailed explanation of why a repository was recommended */
export interface Explanation {
  topFeatures: { feature: string; contribution: number }[];
  reason: string;
}
