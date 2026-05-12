/**
 * Negative feedback tracking and suppression service.
 *
 * Handles "not interested" feedback by:
 * - Blocking specific repos for 7 days (Redis TTL)
 * - Suppressing all repos from an author after 3 "not interested" marks (30 days)
 * - Capping topic weight after 5 "not interested" marks (20% of average)
 *
 * Validates: Requirements 5.3, 5.4, 5.5
 */

import type { RepoCard } from '@/lib/types/repo';
import { redis, negativeFeedbackKey, TTL_NEGATIVE_FEEDBACK } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

/** Author suppression threshold: 3 "not interested" marks */
const AUTHOR_SUPPRESSION_THRESHOLD = 3;

/** Topic weight cap threshold: 5 "not interested" marks */
const TOPIC_CAP_THRESHOLD = 5;

/** Author suppression duration: 30 days in milliseconds */
const AUTHOR_SUPPRESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Records a "not interested" action for a repo, its author, and its topics.
 *
 * - Sets a Redis key with 7-day TTL to block the specific repo
 * - Upserts NegativeFeedbackRecord for the repo (targetType='repo')
 * - Upserts NegativeFeedbackRecord for the author (targetType='author'), increments count
 * - Upserts NegativeFeedbackRecord for each topic (targetType='topic'), increments count
 * - If author count reaches threshold (3), sets expiresAt to 30 days from now
 */
export async function recordNotInterested(userId: string, repo: RepoCard): Promise<void> {
  const now = new Date();

  // Set Redis key with 7-day TTL for repo-level blocking
  await redis.setex(negativeFeedbackKey(userId, repo.id), TTL_NEGATIVE_FEEDBACK, '1');

  // Upsert repo-level record
  await prisma.negativeFeedbackRecord.upsert({
    where: {
      userId_targetType_targetValue: {
        userId,
        targetType: 'repo',
        targetValue: repo.id,
      },
    },
    create: {
      userId,
      targetType: 'repo',
      targetValue: repo.id,
      count: 1,
      lastAt: now,
    },
    update: {
      count: { increment: 1 },
      lastAt: now,
    },
  });

  // Upsert author-level record and increment count
  const authorRecord = await prisma.negativeFeedbackRecord.upsert({
    where: {
      userId_targetType_targetValue: {
        userId,
        targetType: 'author',
        targetValue: repo.owner,
      },
    },
    create: {
      userId,
      targetType: 'author',
      targetValue: repo.owner,
      count: 1,
      lastAt: now,
    },
    update: {
      count: { increment: 1 },
      lastAt: now,
    },
  });

  // If author count reaches threshold, set 30-day suppression expiry
  if (authorRecord.count >= AUTHOR_SUPPRESSION_THRESHOLD) {
    const expiresAt = new Date(now.getTime() + AUTHOR_SUPPRESSION_DURATION_MS);
    await prisma.negativeFeedbackRecord.update({
      where: { id: authorRecord.id },
      data: { expiresAt },
    });
  }

  // Upsert topic-level records for each topic
  for (const topic of repo.topics) {
    await prisma.negativeFeedbackRecord.upsert({
      where: {
        userId_targetType_targetValue: {
          userId,
          targetType: 'topic',
          targetValue: topic,
        },
      },
      create: {
        userId,
        targetType: 'topic',
        targetValue: topic,
        count: 1,
        lastAt: now,
      },
      update: {
        count: { increment: 1 },
        lastAt: now,
      },
    });
  }
}

/**
 * Checks if a specific repo is blocked for a user (7-day Redis block).
 * Returns true if the Redis key exists (within 7-day window).
 */
export async function isRepoBlocked(userId: string, repoId: string): Promise<boolean> {
  const exists = await redis.exists(negativeFeedbackKey(userId, repoId));
  return exists === 1;
}

/**
 * Checks if all repos from an author should be suppressed for a user.
 * Returns true if the author has count >= 3 AND expiresAt is in the future.
 */
export async function isAuthorSuppressed(userId: string, authorId: string): Promise<boolean> {
  const record = await prisma.negativeFeedbackRecord.findUnique({
    where: {
      userId_targetType_targetValue: {
        userId,
        targetType: 'author',
        targetValue: authorId,
      },
    },
  });

  if (!record) return false;
  if (record.count < AUTHOR_SUPPRESSION_THRESHOLD) return false;
  if (!record.expiresAt) return false;

  return record.expiresAt > new Date();
}

/**
 * Gets the topic weight cap for a user's topic if it has been negatively
 * marked enough times (>= 5). Returns the capped weight value (20% of average)
 * or null if no cap applies.
 */
export function getTopicWeightCap(
  userId: string,
  topic: string,
  averageTopicWeight: number,
  record: { count: number } | null
): number | null {
  if (!record) return null;
  if (record.count < TOPIC_CAP_THRESHOLD) return null;

  return averageTopicWeight * 0.2;
}

/**
 * Async version that queries the database for the topic record.
 * Returns the capped weight value (20% of average) or null if no cap applies.
 */
export async function getTopicWeightCapAsync(
  userId: string,
  topic: string,
  averageTopicWeight: number
): Promise<number | null> {
  const record = await prisma.negativeFeedbackRecord.findUnique({
    where: {
      userId_targetType_targetValue: {
        userId,
        targetType: 'topic',
        targetValue: topic,
      },
    },
  });

  return getTopicWeightCap(userId, topic, averageTopicWeight, record);
}

/**
 * Gets the combined suppression status for a repo.
 * Checks both repo-level blocking and author-level suppression.
 */
export async function getSuppressionStatus(
  userId: string,
  repo: RepoCard
): Promise<{ blocked: boolean; reason?: string }> {
  // Check repo-level block first (fast Redis check)
  const repoBlocked = await isRepoBlocked(userId, repo.id);
  if (repoBlocked) {
    return { blocked: true, reason: 'repo_not_interested' };
  }

  // Check author-level suppression
  const authorSuppressed = await isAuthorSuppressed(userId, repo.owner);
  if (authorSuppressed) {
    return { blocked: true, reason: 'author_suppressed' };
  }

  return { blocked: false };
}
