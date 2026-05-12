/**
 * GitHub API retry logic with exponential backoff.
 *
 * - Retries on 5xx errors with exponential backoff (1s, 2s, 4s), max 3 retries
 * - 404 errors are NOT retried and throw immediately (repo permanently gone)
 * - Other errors (4xx) are NOT retried
 *
 * Requirements: 2.5, 2.7, 11.2
 */

/**
 * Custom error class for GitHub API errors that includes the HTTP status code.
 */
export class GitHubError extends Error {
  public readonly statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'GitHubError'
    this.statusCode = statusCode
  }
}

/**
 * Options for configuring retry behavior.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Initial delay in milliseconds before first retry (default: 1000) */
  initialDelayMs?: number
  /** Custom function to determine if an error is retryable (default: 5xx errors) */
  shouldRetry?: (error: unknown) => boolean
  /** Custom delay function for testing (default: setTimeout-based) */
  delayFn?: (ms: number) => Promise<void>
}

/**
 * Returns true if the error is a 5xx server error that should be retried.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof GitHubError) {
    return error.statusCode >= 500 && error.statusCode < 600
  }
  return false
}

/**
 * Returns true if the error indicates the resource is permanently gone (404).
 * Repos returning 404 should be marked for permanent removal from the candidate set.
 */
export function isPermanentlyGone(error: unknown): boolean {
  if (error instanceof GitHubError) {
    return error.statusCode === 404
  }
  return false
}

/**
 * Default delay function using setTimeout.
 */
function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Executes an async function with retry logic and exponential backoff.
 *
 * Backoff formula: delay = initialDelayMs * 2^(attempt - 1)
 * With defaults: 1s, 2s, 4s
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function if successful
 * @throws The last error if all retries are exhausted, or immediately for non-retryable errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3
  const initialDelayMs = options?.initialDelayMs ?? 1000
  const shouldRetry = options?.shouldRetry ?? isRetryableError
  const delayFn = options?.delayFn ?? defaultDelay

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // If the error is not retryable, throw immediately
      if (!shouldRetry(error)) {
        throw error
      }

      // If we've exhausted all retries, throw the last error
      if (attempt >= maxRetries) {
        throw error
      }

      // Wait with exponential backoff before next attempt
      const backoffMs = initialDelayMs * Math.pow(2, attempt)
      await delayFn(backoffMs)
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError
}
