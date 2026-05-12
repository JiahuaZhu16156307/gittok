import { redis, rateLimitKey, TTL_RATE_LIMIT } from '@/lib/redis'

/** Maximum GitHub API requests allowed per rolling 60-second window */
const MAX_REQUESTS_PER_MINUTE = 50

export interface RateLimitResult {
  shouldWait: boolean
  waitUntil: Date | null
}

/**
 * GitHubRateLimiter enforces a sliding window rate limit on GitHub API calls.
 * Uses Redis INCR + EXPIRE to count requests per minute per token.
 *
 * Key pattern: `ratelimit:github:{token}` with TTL of 60 seconds.
 * Limit: 50 requests per rolling 60-second window.
 */
export class GitHubRateLimiter {
  private redisClient: typeof redis
  private maxRequests: number

  constructor(
    redisClient: typeof redis = redis,
    maxRequests: number = MAX_REQUESTS_PER_MINUTE
  ) {
    this.redisClient = redisClient
    this.maxRequests = maxRequests
  }

  /**
   * Checks whether the given token is under the rate limit (< 50 req/min).
   */
  async canMakeRequest(token: string): Promise<boolean> {
    const key = rateLimitKey(token)
    const currentCount = await this.redisClient.get(key)

    if (currentCount === null) {
      return true
    }

    return parseInt(currentCount, 10) < this.maxRequests
  }

  /**
   * Records a request for the given token by incrementing the Redis counter.
   * Sets a TTL of 60 seconds on the key if it's a new window.
   */
  async recordRequest(token: string): Promise<void> {
    const key = rateLimitKey(token)
    const count = await this.redisClient.incr(key)

    // If this is the first request in the window, set the TTL
    if (count === 1) {
      await this.redisClient.expire(key, TTL_RATE_LIMIT)
    }
  }

  /**
   * Parses GitHub API response headers to determine if we've hit the rate limit.
   * Looks for `X-RateLimit-Remaining: 0` and `X-RateLimit-Reset` headers.
   *
   * @param headers - The response headers from a GitHub API call
   * @returns An object indicating whether to wait and until when
   */
  handleRateLimitResponse(headers: Headers): RateLimitResult {
    const remaining = headers.get('X-RateLimit-Remaining')
    const resetTimestamp = headers.get('X-RateLimit-Reset')

    if (remaining === '0' && resetTimestamp) {
      const resetAt = new Date(parseInt(resetTimestamp, 10) * 1000)
      return {
        shouldWait: true,
        waitUntil: resetAt,
      }
    }

    return {
      shouldWait: false,
      waitUntil: null,
    }
  }

  /**
   * Waits until the specified reset time before allowing further requests.
   * Resolves immediately if the reset time is already in the past.
   */
  async waitForReset(resetAt: Date): Promise<void> {
    const now = Date.now()
    const waitMs = resetAt.getTime() - now

    if (waitMs <= 0) {
      return
    }

    return new Promise((resolve) => {
      setTimeout(resolve, waitMs)
    })
  }
}
