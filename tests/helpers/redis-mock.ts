import { vi } from 'vitest'

/**
 * Creates a mock Redis (ioredis) client for unit testing.
 * Covers the most common Redis commands used in the project.
 */
export function createMockRedisClient() {
  const store = new Map<string, string>()

  return {
    // String commands
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value)
      return Promise.resolve('OK')
    }),
    setex: vi.fn((key: string, _ttl: number, value: string) => {
      store.set(key, value)
      return Promise.resolve('OK')
    }),
    del: vi.fn((...keys: string[]) => {
      let count = 0
      keys.forEach((k) => { if (store.delete(k)) count++ })
      return Promise.resolve(count)
    }),
    incr: vi.fn((key: string) => {
      const val = parseInt(store.get(key) || '0', 10) + 1
      store.set(key, String(val))
      return Promise.resolve(val)
    }),
    expire: vi.fn(() => Promise.resolve(1)),
    ttl: vi.fn(() => Promise.resolve(-1)),
    exists: vi.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),

    // Hash commands
    hset: vi.fn(() => Promise.resolve(1)),
    hget: vi.fn(() => Promise.resolve(null)),
    hgetall: vi.fn(() => Promise.resolve({})),
    hdel: vi.fn(() => Promise.resolve(1)),

    // Set commands
    sadd: vi.fn(() => Promise.resolve(1)),
    sismember: vi.fn(() => Promise.resolve(0)),
    smembers: vi.fn(() => Promise.resolve([])),
    srem: vi.fn(() => Promise.resolve(1)),

    // List commands
    lpush: vi.fn(() => Promise.resolve(1)),
    rpush: vi.fn(() => Promise.resolve(1)),
    lrange: vi.fn(() => Promise.resolve([])),
    llen: vi.fn(() => Promise.resolve(0)),

    // Pipeline / Multi
    pipeline: vi.fn(() => ({
      exec: vi.fn(() => Promise.resolve([])),
      get: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      setex: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      sadd: vi.fn().mockReturnThis(),
      sismember: vi.fn().mockReturnThis(),
    })),
    multi: vi.fn(() => ({
      exec: vi.fn(() => Promise.resolve([])),
      get: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
    })),

    // Connection
    disconnect: vi.fn(() => Promise.resolve()),
    quit: vi.fn(() => Promise.resolve('OK')),

    // Internal store access for test assertions
    _store: store,
  }
}

/** Singleton mock instance for convenience */
export const mockRedis = createMockRedisClient()

/** Type helper for the mock Redis client */
export type MockRedisClient = ReturnType<typeof createMockRedisClient>

/**
 * Resets all mock functions and clears the internal store.
 * Call in beforeEach() to ensure test isolation.
 */
export function resetMockRedis(mock: MockRedisClient = mockRedis): void {
  mock._store.clear()
  Object.entries(mock).forEach(([key, value]) => {
    if (key === '_store') return
    if (typeof value === 'function' && 'mockClear' in value) {
      ;(value as ReturnType<typeof vi.fn>).mockClear()
    }
  })
}
