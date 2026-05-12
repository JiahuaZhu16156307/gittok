"use client";

/**
 * Offline event queue using IndexedDB (via idb-keyval) for persistence.
 *
 * Stores interaction events when offline and flushes them to the server
 * when connectivity is restored. Events are keyed by monotonically-increasing
 * numeric keys (derived from timestamp + counter) so they sort ascending.
 *
 * Validates: Requirements 4.7, 8.3, 8.6, Property 15, Property 16
 */

import {
  createStore,
  set,
  del,
  entries,
  clear as idbClear,
  keys as idbKeys,
  type UseStore,
} from 'idb-keyval';
import type { CreateInteractionRequest } from '@/lib/types/interaction';

/** A stored offline event: interaction request plus the client timestamp */
export type StoredEvent = CreateInteractionRequest & { timestamp: number };

/**
 * Detect whether IndexedDB is available. This is false during SSR, in workers
 * without IDB, or in private-browsing contexts that disable it.
 */
function hasIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Lazily-initialised idb-keyval custom store so we avoid creating the database
 * during SSR / module evaluation on the server.
 */
let idbStore: UseStore | null = null;
function getStore(): UseStore | null {
  if (!hasIndexedDB()) return null;
  if (!idbStore) {
    idbStore = createStore('gittok-events', 'queue');
  }
  return idbStore;
}

/**
 * In-memory fallback used when IndexedDB is unavailable (SSR, etc.). Keeps the
 * public API usable; data is of course lost on reload.
 */
const memoryStore = new Map<number, StoredEvent>();

/**
 * Monotonically-increasing counter portion appended to timestamps so multiple
 * events enqueued in the same millisecond still get unique, ordered keys.
 * We also remember the last issued key to guarantee strict monotonicity even
 * if the system clock moves backwards.
 */
let lastIssuedKey = 0;
const COUNTER_BASE = 1000; // reserve 3 digits for the intra-ms counter
let intraMsCounter = 0;
let lastMsForCounter = 0;

function nextKey(timestamp: number): number {
  const now = timestamp;
  if (now !== lastMsForCounter) {
    lastMsForCounter = now;
    intraMsCounter = 0;
  }
  let key = now * COUNTER_BASE + intraMsCounter;
  intraMsCounter += 1;
  if (key <= lastIssuedKey) {
    key = lastIssuedKey + 1;
  }
  lastIssuedKey = key;
  return key;
}

/** Read every entry from the active store (IDB or in-memory). */
async function readAllEntries(): Promise<Array<[number, StoredEvent]>> {
  const store = getStore();
  if (!store) {
    return Array.from(memoryStore.entries());
  }
  const raw = await entries<IDBValidKey, StoredEvent>(store);
  // Filter to numeric keys only (the only kind we write) and cast.
  return raw
    .filter((pair): pair is [number, StoredEvent] => typeof pair[0] === 'number')
    .map((pair) => [pair[0] as number, pair[1]]);
}

/**
 * Enqueue an interaction event for later sync.
 *
 * Includes deduplication: if an event with the same
 * (repoId, timestamp, type) already exists in the queue it is dropped
 * (Property 16). The on-disk client queue represents a single local user, so
 * userId is implicit.
 */
export async function enqueue(event: StoredEvent): Promise<void> {
  const existing = await readAllEntries();
  const isDuplicate = existing.some(
    ([, e]) =>
      e.repoId === event.repoId &&
      e.type === event.type &&
      e.timestamp === event.timestamp,
  );
  if (isDuplicate) return;

  const key = nextKey(event.timestamp);
  const store = getStore();
  if (!store) {
    memoryStore.set(key, event);
    return;
  }
  await set(key, event, store);
}

/**
 * Return all pending events sorted by their original timestamp ascending
 * (ties broken by key order, which itself is monotonic — Property 15).
 */
export async function getPending(): Promise<Array<{ key: number; event: StoredEvent }>> {
  const list = await readAllEntries();
  list.sort((a, b) => {
    const ts = a[1].timestamp - b[1].timestamp;
    return ts !== 0 ? ts : a[0] - b[0];
  });
  return list.map(([key, event]) => ({ key, event }));
}

/** Remove the specified keys from the queue. */
export async function markSynced(keysToRemove: number[]): Promise<void> {
  if (keysToRemove.length === 0) return;
  const store = getStore();
  if (!store) {
    for (const k of keysToRemove) memoryStore.delete(k);
    return;
  }
  // delMany would be nicer but we keep this simple and explicit.
  await Promise.all(keysToRemove.map((k) => del(k, store)));
}

/**
 * Flush all pending events to `/api/interactions/batch`.
 * Removes successfully synced events. Returns counts.
 */
export async function flush(): Promise<{ synced: number; failed: number }> {
  const pending = await getPending();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let response: Response;
  try {
    response = await fetch('/api/interactions/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: pending.map((p) => p.event) }),
    });
  } catch (error) {
    console.error('[OfflineQueue] Flush network error:', error);
    return { synced: 0, failed: pending.length };
  }

  if (!response.ok) {
    console.error('[OfflineQueue] Flush failed:', response.status);
    return { synced: 0, failed: pending.length };
  }

  let syncedCount = pending.length;
  try {
    const body = (await response.json()) as { synced?: number };
    if (typeof body.synced === 'number') {
      syncedCount = Math.max(0, Math.min(body.synced, pending.length));
    }
  } catch {
    // Body parse failure: fall back to assuming everything synced (2xx).
  }

  const keysToRemove = pending.slice(0, syncedCount).map((p) => p.key);
  await markSynced(keysToRemove);
  return { synced: syncedCount, failed: pending.length - syncedCount };
}

/** Number of pending events currently persisted. */
export async function getPendingCount(): Promise<number> {
  const store = getStore();
  if (!store) return memoryStore.size;
  const all = await idbKeys(store);
  return all.length;
}

/** Clear all events — for testing only. */
export async function clear(): Promise<void> {
  const store = getStore();
  if (!store) {
    memoryStore.clear();
  } else {
    await idbClear(store);
  }
  lastIssuedKey = 0;
  intraMsCounter = 0;
  lastMsForCounter = 0;
}

/** Back-compat helper used by NetworkSyncProvider. */
export async function hasPending(): Promise<boolean> {
  return (await getPendingCount()) > 0;
}
