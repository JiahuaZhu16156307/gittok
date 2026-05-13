"use client";

import { useState } from "react";

interface FeedTabsProps {
  activeTab: "recommend" | "trending";
  onTabChange: (tab: "recommend" | "trending") => void;
}

export function FeedTabs({ activeTab, onTabChange }: FeedTabsProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center pt-3 pb-2 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={() => onTabChange("recommend")}
          className={`text-[15px] font-semibold transition-all ${
            activeTab === "recommend"
              ? "text-white scale-105"
              : "text-white/50 hover:text-white/70"
          }`}
        >
          推荐
          {activeTab === "recommend" && (
            <div className="mt-0.5 mx-auto w-5 h-0.5 rounded-full bg-white" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onTabChange("trending")}
          className={`text-[15px] font-semibold transition-all ${
            activeTab === "trending"
              ? "text-white scale-105"
              : "text-white/50 hover:text-white/70"
          }`}
        >
          今日热门
          {activeTab === "trending" && (
            <div className="mt-0.5 mx-auto w-5 h-0.5 rounded-full bg-white" />
          )}
        </button>
      </div>
    </div>
  );
}
