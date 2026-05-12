import fc from 'fast-check'

// --- InteractionType enum values (mirrors Prisma enum) ---

export const INTERACTION_TYPES = [
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
] as const

export type InteractionType = (typeof INTERACTION_TYPES)[number]

export const POSITIVE_INTERACTION_TYPES = [
  'like',
  'favorite',
  'follow',
  'open_external',
] as const

export const NEGATIVE_INTERACTION_TYPES = [
  'not_interested',
  'quick_skip',
] as const

// --- Common programming languages for realistic data ---

const LANGUAGES = [
  'TypeScript',
  'JavaScript',
  'Rust',
  'Go',
  'Python',
  'Java',
  'C++',
  'C#',
  'Ruby',
  'Swift',
  'Kotlin',
  'Dart',
  'Elixir',
  'Haskell',
  'Scala',
] as const

const TOPICS = [
  'web',
  'cli',
  'machine-learning',
  'devops',
  'database',
  'frontend',
  'backend',
  'mobile',
  'security',
  'testing',
  'api',
  'cloud',
  'blockchain',
  'game-dev',
  'data-science',
] as const

// --- Custom Arbitraries ---

/**
 * Generates a valid InteractionType enum value.
 */
export const arbInteractionType: fc.Arbitrary<InteractionType> = fc.constantFrom(
  ...INTERACTION_TYPES
)

/**
 * Generates dwell times in the range [0, 30000] milliseconds.
 * Useful for testing view/quick_skip classification thresholds.
 */
export const arbDwellTime: fc.Arbitrary<number> = fc.integer({ min: 0, max: 30000 })

/**
 * Generates realistic RepoCard data matching the application's data model.
 */
export const arbRepoCard: fc.Arbitrary<{
  id: string
  fullName: string
  owner: string
  name: string
  description: string
  language: string | null
  starCount: number
  forkCount: number
  topics: string[]
  isArchived: boolean
  isFork: boolean
  readmeSummary: string
  lastCommitAt: Date
  createdAt: Date
}> = fc.record({
  id: fc.uuid(),
  fullName: fc.tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), { minLength: 2, maxLength: 20 }),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_.'.split('')), { minLength: 2, maxLength: 30 })
  ).map(([owner, name]) => `${owner}/${name}`),
  owner: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), { minLength: 2, maxLength: 20 }),
  name: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_.'.split('')), { minLength: 2, maxLength: 30 }),
  description: fc.string({ minLength: 0, maxLength: 200 }),
  language: fc.option(fc.constantFrom(...LANGUAGES), { nil: null }),
  starCount: fc.integer({ min: 0, max: 500000 }),
  forkCount: fc.integer({ min: 0, max: 100000 }),
  topics: fc.array(fc.constantFrom(...TOPICS), { minLength: 0, maxLength: 5 }),
  isArchived: fc.boolean(),
  isFork: fc.boolean(),
  readmeSummary: fc.string({ minLength: 0, maxLength: 500 }),
  lastCommitAt: fc.date({ min: new Date('2015-01-01'), max: new Date() }),
  createdAt: fc.date({ min: new Date('2008-01-01'), max: new Date() }),
})

/**
 * Generates interaction events with valid types, timestamps, and optional dwell time.
 */
export const arbInteractionEvent: fc.Arbitrary<{
  id: string
  userId: string
  repoId: string
  repoFullName: string
  type: InteractionType
  dwellTimeMs: number | null
  createdAt: Date
}> = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  repoId: fc.uuid(),
  repoFullName: fc.tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 2, maxLength: 15 }),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), { minLength: 2, maxLength: 20 })
  ).map(([owner, name]) => `${owner}/${name}`),
  type: arbInteractionType,
  dwellTimeMs: fc.option(arbDwellTime, { nil: null }),
  createdAt: fc.date({ min: new Date('2024-01-01'), max: new Date() }),
})

/**
 * Generates user profiles with feature weights constrained to [-1, 1].
 * Mirrors the UserProfile model with JSON weight maps.
 */
export const arbUserProfile: fc.Arbitrary<{
  id: string
  userId: string
  languageWeights: Record<string, number>
  topicWeights: Record<string, number>
  starRangeWeights: Record<string, number>
  authorWeights: Record<string, number>
  totalInteractions: number
}> = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  languageWeights: fc.dictionary(
    fc.constantFrom(...LANGUAGES),
    fc.double({ min: -1, max: 1, noNaN: true }),
    { minKeys: 0, maxKeys: 5 }
  ),
  topicWeights: fc.dictionary(
    fc.constantFrom(...TOPICS),
    fc.double({ min: -1, max: 1, noNaN: true }),
    { minKeys: 0, maxKeys: 5 }
  ),
  starRangeWeights: fc.dictionary(
    fc.constantFrom('0-10', '10-100', '100-1000', '1000-10000', '10000+'),
    fc.double({ min: -1, max: 1, noNaN: true }),
    { minKeys: 0, maxKeys: 3 }
  ),
  authorWeights: fc.dictionary(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 3, maxLength: 15 }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    { minKeys: 0, maxKeys: 4 }
  ),
  totalInteractions: fc.integer({ min: 0, max: 10000 }),
})
