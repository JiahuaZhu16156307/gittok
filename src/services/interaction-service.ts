/**
 * Interaction event service for GitTok.
 *
 * Handles recording user interactions (like, unlike, favorite, unfavorite,
 * follow, unfollow, not_interested, view, quick_skip, open_external),
 * toggling likes idempotently, managing favorites/follows, and wiring
 * interaction events to the recommendation engine profile updates.
 *
 * Validates: Requirements 4.1-4.5, 5.1
 */

import type { CreateInteractionRequest, InteractionType } from '@/lib/types/interaction';
import type { RepoCard } from '@/lib/types/repo';
import { prisma } from '@/lib/prisma';
import { updateProfileWeights } from '@/services/profile-updater';
import { getProfile, saveProfile, createDefaultProfile } from '@/services/profile-service';
import { recordNotInterested } from '@/services/negative-feedback-service';

/**
 * Records a single interaction event and updates the user's recommendation profile.
 *
 * - Creates an InteractionEvent record in the database
 * - Updates user profile weights via profile-updater
 * - If type is 'not_interested', calls negative-feedback-service.recordNotInterested
 * - Increments totalInteractions in user profile
 */
export async function recordInteraction(
  userId: string,
  request: CreateInteractionRequest,
  repoFullName: string
): Promise<void> {
  // Create the interaction event in the database
  await prisma.interactionEvent.create({
    data: {
      userId,
      repoId: request.repoId,
      repoFullName,
      type: request.type,
      dwellTimeMs: request.dwellTimeMs ?? null,
      metadata: (request.metadata as any) ?? undefined,
      createdAt: new Date(),
    },
  });

  // Fetch or create user profile
  let profile = await getProfile(userId);
  if (!profile) {
    profile = createDefaultProfile(userId);
  }

  // Build a minimal RepoCard from the available data for weight updates
  const repoCard = buildRepoCardFromRequest(request, repoFullName);

  // Update profile weights based on the interaction type
  const updatedProfile = updateProfileWeights(profile, repoCard, request.type);

  // Increment total interactions
  updatedProfile.totalInteractions = profile.totalInteractions + 1;

  // Save the updated profile
  await saveProfile(userId, updatedProfile);

  // If not_interested, also record in negative feedback service
  if (request.type === 'not_interested') {
    await recordNotInterested(userId, repoCard);
  }
}

/**
 * Toggles the like state for a repository.
 *
 * - Checks if user has an existing 'like' event for this repo (without a subsequent 'unlike')
 * - If liked: records 'unlike' event, returns { liked: false }
 * - If not liked: records 'like' event, returns { liked: true }
 * - Idempotent: like→unlike→like works correctly
 */
export async function toggleLike(
  userId: string,
  repoId: string,
  repoFullName: string
): Promise<{ liked: boolean }> {
  const isCurrentlyLiked = await isLiked(userId, repoId);

  if (isCurrentlyLiked) {
    // Unlike: record unlike event
    await recordInteraction(userId, { repoId, type: 'unlike' }, repoFullName);
    return { liked: false };
  } else {
    // Like: record like event
    await recordInteraction(userId, { repoId, type: 'like' }, repoFullName);
    return { liked: true };
  }
}

/**
 * Adds a repository to the user's favorites list.
 *
 * - Creates a Favorite record in Prisma (upsert to handle duplicates)
 * - Records a 'favorite' interaction event
 */
export async function addFavorite(
  userId: string,
  repoId: string,
  repoFullName: string,
  repoData: Record<string, unknown>
): Promise<void> {
  // Upsert favorite record to handle duplicates gracefully
  await prisma.favorite.upsert({
    where: {
      userId_repoId: { userId, repoId },
    },
    create: {
      userId,
      repoId,
      repoFullName,
      repoData: repoData as any,
    },
    update: {
      repoData: repoData as any,
      repoFullName,
    },
  });

  // Record the favorite interaction event
  await recordInteraction(userId, { repoId, type: 'favorite' }, repoFullName);
}

/**
 * Removes a repository from the user's favorites list.
 *
 * - Deletes the Favorite record from Prisma
 * - Records an 'unfavorite' interaction event
 */
export async function removeFavorite(
  userId: string,
  repoId: string,
  repoFullName: string
): Promise<void> {
  // Delete the favorite record
  await prisma.favorite.delete({
    where: {
      userId_repoId: { userId, repoId },
    },
  });

  // Record the unfavorite interaction event
  await recordInteraction(userId, { repoId, type: 'unfavorite' }, repoFullName);
}

/**
 * Adds an author to the user's follow list.
 *
 * - Creates a Follow record in Prisma (upsert to handle duplicates)
 * - Records a 'follow' interaction event
 */
export async function addFollow(
  userId: string,
  authorId: string,
  authorData: Record<string, unknown>
): Promise<void> {
  // Upsert follow record to handle duplicates gracefully
  await prisma.follow.upsert({
    where: {
      userId_authorId: { userId, authorId },
    },
    create: {
      userId,
      authorId,
      authorData: authorData as any,
    },
    update: {
      authorData: authorData as any,
    },
  });

  // Record the follow interaction event
  // Use authorId as repoId since follows are author-level
  await recordInteraction(userId, { repoId: authorId, type: 'follow' }, authorId);
}

/**
 * Removes an author from the user's follow list.
 *
 * - Deletes the Follow record from Prisma
 * - Records an 'unfollow' interaction event
 */
export async function removeFollow(
  userId: string,
  authorId: string
): Promise<void> {
  // Delete the follow record
  await prisma.follow.delete({
    where: {
      userId_authorId: { userId, authorId },
    },
  });

  // Record the unfollow interaction event
  await recordInteraction(userId, { repoId: authorId, type: 'unfollow' }, authorId);
}

/**
 * Gets the current interaction state for a user and repository.
 *
 * Returns whether the user has liked, favorited, and followed the repo/author.
 */
export async function getInteractionState(
  userId: string,
  repoId: string,
  authorId?: string
): Promise<{ liked: boolean; favorited: boolean; followed: boolean }> {
  const [liked, favorited, followed] = await Promise.all([
    isLiked(userId, repoId),
    isFavorited(userId, repoId),
    authorId ? isFollowed(userId, authorId) : Promise.resolve(false),
  ]);

  return { liked, favorited, followed };
}

// --- Internal helpers ---

/**
 * Determines if a user currently has a repo liked by checking the most recent
 * like/unlike event for that repo.
 */
async function isLiked(userId: string, repoId: string): Promise<boolean> {
  const lastLikeEvent = await prisma.interactionEvent.findFirst({
    where: {
      userId,
      repoId,
      type: { in: ['like', 'unlike'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { type: true },
  });

  return lastLikeEvent?.type === 'like';
}

/**
 * Checks if a user has favorited a repo.
 */
async function isFavorited(userId: string, repoId: string): Promise<boolean> {
  const favorite = await prisma.favorite.findUnique({
    where: {
      userId_repoId: { userId, repoId },
    },
    select: { id: true },
  });

  return favorite !== null;
}

/**
 * Checks if a user is following an author.
 */
async function isFollowed(userId: string, authorId: string): Promise<boolean> {
  const follow = await prisma.follow.findUnique({
    where: {
      userId_authorId: { userId, authorId },
    },
    select: { id: true },
  });

  return follow !== null;
}

/**
 * Builds a minimal RepoCard from a CreateInteractionRequest for use in
 * profile weight updates. Uses metadata if available, otherwise defaults.
 */
function buildRepoCardFromRequest(
  request: CreateInteractionRequest,
  repoFullName: string
): RepoCard {
  const metadata = (request.metadata ?? {}) as Record<string, unknown>;
  const [owner, name] = repoFullName.split('/');

  return {
    id: request.repoId,
    fullName: repoFullName,
    owner: owner ?? '',
    name: name ?? '',
    description: (metadata.description as string) ?? '',
    language: (metadata.language as string) ?? null,
    starCount: (metadata.starCount as number) ?? 0,
    forkCount: (metadata.forkCount as number) ?? 0,
    topics: (metadata.topics as string[]) ?? [],
    isArchived: false,
    isFork: false,
    readmeSummary: '',
    lastCommitAt: new Date(),
    defaultBranch: 'main',
    updatedAt: new Date(),
  };
}
