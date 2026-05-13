"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RepoCardComponent } from "./RepoCard";
import { CardSkeleton } from "./CardSkeleton";
import type { RepoCard } from "@/lib/types";

/**
 * TrendingFeed — shows today's GitHub trending repos.
 * Same scroll-snap UX as the main feed but fetches from /api/feed/trending.
 */
export function TrendingFeed() {
  const [cards, setCards] = useState<RepoCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const fetchTrending = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/feed/trending?since=daily", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "热门榜单加载失败");
      }

      const nextCards = Array.isArray(data.cards) ? data.cards : [];
      setCards(nextCards);
      setHasMore(Boolean(data.hasMore));

      if (nextCards.length === 0) {
        setError("今天的 GitHub Trending 榜单暂时没有数据");
      }
    } catch (err) {
      setCards([]);
      setHasMore(false);
      setError(err instanceof Error ? err.message : "热门榜单加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  // IntersectionObserver for current card tracking + prefetch
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.index ?? "0");
            if (!Number.isNaN(idx)) {
              setCurrentIndex(idx);
            }
          }
        }
      },
      { root, threshold: [0.6] }
    );

    root.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [cards.length]);

  if (isLoading && cards.length === 0) {
    return <div className="h-full w-full"><CardSkeleton /></div>;
  }

  if (error && cards.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-zinc-950 text-white p-6">
        <div className="text-center">
          <p className="text-red-400 text-lg font-semibold mb-2">热门加载失败</p>
          <p className="text-white/60 text-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={fetchTrending}
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
      aria-label="Trending repositories"
    >
      {cards.map((card, index) => (
        <div
          key={card.id}
          data-index={index}
          className="h-full w-full snap-center shrink-0 relative"
        >
          <RepoCardComponent
            repo={card}
            isActive={Math.abs(index - currentIndex) <= 1}
          />
        </div>
      ))}

      {isLoading && cards.length > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-md">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-xs text-white/80">加载中...</span>
          </div>
        </div>
      )}

      {!isLoading && !hasMore && cards.length > 0 && currentIndex >= cards.length - 1 && (
        <div className="h-full w-full snap-center shrink-0 flex flex-col items-center justify-center bg-zinc-950 gap-3">
          <div className="text-2xl">🔥</div>
          <div className="text-white/60 text-sm">今日热门已看完</div>
        </div>
      )}
    </div>
  );
}
