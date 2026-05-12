import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GitHubRateLimiter } from '@/services/github-rate-limiter'
import { createMockRedisClient, resetMockRedis, type MockRedisClient } from '@tests/helpers/redis-mock'

describe('GitHubRateLimiter', () => {
  let mockRedis: MockRedisClient
  let rateLimiter: GitHubRateLimiter

  beforeEach(() => {
    mockRedis = createMockRedisClient()
    rateLimiter = new GitHubRateLimiter(mockRedis as any, 50)
    resetMockRedis(mockRedis)
  })

  describe('canMakeRequest', () => {
    it('should return true when no requests have been made', async () => {
      const result = await rateLimiter.canMakeRequest('test-token')
      expect(result).toBe(true)
    })

    it('should return true when under the limit', async () => {
      mockRedis._store.set('ratelimit:github:test-token', '49')
      const result = await rateLimiter.canMakeRequest('test-token')
      expect(result).toBe(true)
    })

    it('should return false when at the limit', async () => {
      mockRedis._store.set('ratelimit:github:test-token', '50')
      const result = await rateLimiter.canMakeRequest('test-token')
      expect(result).toBe(false)
    })

    it('should return false when over the limit', async () => {
      mockRedis._store.set('ratelimit:github:test-token', '55')
      const result = await rateLimiter.canMakeRequest('test-token')
      expect(result).toBe(false)
    })

    it('should use the correct Redis key pattern', async () => {
      await rateLimiter.canMakeRequest('my-gh-token')
      expect(mockRedis.get).toHaveBeenCalledWith('ratelimit:github:my-gh-token')
    })
  })

  describe('recordRequest', () => {
    it('should increment the counter for the token', async () => {
      await rateLimiter.recordRequest('test-token')
      expect(mockRedis.incr).toHaveBeenCalledWith('ratelimit:github:test-token')
    })

    it('should set TTL of 60 seconds on first request in window', async () => {
      await rateLimiter.recordRequest('test-token')
      expect(mockRedis.expire).toHaveBeenCalledWith('ratelimit:github:test-token', 60)
    })

    it('should not set TTL on subsequent requests in the same window', async () => {
      // Simulate existing counter at 5
      mockRedis._store.set('ratelimit:github:test-token', '5')
      // incr will return 6 (not 1), so expire should not be called
      await rateLimiter.recordRequest('test-token')
      expect(mockRedis.expire).not.toHaveBeenCalled()
    })

    it('should increment counter correctly across multiple calls', async () => {
      await rateLimiter.recordRequest('test-token')
      await rateLimiter.recordRequest('test-token')
      await rateLimiter.recordRequest('test-token')

      expect(mockRedis._store.get('ratelimit:github:test-token')).toBe('3')
    })
  })

  describe('handleRateLimitResponse', () => {
    it('should return shouldWait=true when X-RateLimit-Remaining is 0', () => {
      const headers = new Headers({
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1700000000',
      })

      const result = rateLimiter.handleRateLimitResponse(headers)

      expect(result.shouldWait).toBe(true)
      expect(result.waitUntil).toEqual(new Date(1700000000 * 1000))
    })

    it('should return shouldWait=false when X-RateLimit-Remaining is > 0', () => {
      const headers = new Headers({
        'X-RateLimit-Remaining': '10',
        'X-RateLimit-Reset': '1700000000',
      })

      const result = rateLimiter.handleRateLimitResponse(headers)

      expect(result.shouldWait).toBe(false)
      expect(result.waitUntil).toBeNull()
    })

    it('should return shouldWait=false when headers are missing', () => {
      const headers = new Headers()

      const result = rateLimiter.handleRateLimitResponse(headers)

      expect(result.shouldWait).toBe(false)
      expect(result.waitUntil).toBeNull()
    })

    it('should return shouldWait=false when remaining is 0 but reset header is missing', () => {
      const headers = new Headers({
        'X-RateLimit-Remaining': '0',
      })

      const result = rateLimiter.handleRateLimitResponse(headers)

      expect(result.shouldWait).toBe(false)
      expect(result.waitUntil).toBeNull()
    })

    it('should correctly parse the reset timestamp into a Date', () => {
      const resetEpoch = 1700001234
      const headers = new Headers({
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(resetEpoch),
      })

      const result = rateLimiter.handleRateLimitResponse(headers)

      expect(result.waitUntil!.getTime()).toBe(resetEpoch * 1000)
    })
  })

  describe('waitForReset', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should resolve immediately if reset time is in the past', async () => {
      const pastDate = new Date(Date.now() - 10000)
      await rateLimiter.waitForReset(pastDate)
      // If we get here without hanging, the test passes
    })

    it('should wait until the reset time', async () => {
      const futureDate = new Date(Date.now() + 5000)
      let resolved = false

      const promise = rateLimiter.waitForReset(futureDate).then(() => {
        resolved = true
      })

      expect(resolved).toBe(false)

      vi.advanceTimersByTime(5000)
      await promise

      expect(resolved).toBe(true)
    })

    it('should resolve immediately if reset time is now', async () => {
      const now = new Date(Date.now())
      await rateLimiter.waitForReset(now)
      // If we get here without hanging, the test passes
    })
  })

  describe('integration: canMakeRequest + recordRequest', () => {
    it('should block requests after reaching the limit', async () => {
      // Record 50 requests
      for (let i = 0; i < 50; i++) {
        expect(await rateLimiter.canMakeRequest('token')).toBe(true)
        await rateLimiter.recordRequest('token')
      }

      // 51st request should be blocked
      expect(await rateLimiter.canMakeRequest('token')).toBe(false)
    })

    it('should track different tokens independently', async () => {
      // Fill up token-a
      for (let i = 0; i < 50; i++) {
        await rateLimiter.recordRequest('token-a')
      }

      // token-a should be blocked, token-b should still be allowed
      expect(await rateLimiter.canMakeRequest('token-a')).toBe(false)
      expect(await rateLimiter.canMakeRequest('token-b')).toBe(true)
    })
  })
})
