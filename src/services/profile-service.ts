/**
 * Profile service for managing user recommendation profiles.
 *
 * Provides CRUD operations for UserProfile, including:
 * - Fetching profiles from the database
 * - Saving/upserting profiles
 * - Resetting profiles (clears all weights, triggers cold start on next recommendation)
 * - Creating default empty profiles
 */

import type { UserProfile } from '@/lib/types/user';
import { prisma } from '@/lib/prisma';

/**
 * Creates a default (empty) user profile with all weights zeroed.
 * A profile with totalInteractions = 0 will trigger Cold_Start_Strategy
 * since it's below the threshold of 10.
 */
export function createDefaultProfile(userId: string): UserProfile {
  return {
    id: '',
    userId,
    languageWeights: {},
    topicWeights: {},
    starRangeWeights: {},
    authorWeights: {},
    totalInteractions: 0,
  };
}

/**
 * Fetches a user's profile from the database.
 * Returns null if no profile exists for the given userId.
 */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  const record = await prisma.userProfile.findUnique({
    where: { userId },
  });

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    userId: record.userId,
    languageWeights: record.languageWeights as Record<string, number>,
    topicWeights: record.topicWeights as Record<string, number>,
    starRangeWeights: record.starRangeWeights as Record<string, number>,
    authorWeights: record.authorWeights as Record<string, number>,
    totalInteractions: record.totalInteractions,
  };
}

/**
 * Upserts a user's profile in the database.
 * Creates the profile if it doesn't exist, updates it if it does.
 */
export async function saveProfile(userId: string, profile: UserProfile): Promise<void> {
  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      languageWeights: profile.languageWeights,
      topicWeights: profile.topicWeights,
      starRangeWeights: profile.starRangeWeights,
      authorWeights: profile.authorWeights,
      totalInteractions: profile.totalInteractions,
    },
    update: {
      languageWeights: profile.languageWeights,
      topicWeights: profile.topicWeights,
      starRangeWeights: profile.starRangeWeights,
      authorWeights: profile.authorWeights,
      totalInteractions: profile.totalInteractions,
    },
  });
}

/**
 * Resets a user's profile by zeroing all feature weights and setting
 * totalInteractions to 0. This ensures the next recommendation request
 * will use Cold_Start_Strategy (triggered when totalInteractions < 10).
 *
 * Returns the reset profile.
 */
export async function resetProfile(userId: string): Promise<UserProfile> {
  const record = await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      languageWeights: {},
      topicWeights: {},
      starRangeWeights: {},
      authorWeights: {},
      totalInteractions: 0,
    },
    update: {
      languageWeights: {},
      topicWeights: {},
      starRangeWeights: {},
      authorWeights: {},
      totalInteractions: 0,
    },
  });

  return {
    id: record.id,
    userId: record.userId,
    languageWeights: record.languageWeights as Record<string, number>,
    topicWeights: record.topicWeights as Record<string, number>,
    starRangeWeights: record.starRangeWeights as Record<string, number>,
    authorWeights: record.authorWeights as Record<string, number>,
    totalInteractions: record.totalInteractions,
  };
}
