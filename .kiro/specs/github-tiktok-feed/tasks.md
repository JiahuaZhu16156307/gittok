# Implementation Plan: GitTok — TikTok-Style GitHub Repository Browser

## Overview

This implementation plan breaks down the GitTok full-stack application into incremental, testable tasks. The approach is bottom-up: foundational infrastructure first (project setup, data models, core services), then API layer, then frontend components, and finally integration wiring. Property-based tests are placed close to their corresponding implementation tasks to catch errors early.

## Tasks

- [x] 1. Project setup and infrastructure
  - [x] 1.1 Initialize Next.js 14 project with App Router, Tailwind CSS, and TypeScript
    - Create Next.js 14 project with `app/` directory structure
    - Configure Tailwind CSS with custom theme (dark mode, card styles)
    - Install dependencies: `framer-motion`, `zustand`, `prisma`, `@prisma/client`, `next-auth`, `ioredis`, `idb-keyval`, `vitest`, `fast-check`
    - Configure `tsconfig.json` path aliases (`@/lib`, `@/components`, `@/services`, `@/stores`)
    - _Requirements: All (project foundation)_

  - [x] 1.2 Set up Prisma schema and database
    - Create `prisma/schema.prisma` with all models: User, UserProfile, InteractionEvent, Favorite, Follow, UserSettings, NegativeFeedbackRecord
    - Define enums: InteractionType
    - Configure PostgreSQL datasource
    - Generate Prisma client and run initial migration
    - _Requirements: 8.1_

  - [x] 1.3 Set up Redis client and connection utilities
    - Create `lib/redis.ts` with ioredis singleton connection
    - Define key pattern helpers for repo cache, rate limiting, session delivery, trending repos, negative feedback
    - Add TTL constants matching design (24h repo cache, 1min rate limit, 6h trending, 7d negative feedback)
    - _Requirements: 2.6, 10.3_

  - [x] 1.4 Set up Vitest and fast-check testing infrastructure
    - Configure `vitest.config.ts` with path aliases and coverage
    - Create test utilities: Prisma mock helpers, Redis mock helpers, fast-check custom arbitraries
    - Create `tests/` directory structure mirroring `src/`
    - _Requirements: All (testing foundation)_

  - [x] 1.5 Configure NextAuth.js with GitHub provider
    - Create `app/api/auth/[...nextauth]/route.ts`
    - Configure GitHub OAuth provider with client ID/secret env vars
    - Implement session callback to include `githubToken` and `userId`
    - Create `lib/auth.ts` helper for server-side session access
    - _Requirements: 1.1, 1.2, 1.4_

- [x] 2. Core type definitions and shared utilities
  - [x] 2.1 Define core TypeScript interfaces and types
    - Create `lib/types/repo.ts`: `RepoCard`, `RepoData`, `ScoredRepo`, `Explanation`
    - Create `lib/types/interaction.ts`: `InteractionEvent`, `InteractionType`, `CreateInteractionRequest`, `BatchSyncRequest`
    - Create `lib/types/feed.ts`: `FeedRequest`, `FeedResponse`
    - Create `lib/types/user.ts`: `UserProfile`, `UserSettings`, `SessionResponse`
    - Create `lib/types/recommendation.ts`: `RateLimitInfo`, `FeatureWeights`
    - _Requirements: 2.2, 3.8, 4.1-4.5_

  - [x] 2.2 Implement README truncation utility
    - Create `lib/utils/truncate-readme.ts`
    - Implement `truncateReadme(content: string, maxLength: number = 500): string`
    - Ensure truncation returns a prefix of the original content with length `min(L, 500)`
    - _Requirements: 2.3_

  - [ ]* 2.3 Write property test for README truncation (Property 17)
    - **Property 17: README Truncation**
    - For any README string of length L, the truncated summary SHALL have length min(L, 500) and SHALL be a prefix of the original README content
    - **Validates: Requirements 2.3**

- [x] 3. GitHub Client service
  - [x] 3.1 Implement GitHub API client with caching
    - Create `services/github-client.ts` implementing `IGitHubClient`
    - Implement `fetchRepository()` with Redis caching (24h TTL)
    - Implement `fetchTrendingRepos()` using GitHub search API (stars, recent activity)
    - Implement `searchRepos()` with query builder
    - Implement `fetchReadme()` with truncation and caching
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [x] 3.2 Implement rate limiter for GitHub API
    - Create `services/github-rate-limiter.ts`
    - Implement sliding window rate limiter using Redis counter (50 req/min)
    - Handle 403 + `X-RateLimit-Remaining: 0` by pausing until reset time
    - _Requirements: 2.4, 10.3_

  - [ ]* 3.3 Write property test for API rate limiting (Property 20)
    - **Property 20: GitHub API Rate Limiting**
    - For any sequence of GitHub API requests, the GitHub_Client SHALL ensure no more than 50 requests are sent within any rolling 60-second window
    - **Validates: Requirements 10.3**

  - [x] 3.4 Implement retry logic with exponential backoff
    - Create `services/github-retry.ts`
    - Implement exponential backoff for 5xx errors (1s, 2s, 4s), max 3 retries
    - Handle 404 by marking repo for permanent removal
    - _Requirements: 2.5, 2.7, 11.2_

  - [ ]* 3.5 Write property test for repository cache hit (Property 25)
    - **Property 25: Repository Cache Hit**
    - For any repository that has been successfully fetched, a subsequent request within 24 hours SHALL return cached data without a new GitHub API call
    - **Validates: Requirements 2.6**

- [x] 4. Checkpoint — Core infrastructure verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Recommendation Engine
  - [x] 5.1 Implement recommendation scoring function
    - Create `services/recommendation-engine.ts`
    - Implement `score(userProfile, repo)` using weighted dot product across 4 dimensions (language, topics, star range, author)
    - Ensure score is influenced by all four feature dimensions
    - _Requirements: 6.1, 6.2_

  - [ ]* 5.2 Write property test for recommendation score ordering (Property 2)
    - **Property 2: Recommendation Score Ordering**
    - For any user profile and non-empty candidate set, results SHALL be sorted in non-increasing order by score
    - **Validates: Requirements 6.1**

  - [ ]* 5.3 Write property test for four-dimension scoring (Property 21)
    - **Property 21: Four-Dimension Scoring**
    - For any repository and user profile, changing any single dimension while holding others constant SHALL produce a different score
    - **Validates: Requirements 6.2**

  - [x] 5.4 Implement profile weight update logic
    - Implement `updateProfile(userId, event)` in recommendation engine
    - Positive feedback: increase weights by α=0.1 for corresponding features
    - Negative feedback: decrease weights by β (not_interested=0.15, quick_skip=0.03)
    - Clamp all weights to [-1.0, 1.0]
    - _Requirements: 6.3, 6.4, 5.2, 5.6_

  - [ ]* 5.5 Write property test for positive feedback weight increase (Property 3)
    - **Property 3: Positive Feedback Increases Weights**
    - For any user profile and positive interaction event, corresponding feature weights SHALL increase after processing
    - **Validates: Requirements 6.3**

  - [ ]* 5.6 Write property test for negative feedback weight decrease (Property 4)
    - **Property 4: Negative Feedback Decreases Weights**
    - For any user profile and negative interaction event, corresponding feature weights SHALL decrease after processing
    - **Validates: Requirements 6.4, 5.2**

  - [ ]* 5.7 Write property test for quick_skip weaker than not_interested (Property 5)
    - **Property 5: Quick Skip Weaker Than Not Interested**
    - For any repository and user profile, the magnitude of weight decrease from quick_skip SHALL be strictly less than from not_interested
    - **Validates: Requirements 5.6**

  - [x] 5.8 Implement exploration diversity and session deduplication
    - Implement `generateRecommendations(userId, count)` with exploration guarantee (≥20% exploration items)
    - Use Redis set `session:delivered:{userId}:{sessionId}` to track delivered repos
    - Ensure no repo appears twice in same session
    - _Requirements: 6.5, 6.8_

  - [ ]* 5.9 Write property test for exploration diversity (Property 6)
    - **Property 6: Exploration Diversity Guarantee**
    - For any recommendation batch of size N (N>=5), at least ⌈N×0.2⌉ items SHALL be marked as exploration
    - **Validates: Requirements 6.5**

  - [ ]* 5.10 Write property test for session deduplication (Property 7)
    - **Property 7: Session Deduplication**
    - For any sequence of feed requests within a single session, no repository ID SHALL appear more than once
    - **Validates: Requirements 6.8**

  - [x] 5.11 Implement cold start strategy
    - Implement `Cold_Start_Strategy` using trending repos (7-day high star growth + popular languages)
    - Trigger cold start when user has < 10 total interactions
    - _Requirements: 6.6, 6.7_

  - [ ]* 5.12 Write property test for cold start trigger (Property 8)
    - **Property 8: Cold Start Trigger**
    - For any user with fewer than 10 interaction events, the engine SHALL use Cold_Start_Strategy
    - **Validates: Requirements 6.6**

  - [ ]* 5.13 Write property test for weight update consistency (Property 9)
    - **Property 9: Weight Update Consistency**
    - For any profile weight update, the next scoring invocation SHALL use updated values, producing different scores
    - **Validates: Requirements 6.9**

  - [x] 5.14 Implement recommendation explanation
    - Implement `getRecommendationExplanation(userId, repoId)` returning top contributing features
    - Generate human-readable reason string (e.g., "因为你喜欢 Rust 项目")
    - _Requirements: 9.1, 9.2_

  - [x] 5.15 Implement profile reset
    - Implement `resetProfile(userId)` that zeroes all feature weights
    - After reset, next recommendation SHALL use Cold_Start_Strategy
    - _Requirements: 9.4_

  - [ ]* 5.16 Write property test for profile reset (Property 24)
    - **Property 24: Profile Reset Clears Weights**
    - For any user profile with non-zero weights, reset SHALL set all weights to zero and next recommendation SHALL use Cold_Start_Strategy
    - **Validates: Requirements 9.4**

- [x] 6. Negative Feedback Service
  - [x] 6.1 Implement negative feedback tracking and suppression
    - Create `services/negative-feedback-service.ts`
    - Track per-repo "not_interested" with 7-day Redis expiry
    - Track per-author count; suppress all repos at count >= 3 for 30 days
    - Track per-topic count; cap weight at 20% of average when count >= 5
    - _Requirements: 5.3, 5.4, 5.5_

  - [ ]* 6.2 Write property test for 7-day temporal exclusion (Property 11)
    - **Property 11: Not Interested Temporal Exclusion**
    - For any repository marked not_interested, it SHALL NOT appear in recommendations for 7 days
    - **Validates: Requirements 5.3**

  - [ ]* 6.3 Write property test for author suppression (Property 12)
    - **Property 12: Author Suppression After Threshold**
    - For any author with 3+ not_interested events, ALL their repos SHALL be scored at minimum and excluded for 30 days
    - **Validates: Requirements 5.4**

  - [ ]* 6.4 Write property test for topic weight cap (Property 13)
    - **Property 13: Topic Weight Cap After Threshold**
    - For any topic with 5+ not_interested events, its weight SHALL NOT exceed 20% of the average topic weight
    - **Validates: Requirements 5.5**

- [x] 7. Filter Service
  - [x] 7.1 Implement content filter service
    - Create `services/filter-service.ts` implementing `IFilterService`
    - Implement `applyFilters()` checking: archived, low-quality (stars<5 + stale>1yr), fork (if user setting), blocked language
    - Implement `isEligible()` for single repo check
    - _Requirements: 11.1, 11.3, 11.4, 11.6_

  - [ ]* 7.2 Write property test for content filter exclusion (Property 10)
    - **Property 10: Content Filter Exclusion**
    - For any candidate set and user settings, the filter SHALL exclude repos matching any exclusion condition (archived, low-quality, fork+blockForks, blocked language)
    - **Validates: Requirements 11.1, 11.3, 11.4, 11.6**

- [x] 8. Feed Service
  - [x] 8.1 Implement Feed Service
    - Create `services/feed-service.ts` implementing `IFeedService`
    - Implement `getNextBatch()`: call recommendation engine → apply filters → return paginated results with cursor
    - Implement `markDelivered()` to update session delivery set
    - Ensure batch returns at least 10 cards within 1 second target
    - _Requirements: 3.4, 6.1, 10.2, 11.1-11.6_

- [x] 9. Checkpoint — All core services verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Interaction and dwell time services
  - [x] 10.1 Implement interaction event service
    - Create `services/interaction-service.ts`
    - Implement `recordInteraction()` for all event types
    - Implement `toggleLike()` with idempotent like/unlike toggle
    - Implement `addFavorite()`, `removeFavorite()`, `addFollow()`, `removeFollow()`
    - Wire interaction events to recommendation engine profile updates
    - _Requirements: 4.1-4.5, 5.1_

  - [ ]* 10.2 Write property test for like toggle idempotence (Property 14)
    - **Property 14: Like Toggle Idempotence**
    - For any repository and user, like→unlike returns to not-liked state; like→unlike→like returns to liked state
    - **Validates: Requirements 4.2**

  - [x] 10.3 Implement dwell time event classification
    - Create `lib/utils/dwell-time-classifier.ts`
    - Classify events: `view` if dwellTime >= 1000ms, `quick_skip` if < 1000ms
    - Record exact dwell time value in event
    - _Requirements: 3.6, 3.7_

  - [ ]* 10.4 Write property test for dwell time classification (Property 1)
    - **Property 1: Dwell Time Event Classification**
    - For any non-negative dwell time t, classify as `view` if t>=1000, `quick_skip` if t<1000, with exact dwell time recorded
    - **Validates: Requirements 3.6, 3.7**

- [x] 11. Offline event queue (client-side)
  - [x] 11.1 Implement LocalEventQueue with IndexedDB persistence
    - Create `lib/offline-queue.ts` using `idb-keyval`
    - Implement `enqueue(event)`: async write to IndexedDB with timestamp
    - Implement `flush()`: read all pending events sorted by timestamp ascending, batch POST to `/api/interactions/batch`
    - Implement `getPending()`: return pending events
    - Handle deduplication on sync (same userId + repoId + timestamp + type = discard)
    - _Requirements: 4.7, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 11.2 Write property test for offline queue order preservation (Property 15)
    - **Property 15: Offline Queue Order Preservation**
    - For any sequence of events recorded offline, sync SHALL send them in strictly ascending timestamp order
    - **Validates: Requirements 4.7, 8.6**

  - [ ]* 11.3 Write property test for event deduplication (Property 16)
    - **Property 16: Event Deduplication**
    - For any event in local queue, if backend has matching (userId, repoId, timestamp, type), the local event SHALL be discarded
    - **Validates: Requirements 8.3**

- [x] 12. API Routes
  - [x] 12.1 Implement Feed API route
    - Create `app/api/feed/route.ts` (GET)
    - Accept `cursor` and `limit` query params
    - Call FeedService.getNextBatch() with authenticated user ID
    - Return `FeedResponse` with cards, nextCursor, hasMore
    - _Requirements: 3.4, 6.1, 10.2_

  - [x] 12.2 Implement Interactions API routes
    - Create `app/api/interactions/route.ts` (POST) for single event
    - Create `app/api/interactions/batch/route.ts` (POST) for batch sync
    - Validate authentication; reject unauthenticated requests for protected types
    - Wire to InteractionService and RecommendationEngine.updateProfile()
    - _Requirements: 4.1-4.5, 4.8, 5.1_

  - [ ]* 12.3 Write property test for unauthenticated interaction rejection (Property 22)
    - **Property 22: Unauthenticated Interaction Rejection**
    - For any protected interaction type, an unauthenticated attempt SHALL be rejected without state modification
    - **Validates: Requirements 1.6**

  - [x] 12.4 Implement Favorites API routes
    - Create `app/api/favorites/route.ts` (GET) with pagination
    - Create `app/api/favorites/[repoId]/route.ts` (DELETE)
    - Return items ordered by creation time descending
    - _Requirements: 7.1, 7.3, 7.6_

  - [x] 12.5 Implement Follows API routes
    - Create `app/api/follows/route.ts` (GET) with pagination
    - Create `app/api/follows/[authorId]/route.ts` (DELETE)
    - Return items ordered by creation time descending
    - _Requirements: 7.2, 7.4, 7.6_

  - [ ]* 12.6 Write property test for list ordering (Property 23)
    - **Property 23: Favorites and Follow List Ordering**
    - For any user's Favorites_List or Follow_List with multiple entries, entries SHALL be ordered by timestamp descending
    - **Validates: Requirements 7.6**

  - [x] 12.7 Implement Settings API routes
    - Create `app/api/settings/route.ts` (GET, PUT)
    - Handle blockForks toggle and blockedLanguages list
    - Create `app/api/settings/reset-profile/route.ts` (POST) for recommendation reset
    - _Requirements: 9.3, 9.4, 11.4, 11.5_

- [x] 13. Checkpoint — API layer verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Zustand stores (client state management)
  - [x] 14.1 Implement Feed store
    - Create `stores/feed-store.ts`
    - State: `cards[]`, `currentIndex`, `cursor`, `hasMore`, `isLoading`
    - Actions: `fetchNextBatch()`, `setCurrentIndex()`, `getVisibleRange()`
    - Implement local card cache with 100-entry LRU eviction
    - Implement prefetch trigger when unviewed cards <= 3
    - _Requirements: 3.4, 10.5_

  - [ ]* 14.2 Write property test for prefetch trigger threshold (Property 18)
    - **Property 18: Prefetch Trigger Threshold**
    - For any feed state where unviewed cards remaining <= 3, the system SHALL trigger a prefetch
    - **Validates: Requirements 3.4**

  - [ ]* 14.3 Write property test for local cache size limit (Property 19)
    - **Property 19: Local Cache Size Limit**
    - For any sequence of card views, the local cache SHALL never exceed 100 entries; oldest evicted first
    - **Validates: Requirements 10.5**

  - [x] 14.4 Implement Interaction store
    - Create `stores/interaction-store.ts`
    - State: `likedRepos`, `favoritedRepos`, `followedAuthors`
    - Actions: `toggleLike()`, `toggleFavorite()`, `toggleFollow()`, `markNotInterested()`
    - Implement optimistic updates with rollback on failure
    - _Requirements: 4.1-4.6_

  - [x] 14.5 Implement Auth store
    - Create `stores/auth-store.ts`
    - State: `user`, `isAuthenticated`, `isLoading`
    - Actions: `login()`, `logout()`, `restoreSession()`
    - _Requirements: 1.1-1.7_

- [ ] 15. Frontend components — Feed
  - [x] 15.1 Implement FeedContainer with DOM virtualization
    - Create `components/feed/FeedContainer.tsx` (`"use client"`)
    - Implement CSS scroll-snap based vertical scrolling
    - DOM virtualization: only mount currentIndex ± 1 cards (3-5 DOM nodes max)
    - Use Framer Motion for 200ms slide transitions
    - Implement `onCardVisible` / `onCardLeave` callbacks for dwell time tracking
    - Wire to feed store for data and prefetch logic
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 10.1_

  - [x] 15.2 Implement RepoCardComponent
    - Create `components/feed/RepoCard.tsx` (`"use client"`)
    - Render: repo name, author, language badge, Star/Fork counts, topics tags, description, README summary
    - Display recommendation reason text
    - Expandable recommendation explanation on click
    - Full-screen card layout with Tailwind CSS
    - _Requirements: 3.8, 9.1, 9.2_

  - [x] 15.3 Implement InteractionBar
    - Create `components/feed/InteractionBar.tsx` (`"use client"`)
    - Buttons: Like (toggle), Favorite (toggle), Follow Author (toggle), Not Interested, Open in GitHub
    - Show current interaction state per card
    - Disable protected interactions for unauthenticated users
    - Wire to interaction store with optimistic updates
    - Wire to offline queue for network-unavailable scenarios
    - _Requirements: 4.1-4.7, 5.1, 1.6_

  - [x] 15.4 Implement loading placeholder component
    - Create `components/feed/CardSkeleton.tsx`
    - Skeleton UI matching RepoCard layout
    - Display while next card data is loading
    - _Requirements: 3.5_

- [ ] 16. Frontend pages — Auth, Settings, Favorites, Follows
  - [x] 16.1 Implement Login page
    - Create `app/login/page.tsx` (Server Component)
    - "使用 GitHub 登录" button triggering NextAuth signIn
    - Error display for failed OAuth callbacks
    - _Requirements: 1.1, 1.3_

  - [x] 16.2 Implement Settings page
    - Create `app/settings/page.tsx` (Server Component + Client Islands)
    - Toggle: "屏蔽 fork 仓库"
    - Editable list: blocked languages
    - Button: "重置推荐偏好" with confirmation dialog
    - Button: "退出登录"
    - _Requirements: 1.5, 9.3, 9.4, 11.4, 11.5_

  - [x] 16.3 Implement Favorites page
    - Create `app/favorites/page.tsx` (Server Component with RSC data prefetch)
    - List all favorited repos ordered by time descending
    - Each item: repo name, language, stars, description, remove button (Client Island)
    - Click navigates to repo card detail view
    - _Requirements: 7.1, 7.3, 7.5, 7.6_

  - [x] 16.4 Implement Follows page
    - Create `app/follows/page.tsx` (Server Component with RSC data prefetch)
    - List all followed authors ordered by time descending
    - Each item: author avatar, name, unfollow button (Client Island)
    - Click navigates to author's repos
    - _Requirements: 7.2, 7.4, 7.5, 7.6_

- [x] 17. Network status and sync wiring
  - [x] 17.1 Implement network status detection and auto-sync
    - Create `components/providers/NetworkSyncProvider.tsx` (`"use client"`)
    - Listen to `navigator.onLine` and `online`/`offline` events
    - On reconnect: trigger `LocalEventQueue.flush()`
    - Display "网络缓慢，请稍后重试" toast after 3 consecutive timeouts (>3s each)
    - _Requirements: 4.7, 8.5, 8.6, 10.4_

- [x] 18. Integration wiring and app shell
  - [x] 18.1 Wire app layout and navigation
    - Update `app/layout.tsx` with global providers (NextAuth SessionProvider, NetworkSyncProvider)
    - Create bottom navigation: Feed, Favorites, Follows, Settings
    - Implement auth guard middleware for protected routes
    - _Requirements: 1.4, 1.6_

  - [x] 18.2 Wire Feed page with all components
    - Update `app/page.tsx` to render FeedContainer
    - Connect FeedContainer → RepoCard → InteractionBar data flow
    - Ensure dwell time tracking fires on card transitions
    - Verify prefetch triggers when buffer runs low
    - _Requirements: 3.1-3.8, 10.1_

- [x] 19. Final checkpoint — Full integration verified
  - Ensure all tests pass, ask the user if questions arise.
  - Verify end-to-end flow: login → feed browsing → interactions → recommendation updates → offline queue sync

## Notes

- Tasks marked with `*` are optional property-based test tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints at tasks 4, 9, 13, and 19 ensure incremental validation
- Property tests validate universal correctness properties from the design document (25 properties total)
- Unit tests for specific examples (OAuth flows, UI rendering, CRUD operations) should be added alongside implementation as needed
- All `"use client"` components must be explicitly marked in their file headers
- Server Components should be used for static layouts and data prefetching where possible
