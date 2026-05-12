"use client";

import { useState } from "react";
import { FeedContainer } from "@/components/feed/FeedContainer";
import { TrendingFeed } from "@/components/feed/TrendingFeed";

/**
 * Home page with tab navigation: 推荐 | 热门
 */
export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"recommend" | "trending">("recommend");

  return (
    <main className="relative h-[100dvh] w-full bg-black overflow-hidden">
      {/* Tab bar at top */}
      <div className="absolute top-0 left-0 right-0 z-30 flex justify-center pt-3 pb-2">
        <div className="flex items-center gap-6 bg-black/40 backdrop-blur-md rounded-full px-5 py-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("recommend")}
            className={`text-sm font-semibold transition-all ${
              activeTab === "recommend"
                ? "text-white scale-105"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            推荐
            {activeTab === "recommend" && (
              <div className="mt-0.5 mx-auto w-4 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("trending")}
            className={`text-sm font-semibold transition-all ${
              activeTab === "trending"
                ? "text-white scale-105"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            热门
            {activeTab === "trending" && (
              <div className="mt-0.5 mx-auto w-4 h-0.5 bg-white rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Feed content */}
      <div className="h-full w-full max-w-md mx-auto relative md:shadow-2xl md:shadow-indigo-500/10 md:ring-1 md:ring-white/5">
        {activeTab === "recommend" ? <FeedContainer /> : <TrendingFeed />}
      </div>
    </main>
  );
}
