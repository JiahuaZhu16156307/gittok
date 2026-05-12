import { describe, it, expect } from 'vitest'
import {
  repoKey,
  readmeKey,
  rateLimitKey,
  sessionDeliveredKey,
  trendingReposKey,
  negativeFeedbackKey,
  TTL_REPO_CACHE,
  TTL_README_CACHE,
  TTL_RATE_LIMIT,
  TTL_TRENDING,
  TTL_NEGATIVE_FEEDBACK,
} from '@/lib/redis'

describe('Redis key pattern helpers', () => {
  it('repoKey generates correct pattern', () => {
    expect(repoKey('facebook', 'react')).toBe('repo:facebook/react')
    expect(repoKey('vercel', 'next.js')).toBe('repo:vercel/next.js')
  })

  it('readmeKey generates correct pattern', () => {
    expect(readmeKey('facebook', 'react')).toBe('readme:facebook/react')
    expect(readmeKey('vercel', 'next.js')).toBe('readme:vercel/next.js')
  })

  it('rateLimitKey generates correct pattern', () => {
    expect(rateLimitKey('ghp_abc123')).toBe('ratelimit:github:ghp_abc123')
  })

  it('sessionDeliveredKey generates correct pattern', () => {
    expect(sessionDeliveredKey('user1', 'sess-abc')).toBe(
      'session:delivered:user1:sess-abc'
    )
  })

  it('trendingReposKey generates correct pattern', () => {
    expect(trendingReposKey('typescript')).toBe('trending:repos:typescript')
    expect(trendingReposKey('rust')).toBe('trending:repos:rust')
  })

  it('negativeFeedbackKey generates correct pattern', () => {
    expect(negativeFeedbackKey('user1', 'repo123')).toBe(
      'user:negfeedback:user1:repo123'
    )
  })
})

describe('Redis TTL constants', () => {
  it('TTL_REPO_CACHE is 24 hours in seconds', () => {
    expect(TTL_REPO_CACHE).toBe(86400)
  })

  it('TTL_README_CACHE is 24 hours in seconds', () => {
    expect(TTL_README_CACHE).toBe(86400)
  })

  it('TTL_RATE_LIMIT is 1 minute in seconds', () => {
    expect(TTL_RATE_LIMIT).toBe(60)
  })

  it('TTL_TRENDING is 6 hours in seconds', () => {
    expect(TTL_TRENDING).toBe(21600)
  })

  it('TTL_NEGATIVE_FEEDBACK is 7 days in seconds', () => {
    expect(TTL_NEGATIVE_FEEDBACK).toBe(604800)
  })
})
