/**
 * Dwell time event classification utility.
 *
 * Classifies user interaction events based on how long they stayed on a card:
 * - 'view' if dwell time >= 1000ms (meaningful engagement)
 * - 'quick_skip' if dwell time < 1000ms (weak negative signal)
 */

import type { CreateInteractionRequest } from '@/lib/types/interaction';

/** Threshold in milliseconds that separates a 'view' from a 'quick_skip' */
export const DWELL_TIME_THRESHOLD_MS = 1000;

/**
 * Classify a dwell time value into an interaction type.
 *
 * @param dwellTimeMs - The dwell time in milliseconds (non-negative)
 * @returns 'view' if dwellTimeMs >= 1000, 'quick_skip' if < 1000
 */
export function classifyDwellTime(dwellTimeMs: number): 'view' | 'quick_skip' {
  return dwellTimeMs >= DWELL_TIME_THRESHOLD_MS ? 'view' : 'quick_skip';
}

/**
 * Create a dwell time interaction event request with the classified type
 * and exact dwell time value recorded.
 *
 * @param repoId - The repository ID
 * @param repoFullName - The full name of the repository (owner/repo)
 * @param dwellTimeMs - The exact dwell time in milliseconds
 * @returns A CreateInteractionRequest with the classified type and dwell time
 */
export function createDwellTimeEvent(
  repoId: string,
  repoFullName: string,
  dwellTimeMs: number
): CreateInteractionRequest {
  return {
    repoId,
    type: classifyDwellTime(dwellTimeMs),
    dwellTimeMs,
    metadata: { repoFullName },
  };
}
