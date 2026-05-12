import Redis from 'ioredis'

// Singleton pattern to avoid multiple connections in development (same as Prisma)
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null
      return Math.min(times * 200, 2000)
    },
  })

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

// --- TTL Constants (in seconds) ---

/** Repository data cache TTL: 24 hours */
export const TTL_REPO_CACHE = 24 * 60 * 60 // 86400s

/** README summary cache TTL: 24 hours */
export const TTL_README_CACHE = 24 * 60 * 60 // 86400s

/** GitHub API rate limit window: 1 minute */
export const TTL_RATE_LIMIT = 60 // 60s

/** Trending repos candidate pool TTL: 6 hours */
export const TTL_TRENDING = 6 * 60 * 60 // 21600s

/** Negative feedback (not-interested) block TTL: 7 days */
export const TTL_NEGATIVE_FEEDBACK = 7 * 24 * 60 * 60 // 604800s

// --- Key Pattern Helpers ---

/** Repository data cache key: `repo:{owner}/{name}` */
export function repoKey(owner: string, name: string): string {
  return `repo:${owner}/${name}`
}

/** README summary cache key: `readme:{owner}/{name}` */
export function readmeKey(owner: string, name: string): string {
  return `readme:${owner}/${name}`
}

/** GitHub API rate limit counter key: `ratelimit:github:{token}` */
export function rateLimitKey(token: string): string {
  return `ratelimit:github:${token}`
}

/** Session delivered repos set key: `session:delivered:{userId}:{sessionId}` */
export function sessionDeliveredKey(userId: string, sessionId: string): string {
  return `session:delivered:${userId}:${sessionId}`
}

/** Trending repos candidate pool key: `trending:repos:{language}` */
export function trendingReposKey(language: string): string {
  return `trending:repos:${language}`
}

/** Negative feedback block key: `user:negfeedback:{userId}:{repoId}` */
export function negativeFeedbackKey(userId: string, repoId: string): string {
  return `user:negfeedback:${userId}:${repoId}`
}
