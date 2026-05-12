/**
 * Unit tests for the offline event queue (IndexedDB-backed).
 *
 * Uses fake-indexeddb to provide an in-memory IndexedDB implementation
 * suitable for Node-based Vitest runs.
 */

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

// Install fake-indexeddb on the global object before the queue module
// is evaluated. `fake-indexeddb/auto` is the documented way to do this.
import 'fake-indexeddb/auto';

import {
  enqueue,
  getPending,
  flush,
  clear,
  getPendingCount,
  markSynced,
  type StoredEvent,
} from '@/lib/offline-queue';

function makeEvent(partial: Partial<StoredEvent> & { timestamp: number }): StoredEvent {
  return {
    repoId: 'owner/repo',
    type: 'like',
    ...partial,
  } as StoredEvent;
}

describe('offline-queue', () => {
  beforeEach(async () => {
    await clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await clear();
  });

  describe('enqueue', () => {
    it('stores a single event in IndexedDB', async () => {
      await enqueue(makeEvent({ timestamp: 100 }));
      expect(await getPendingCount()).toBe(1);
    });

    it('stores multiple events', async () => {
      await enqueue(makeEvent({ timestamp: 100 }));
      await enqueue(makeEvent({ repoId: 'a/b', timestamp: 200, type: 'favorite' }));
      await enqueue(makeEvent({ repoId: 'c/d', timestamp: 300, type: 'view' }));
      expect(await getPendingCount()).toBe(3);
    });

    it('preserves event payload (type, dwellTimeMs, metadata)', async () => {
      const event = makeEvent({
        timestamp: 42,
        type: 'view',
        dwellTimeMs: 1500,
        metadata: { source: 'feed' },
      });
      await enqueue(event);
      const pending = await getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].event.type).toBe('view');
      expect(pending[0].event.dwellTimeMs).toBe(1500);
      expect(pending[0].event.metadata).toEqual({ source: 'feed' });
    });
  });

  describe('getPending', () => {
    it('returns events in ascending timestamp order regardless of insert order', async () => {
      await enqueue(makeEvent({ repoId: 'c/c', timestamp: 300 }));
      await enqueue(makeEvent({ repoId: 'a/a', timestamp: 100 }));
      await enqueue(makeEvent({ repoId: 'b/b', timestamp: 200 }));

      const pending = await getPending();
      expect(pending.map((p) => p.event.timestamp)).toEqual([100, 200, 300]);
      expect(pending.map((p) => p.event.repoId)).toEqual(['a/a', 'b/b', 'c/c']);
    });

    it('returns an empty array when queue is empty', async () => {
      const pending = await getPending();
      expect(pending).toEqual([]);
    });
  });

  describe('dedup', () => {
    it('prevents enqueueing duplicates (same repoId + timestamp + type)', async () => {
      const event = makeEvent({ repoId: 'a/a', timestamp: 100, type: 'like' });
      await enqueue(event);
      await enqueue(event); // duplicate
      await enqueue({ ...event }); // duplicate, different object identity

      expect(await getPendingCount()).toBe(1);
    });

    it('treats events with different types as distinct', async () => {
      await enqueue(makeEvent({ repoId: 'a/a', timestamp: 100, type: 'like' }));
      await enqueue(makeEvent({ repoId: 'a/a', timestamp: 100, type: 'favorite' }));
      expect(await getPendingCount()).toBe(2);
    });

    it('treats events with different timestamps as distinct', async () => {
      await enqueue(makeEvent({ repoId: 'a/a', timestamp: 100, type: 'like' }));
      await enqueue(makeEvent({ repoId: 'a/a', timestamp: 101, type: 'like' }));
      expect(await getPendingCount()).toBe(2);
    });
  });

  describe('flush', () => {
    it('POSTs pending events to /api/interactions/batch and removes them on success', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ synced: 2 }), { status: 200 }));

      await enqueue(makeEvent({ repoId: 'a/a', timestamp: 100 }));
      await enqueue(makeEvent({ repoId: 'b/b', timestamp: 200 }));

      const result = await flush();
      expect(result).toEqual({ synced: 2, failed: 0 });
      expect(await getPendingCount()).toBe(0);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/interactions/batch');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body.events).toHaveLength(2);
      // First event (by timestamp) should be sent first
      expect(body.events[0].repoId).toBe('a/a');
      expect(body.events[1].repoId).toBe('b/b');
    });

    it('retains events when the server returns a non-OK status', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('server down', { status: 500 }),
      );
      await enqueue(makeEvent({ timestamp: 100 }));
      const result = await flush();
      expect(result).toEqual({ synced: 0, failed: 1 });
      expect(await getPendingCount()).toBe(1);
    });

    it('retains events when the network request throws', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
      await enqueue(makeEvent({ timestamp: 100 }));
      const result = await flush();
      expect(result.synced).toBe(0);
      expect(result.failed).toBe(1);
      expect(await getPendingCount()).toBe(1);
    });

    it('returns early when there is nothing to flush', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      const result = await flush();
      expect(result).toEqual({ synced: 0, failed: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('only removes the first N events when server reports partial sync', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ synced: 1 }), { status: 200 }),
      );
      await enqueue(makeEvent({ repoId: 'a/a', timestamp: 100 }));
      await enqueue(makeEvent({ repoId: 'b/b', timestamp: 200 }));

      const result = await flush();
      expect(result).toEqual({ synced: 1, failed: 1 });

      const remaining = await getPending();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].event.repoId).toBe('b/b');
    });
  });

  describe('markSynced', () => {
    it('removes only the specified keys', async () => {
      await enqueue(makeEvent({ repoId: 'a/a', timestamp: 100 }));
      await enqueue(makeEvent({ repoId: 'b/b', timestamp: 200 }));
      const pending = await getPending();
      await markSynced([pending[0].key]);
      const remaining = await getPending();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].event.repoId).toBe('b/b');
    });
  });

  describe('clear', () => {
    it('empties the queue', async () => {
      await enqueue(makeEvent({ timestamp: 100 }));
      await enqueue(makeEvent({ repoId: 'x/y', timestamp: 200 }));
      await clear();
      expect(await getPendingCount()).toBe(0);
    });
  });
});
