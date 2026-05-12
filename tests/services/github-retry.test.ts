import { describe, it, expect, vi } from 'vitest'
import {
  GitHubError,
  withRetry,
  isRetryableError,
  isPermanentlyGone,
} from '@/services/github-retry'

/** A no-op delay that records the requested delay durations for verification */
function createMockDelay() {
  const delays: number[] = []
  const delayFn = async (ms: number) => { delays.push(ms) }
  return { delayFn, delays }
}

describe('github-retry', () => {
  describe('GitHubError', () => {
    it('should store statusCode and message', () => {
      const error = new GitHubError('Not Found', 404)
      expect(error.statusCode).toBe(404)
      expect(error.message).toBe('Not Found')
      expect(error.name).toBe('GitHubError')
    })
  })

  describe('isRetryableError', () => {
    it('should return true for 500 errors', () => {
      expect(isRetryableError(new GitHubError('Server Error', 500))).toBe(true)
    })

    it('should return true for 502 errors', () => {
      expect(isRetryableError(new GitHubError('Bad Gateway', 502))).toBe(true)
    })

    it('should return true for 503 errors', () => {
      expect(isRetryableError(new GitHubError('Service Unavailable', 503))).toBe(true)
    })

    it('should return false for 404 errors', () => {
      expect(isRetryableError(new GitHubError('Not Found', 404))).toBe(false)
    })

    it('should return false for 403 errors', () => {
      expect(isRetryableError(new GitHubError('Forbidden', 403))).toBe(false)
    })

    it('should return false for non-GitHubError', () => {
      expect(isRetryableError(new Error('generic error'))).toBe(false)
    })

    it('should return false for non-error values', () => {
      expect(isRetryableError('string')).toBe(false)
      expect(isRetryableError(null)).toBe(false)
      expect(isRetryableError(undefined)).toBe(false)
    })
  })

  describe('isPermanentlyGone', () => {
    it('should return true for 404 errors', () => {
      expect(isPermanentlyGone(new GitHubError('Not Found', 404))).toBe(true)
    })

    it('should return false for 500 errors', () => {
      expect(isPermanentlyGone(new GitHubError('Server Error', 500))).toBe(false)
    })

    it('should return false for non-GitHubError', () => {
      expect(isPermanentlyGone(new Error('generic error'))).toBe(false)
    })

    it('should return false for non-error values', () => {
      expect(isPermanentlyGone(null)).toBe(false)
    })
  })

  describe('withRetry', () => {
    it('should return result on successful first attempt (no retry needed)', async () => {
      const { delayFn, delays } = createMockDelay()
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withRetry(fn, { delayFn })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
      expect(delays).toHaveLength(0)
    })

    it('should retry on 5xx error and succeed on 2nd attempt', async () => {
      const { delayFn, delays } = createMockDelay()
      const fn = vi.fn()
        .mockRejectedValueOnce(new GitHubError('Server Error', 500))
        .mockResolvedValueOnce('recovered')

      const result = await withRetry(fn, { delayFn })

      expect(result).toBe('recovered')
      expect(fn).toHaveBeenCalledTimes(2)
      expect(delays).toEqual([1000]) // 1s backoff before first retry
    })

    it('should exhaust all retries on persistent 5xx error and throw', async () => {
      const { delayFn, delays } = createMockDelay()
      const serverError = new GitHubError('Server Error', 500)
      const fn = vi.fn().mockRejectedValue(serverError)

      await expect(withRetry(fn, { delayFn })).rejects.toThrow(serverError)

      // 1 initial + 3 retries = 4 total calls
      expect(fn).toHaveBeenCalledTimes(4)
      expect(delays).toEqual([1000, 2000, 4000])
    })

    it('should NOT retry on 404 error and throw immediately', async () => {
      const { delayFn, delays } = createMockDelay()
      const notFoundError = new GitHubError('Not Found', 404)
      const fn = vi.fn().mockRejectedValue(notFoundError)

      await expect(withRetry(fn, { delayFn })).rejects.toThrow(notFoundError)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(delays).toHaveLength(0)
    })

    it('should NOT retry on 403 error and throw immediately', async () => {
      const { delayFn, delays } = createMockDelay()
      const forbiddenError = new GitHubError('Forbidden', 403)
      const fn = vi.fn().mockRejectedValue(forbiddenError)

      await expect(withRetry(fn, { delayFn })).rejects.toThrow(forbiddenError)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(delays).toHaveLength(0)
    })

    it('should NOT retry on non-GitHubError and throw immediately', async () => {
      const { delayFn, delays } = createMockDelay()
      const genericError = new Error('Network failure')
      const fn = vi.fn().mockRejectedValue(genericError)

      await expect(withRetry(fn, { delayFn })).rejects.toThrow(genericError)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(delays).toHaveLength(0)
    })

    it('should use exponential backoff timing (1s, 2s, 4s)', async () => {
      const { delayFn, delays } = createMockDelay()
      const serverError = new GitHubError('Server Error', 500)
      const fn = vi.fn().mockRejectedValue(serverError)

      await expect(withRetry(fn, { delayFn })).rejects.toThrow(serverError)

      // Verify exponential backoff: 1000 * 2^0, 1000 * 2^1, 1000 * 2^2
      expect(delays).toEqual([1000, 2000, 4000])
    })

    it('should respect custom maxRetries option', async () => {
      const { delayFn, delays } = createMockDelay()
      const serverError = new GitHubError('Server Error', 500)
      const fn = vi.fn().mockRejectedValue(serverError)

      await expect(withRetry(fn, { maxRetries: 1, delayFn })).rejects.toThrow(serverError)

      // 1 initial + 1 retry = 2 total calls
      expect(fn).toHaveBeenCalledTimes(2)
      expect(delays).toEqual([1000])
    })

    it('should respect custom initialDelayMs option', async () => {
      const { delayFn, delays } = createMockDelay()
      const serverError = new GitHubError('Server Error', 500)
      const fn = vi.fn()
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce('ok')

      const result = await withRetry(fn, { initialDelayMs: 500, delayFn })

      expect(result).toBe('ok')
      expect(fn).toHaveBeenCalledTimes(2)
      expect(delays).toEqual([500]) // Custom initial delay
    })

    it('should respect custom shouldRetry function', async () => {
      const { delayFn, delays } = createMockDelay()
      const customError = new Error('custom retryable')
      const fn = vi.fn()
        .mockRejectedValueOnce(customError)
        .mockResolvedValueOnce('recovered')

      const result = await withRetry(fn, {
        shouldRetry: (err) => err instanceof Error && err.message === 'custom retryable',
        delayFn,
      })

      expect(result).toBe('recovered')
      expect(fn).toHaveBeenCalledTimes(2)
      expect(delays).toEqual([1000])
    })

    it('should succeed on 3rd attempt after two 5xx failures', async () => {
      const { delayFn, delays } = createMockDelay()
      const fn = vi.fn()
        .mockRejectedValueOnce(new GitHubError('Server Error', 500))
        .mockRejectedValueOnce(new GitHubError('Bad Gateway', 502))
        .mockResolvedValueOnce('finally works')

      const result = await withRetry(fn, { delayFn })

      expect(result).toBe('finally works')
      expect(fn).toHaveBeenCalledTimes(3)
      expect(delays).toEqual([1000, 2000]) // Two backoff delays before success
    })

    it('should use exponential backoff with custom initialDelayMs', async () => {
      const { delayFn, delays } = createMockDelay()
      const serverError = new GitHubError('Server Error', 500)
      const fn = vi.fn().mockRejectedValue(serverError)

      await expect(withRetry(fn, { initialDelayMs: 200, maxRetries: 3, delayFn })).rejects.toThrow(serverError)

      // 200 * 2^0 = 200, 200 * 2^1 = 400, 200 * 2^2 = 800
      expect(delays).toEqual([200, 400, 800])
    })
  })
})
