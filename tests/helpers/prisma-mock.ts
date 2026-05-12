import { vi } from 'vitest'

/**
 * Creates a mock Prisma client for unit testing.
 * Each model exposes standard CRUD methods as vi.fn() spies.
 */
interface MockModelMethods {
  findUnique: ReturnType<typeof vi.fn>
  findFirst: ReturnType<typeof vi.fn>
  findMany: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  deleteMany: ReturnType<typeof vi.fn>
  count: ReturnType<typeof vi.fn>
  aggregate: ReturnType<typeof vi.fn>
}

export interface MockPrismaClient {
  user: MockModelMethods
  userProfile: MockModelMethods
  interactionEvent: MockModelMethods
  favorite: MockModelMethods
  follow: MockModelMethods
  userSettings: MockModelMethods
  negativeFeedbackRecord: MockModelMethods
  $transaction: ReturnType<typeof vi.fn>
  $connect: ReturnType<typeof vi.fn>
  $disconnect: ReturnType<typeof vi.fn>
}

export function createMockPrismaClient(): MockPrismaClient {
  const mockModelMethods = (): MockModelMethods => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  })

  return {
    user: mockModelMethods(),
    userProfile: mockModelMethods(),
    interactionEvent: mockModelMethods(),
    favorite: mockModelMethods(),
    follow: mockModelMethods(),
    userSettings: mockModelMethods(),
    negativeFeedbackRecord: mockModelMethods(),
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  }
}

/** Singleton mock instance for convenience */
export const mockPrisma: MockPrismaClient = createMockPrismaClient()

/**
 * Resets all mock functions on the Prisma client.
 * Call in beforeEach() to ensure test isolation.
 */
export function resetMockPrisma(mock: MockPrismaClient = mockPrisma): void {
  Object.values(mock).forEach((modelOrFn) => {
    if (typeof modelOrFn === 'function' && 'mockReset' in modelOrFn) {
      ;(modelOrFn as ReturnType<typeof vi.fn>).mockReset()
    } else if (typeof modelOrFn === 'object' && modelOrFn !== null) {
      Object.values(modelOrFn).forEach((fn) => {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          ;(fn as ReturnType<typeof vi.fn>).mockReset()
        }
      })
    }
  })
}
