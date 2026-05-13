"use client";

import { useEffect, useRef, useCallback } from "react";
import { useFeedStore } from "@/stores/feed-store";
import { RepoCardComponent } from "./RepoCard";
import { CardSkeleton } from "./CardSkeleton";
import { buildRepoInteractionMetadata } from "@/lib/utils/repo-interaction-metadata";
import { classifyDwellTime } from "@/lib/utils/dwell-time-classifier";

/**
 * FeedContainer manages the TikTok-style vertical swipe feed using
 * native CSS scroll-snap. Browser-native snapping gives the smoothest,
 * most "TikTok-like" experience across desktop and mobile.
 *
 * Key behaviors:
 * - CSS scroll-snap (snap-y snap-mandatory) on a vertically scrollable viewport
 * - IntersectionObserver tracks which card is currently active (>= 60% visible)
 * - Dwell time tracking per card
 * - Keyboard (ArrowUp/ArrowDown/PageUp/PageDown) and wheel nudge navigation
 * - Loads more cards automatically via the feed store's prefetch trigger
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.5, 10.1
 */
export function FeedContainer() {
  const {
    cards,
    currentIndex,
    isLoading,
    error,
    hasMore,
    fetchNextBatch,
    setCurrentIndex,
  } = useFeedStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const dwellStartRef = useRef<number>(Date.now());
  const lastIndexRef = useRef<number>(0);
  const recordedDwellRef = useRef<Set<string>>(new Set());

  // --- Load initial batch ---
  useEffect(() => {
    if (cards.length === 0 && !isLoading) {
      fetchNextBatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordDwellEvent = useCallback((index: number, dwellTimeMs: number) => {
    const repo = cards[index];
    if (!repo || dwellTimeMs <= 0 || dwellTimeMs >= 300_000) return;

    const type = classifyDwellTime(dwellTimeMs);
    const key = `${repo.id}:${index}:${type}`;
    if (recordedDwellRef.current.has(key)) return;
    recordedDwellRef.current.add(key);

    fetch("/api/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        repoId: repo.id,
        repoFullName: repo.fullName,
        type,
        dwellTimeMs,
        metadata: buildRepoInteractionMetadata(repo),
      }),
    }).catch(() => {
      recordedDwellRef.current.delete(key);
    });
  }, [cards]);

  // --- Track dwell time on index change ---
  useEffect(() => {
    const now = Date.now();
    const dwell = now - dwellStartRef.current;
    if (lastIndexRef.current !== currentIndex) {
      recordDwellEvent(lastIndexRef.current, dwell);
    }
    dwellStartRef.current = now;
    lastIndexRef.current = currentIndex;
  }, [currentIndex, recordDwellEvent]);

  useEffect(() => {
    const flushCurrentDwell = () => {
      recordDwellEvent(lastIndexRef.current, Date.now() - dwellStartRef.current);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushCurrentDwell();
      }
    };

    window.addEventListener("beforeunload", flushCurrentDwell);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", flushCurrentDwell);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [recordDwellEvent]);

  // --- IntersectionObserver: detect which card is centered ---
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry with the highest intersection ratio
        let topEntry: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (!topEntry || entry.intersectionRatio > topEntry.intersectionRatio) {
            topEntry = entry;
          }
        }

        if (topEntry && topEntry.intersectionRatio >= 0.6) {
          const index = Number(
            (topEntry.target as HTMLElement).dataset.index ?? "0"
          );
          if (!Number.isNaN(index)) {
            setCurrentIndex(index);
          }
        }
      },
      {
        root,
        threshold: [0, 0.25, 0.5, 0.6, 0.75, 1],
      }
    );

    // Observe all current card nodes
    cardRefs.current.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [cards.length, setCurrentIndex]);

  // --- Programmatic scroll helpers ---
  const scrollToIndex = useCallback((index: number) => {
    const el = cardRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const goNext = useCallback(() => {
    const target = Math.min(currentIndex + 1, cards.length - 1);
    scrollToIndex(target);
  }, [currentIndex, cards.length, scrollToIndex]);

  const goPrev = useCallback(() => {
    const target = Math.max(currentIndex - 1, 0);
    scrollToIndex(target);
  }, [currentIndex, scrollToIndex]);

  // --- Keyboard navigation ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
        case "PageDown":
        case "j":
          e.preventDefault();
          goNext();
          break;
        case "ArrowUp":
        case "PageUp":
        case "k":
          e.preventDefault();
          goPrev();
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  // --- Register card refs ---
  const registerCardRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      if (el) {
        cardRefs.current.set(index, el);
      } else {
        cardRefs.current.delete(index);
      }
    },
    []
  );

  // --- Initial loading state ---
  if (isLoading && cards.length === 0) {
    return (
      <div className="h-full w-full">
        <CardSkeleton />
      </div>
    );
  }

  // --- Error state ---
  if (error && cards.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-zinc-950 text-white p-6">
        <div className="text-center">
          <p className="text-red-400 text-lg font-semibold mb-2">加载失败</p>
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button
            onClick={() => fetchNextBatch()}
            className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium active:scale-95 transition"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="h-full w-full overflow-y-scroll snap-y snap-mandatory scroll-smooth no-scrollbar bg-black"
      role="feed"
      aria-label="Repository feed"
      tabIndex={0}
    >
      {cards.map((card, index) => (
        <div
          key={card.id}
          ref={registerCardRef(index)}
          data-index={index}
          className="h-full w-full snap-center shrink-0 relative"
        >
          <RepoCardComponent
            repo={card}
            isActive={Math.abs(index - currentIndex) <= 1}
            onNotInterested={goNext}
          />
        </div>
      ))}

      {/* Tail loading indicator — shown when near end of buffer and loading more */}
      {isLoading && cards.length > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-md shadow-lg">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-xs text-white/80 font-medium">加载中...</span>
          </div>
        </div>
      )}

      {/* End-of-feed marker — only when server confirms no more data */}
      {!isLoading && cards.length > 0 && !hasMore && currentIndex >= cards.length - 1 && (
        <div className="h-full w-full snap-center shrink-0 flex flex-col items-center justify-center bg-zinc-950 gap-3">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-2xl">
            🎉
          </div>
          <div className="text-white/60 text-sm">没有更多了</div>
          <div className="text-white/40 text-xs">已经看到底啦，刷新页面重新探索</div>
        </div>
      )}
    </div>
  );
}

export default FeedContainer;
