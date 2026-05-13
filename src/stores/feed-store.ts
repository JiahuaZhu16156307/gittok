"use client";

import { create } from "zustand";
import type { RepoCard } from "@/lib/types/repo";
import type { FeedResponse } from "@/lib/types/feed";

const BATCH_SIZE = 100;
const PREFETCH_THRESHOLD = 50;
const MAX_CACHE_SIZE = 500;

function createFeedSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface FeedState {
  cards: RepoCard[];
  currentIndex: number;
  page: number;
  feedSeed: string;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchNextBatch: () => Promise<void>;
  setCurrentIndex: (index: number) => void;
  getVisibleRange: () => [number, number];
  goNext: () => void;
  goPrevious: () => void;
  reset: () => void;
}

/**
 * Evicts oldest cards from the cache when it exceeds MAX_CACHE_SIZE,
 * but never removes cards within the visible range.
 */
function evictLRU(
  cards: RepoCard[],
  currentIndex: number
): { cards: RepoCard[]; currentIndex: number } {
  if (cards.length <= MAX_CACHE_SIZE) {
    return { cards, currentIndex };
  }

  const visibleStart = Math.max(0, currentIndex - 1);
  const excess = cards.length - MAX_CACHE_SIZE;
  const evictableCount = Math.min(excess, visibleStart);

  if (evictableCount <= 0) {
    return { cards, currentIndex };
  }

  const newCards = cards.slice(evictableCount);
  const newIndex = currentIndex - evictableCount;

  return { cards: newCards, currentIndex: newIndex };
}

function getSharedRepoParam(): string | null {
  if (typeof window === "undefined") return null;
  const repo = new URLSearchParams(window.location.search).get("repo");
  return repo && /^[^/\s]+\/[^/\s]+$/.test(repo) ? repo : null;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  cards: [],
  currentIndex: 0,
  page: 0,
  feedSeed: createFeedSeed(),
  hasMore: true,
  isLoading: false,
  error: null,

  fetchNextBatch: async () => {
    const { isLoading, hasMore, page, cards: existingCards, feedSeed } = get();

    // --- LOCK 1: Prevent concurrent or exhausted fetches ---
    if (isLoading || !hasMore) {
      return;
    }

    set({ isLoading: true, error: null });

    const nextPage = page + 1;

    try {
      const params = new URLSearchParams({
        limit: String(BATCH_SIZE),
        page: String(nextPage),
        seed: feedSeed,
      });
      const sharedRepo = nextPage === 1 ? getSharedRepoParam() : null;
      if (sharedRepo) {
        params.set("repo", sharedRepo);
      }

      const response = await fetch(`/api/feed?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Feed request failed with status ${response.status}`);
      }

      const data: FeedResponse = await response.json();

      // --- LOCK 2: Empty response = rotate to a fresh session instead of
      // showing a dead end in the recommendation feed.
      if (!data.cards || data.cards.length === 0) {
        set({
          cards: [],
          currentIndex: 0,
          page: 0,
          feedSeed: createFeedSeed(),
          hasMore: true,
          isLoading: false,
        });
        setTimeout(() => {
          const s = get();
          if (!s.isLoading && s.cards.length === 0) {
            void s.fetchNextBatch();
          }
        }, 0);
        return;
      }

      // --- LOCK 3: Deduplicate against existing cards by id ---
      const existingIds = new Set(existingCards.map((c) => c.id));
      const uniqueNewCards = data.cards.filter((c) => !existingIds.has(c.id));

      // If server returned cards but ALL were duplicates, we've hit a loop
      // — treat as no more data to prevent infinite fetch cycles.
      if (uniqueNewCards.length === 0) {
        set({
          cards: [],
          currentIndex: 0,
          page: 0,
          feedSeed: createFeedSeed(),
          hasMore: true,
          isLoading: false,
        });
        setTimeout(() => {
          const s = get();
          if (!s.isLoading && s.cards.length === 0) {
            void s.fetchNextBatch();
          }
        }, 0);
        return;
      }

      set((state) => {
        const mergedCards = [...state.cards, ...uniqueNewCards];
        const { cards: evictedCards, currentIndex: adjustedIndex } = evictLRU(
          mergedCards,
          state.currentIndex
        );

        return {
          cards: evictedCards,
          currentIndex: adjustedIndex,
          page: nextPage,
          hasMore: true,
          isLoading: false,
          error: null,
        };
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to fetch feed",
      });
    }
  },

  setCurrentIndex: (index: number) => {
    const { cards, hasMore, isLoading, fetchNextBatch } = get();
    const clampedIndex = Math.max(0, Math.min(index, cards.length - 1));

    set({ currentIndex: clampedIndex });

    // Prefetch when unviewed cards remaining <= threshold
    const unviewedRemaining = cards.length - clampedIndex - 1;
    if (unviewedRemaining <= PREFETCH_THRESHOLD && hasMore && !isLoading) {
      fetchNextBatch();
    }
  },

  getVisibleRange: (): [number, number] => {
    const { cards, currentIndex } = get();
    const start = Math.max(0, currentIndex - 1);
    const end = Math.min(cards.length - 1, currentIndex + 1);
    return [start, end];
  },

  goNext: () => {
    const { currentIndex, cards, setCurrentIndex } = get();
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  },

  goPrevious: () => {
    const { currentIndex, setCurrentIndex } = get();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  },

  reset: () => {
    set({
      cards: [],
      currentIndex: 0,
      page: 0,
      feedSeed: createFeedSeed(),
      hasMore: true,
      isLoading: false,
      error: null,
    });
  },
}));
