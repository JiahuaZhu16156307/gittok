import type { RepoCard } from "@/lib/types/repo";

export function buildRepoInteractionMetadata(repo: RepoCard): Record<string, unknown> {
  return {
    fullName: repo.fullName,
    owner: repo.owner,
    name: repo.name,
    description: repo.description,
    language: repo.language,
    starCount: repo.starCount,
    forkCount: repo.forkCount,
    topics: repo.topics,
    defaultBranch: repo.defaultBranch,
    lastCommitAt:
      repo.lastCommitAt instanceof Date
        ? repo.lastCommitAt.toISOString()
        : repo.lastCommitAt,
    updatedAt:
      repo.updatedAt instanceof Date ? repo.updatedAt.toISOString() : repo.updatedAt,
  };
}
