/**
 * Interactions Batch API Route - POST /api/interactions/batch
 *
 * Accepts a batch of offline interaction events and persists them in order.
 * Used by the client's offline LocalEventQueue when network connectivity
 * is restored.
 *
 * Auth rules mirror the single-event route: protected types require an
 * authenticated user; anonymous types do not. Events that fail auth are
 * counted in `skipped`, not in `errors`, so the client can safely retry.
 *
 * Response shape:
 *   {
 *     synced: number,      // successfully persisted (or mock-acknowledged)
 *     skipped: number,     // skipped due to auth or invalid payload
 *     errors: string[]     // human-readable messages for runtime failures
 *   }
 *
 * Mock mode:
 *   - When DATABASE_URL is not set or USE_MOCK_FEED=true, all events are
 *     accepted as-is: { synced: events.length, skipped: 0, errors: [] }.
 *
 * Validates: Requirements 4.7, 8.3, 8.6, 1.6, Property 15, Property 16
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import type {
  BatchSyncRequest,
  CreateInteractionRequest,
  InteractionType,
} from '@/lib/types/interaction';

const PROTECTED_TYPES: ReadonlySet<InteractionType> = new Set<InteractionType>([
  'like',
  'unlike',
  'favorite',
  'unfavorite',
  'follow',
  'unfollow',
]);

const VALID_TYPES: ReadonlySet<InteractionType> = new Set<InteractionType>([
  'like',
  'unlike',
  'favorite',
  'unfavorite',
  'follow',
  'unfollow',
  'not_interested',
  'view',
  'quick_skip',
  'open_external',
]);

interface BatchResult {
  synced: number;
  skipped: number;
  errors: string[];
}

function isMockMode(): boolean {
  if (process.env.USE_MOCK_FEED === 'true') return true;
  if (!process.env.DATABASE_URL) return true;
  return false;
}

function resolveRepoFullName(event: CreateInteractionRequest): string {
  if (typeof event.repoFullName === 'string' && event.repoFullName.length > 0) {
    return event.repoFullName;
  }
  const fromMeta = event.metadata?.fullName;
  if (typeof fromMeta === 'string' && fromMeta.length > 0) {
    return fromMeta;
  }
  return event.repoId;
}

function isValidEvent(event: unknown): event is CreateInteractionRequest {
  if (!event || typeof event !== 'object') return false;
  const e = event as Partial<CreateInteractionRequest>;
  if (typeof e.repoId !== 'string' || e.repoId.length === 0) return false;
  if (typeof e.type !== 'string' || !VALID_TYPES.has(e.type as InteractionType)) return false;
  return true;
}

export async function POST(request: NextRequest): Promise<NextResponse<BatchResult | { error: string }>> {
  // Parse body
  let body: BatchSyncRequest;
  try {
    body = (await request.json()) as BatchSyncRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || !Array.isArray(body.events)) {
    return NextResponse.json(
      { error: 'Missing required field: events (array)' },
      { status: 400 }
    );
  }

  const events = body.events;

  // Mock mode: acknowledge all events as synced without persisting
  if (isMockMode()) {
    return NextResponse.json<BatchResult>(
      { synced: events.length, skipped: 0, errors: [] },
      { status: 200 }
    );
  }

  // Real mode: validate, authorize, and persist each event sequentially to
  // preserve original timestamp order (Property 15).
  const user = await getCurrentUser();
  const userId = user?.id ?? 'anonymous';

  const { recordInteraction } = await import('@/services/interaction-service');

  const result: BatchResult = { synced: 0, skipped: 0, errors: [] };

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // Skip events with invalid shape
    if (!isValidEvent(event)) {
      result.skipped++;
      result.errors.push(`Event at index ${i}: invalid shape`);
      continue;
    }

    // Skip protected events from unauthenticated users without treating it
    // as an error (matches single-event behavior).
    if (PROTECTED_TYPES.has(event.type) && !user) {
      result.skipped++;
      continue;
    }

    try {
      const repoFullName = resolveRepoFullName(event);
      await recordInteraction(userId, event, repoFullName);
      result.synced++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Event at index ${i}: ${message}`);
      console.error('[Batch Sync API] Failed to sync event:', err);
      // Continue processing remaining events
    }
  }

  return NextResponse.json<BatchResult>(result, { status: 200 });
}
