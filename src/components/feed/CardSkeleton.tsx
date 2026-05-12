"use client";

/**
 * Loading skeleton placeholder that mirrors the TikTok-style RepoCard layout.
 *
 * Structure (matches RepoCard layers):
 * - Full-height dark background with subtle animate-pulse
 * - Top-left: recommendation reason pill placeholder
 * - Center: faded hero-sized repo name placeholder
 * - Bottom-left: info area (avatar + author, title, description, README, topics)
 * - Bottom-right: vertical action bar with 4 circular button placeholders
 * - Bottom strip: metadata placeholder
 *
 * Validates: Requirements 3.5
 */
export function CardSkeleton() {
  return (
    <div
      className="h-full w-full relative overflow-hidden bg-zinc-950 animate-pulse"
      aria-hidden="true"
    >
      {/* --- Top-left: recommendation reason pill placeholder --- */}
      <div className="absolute top-4 left-4 right-4 z-20">
        <div className="h-6 w-40 rounded-full bg-white/10" />
      </div>

      {/* --- Center: faded large repo name placeholder (hero) --- */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 px-8">
        <div className="h-16 w-64 max-w-[70%] rounded-lg bg-white/5" />
      </div>

      {/* --- Bottom-left: info area --- */}
      <div className="absolute bottom-16 left-4 right-16 z-10 space-y-2">
        {/* Avatar + author line */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/10 shrink-0" />
          <div className="h-4 w-24 rounded bg-white/10" />
        </div>

        {/* Title bar */}
        <div className="h-6 w-3/4 rounded bg-white/10" />

        {/* Description (2 lines) */}
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded bg-white/10" />
          <div className="h-3 w-5/6 rounded bg-white/10" />
        </div>

        {/* README summary (3 lines) */}
        <div className="space-y-1.5 pt-1">
          <div className="h-3 w-full rounded bg-white/5" />
          <div className="h-3 w-11/12 rounded bg-white/5" />
          <div className="h-3 w-3/4 rounded bg-white/5" />
        </div>

        {/* Topics row (3 pills) */}
        <div className="flex gap-1.5 pt-1">
          <div className="h-5 w-16 rounded-full bg-white/10" />
          <div className="h-5 w-20 rounded-full bg-white/10" />
          <div className="h-5 w-14 rounded-full bg-white/10" />
        </div>
      </div>

      {/* --- Bottom-right: vertical action bar (4 circular placeholders) --- */}
      <div className="absolute bottom-16 right-4 z-10 flex flex-col gap-5 items-center">
        <div className="w-12 h-12 rounded-full bg-white/10" />
        <div className="w-12 h-12 rounded-full bg-white/10" />
        <div className="w-12 h-12 rounded-full bg-white/10" />
        <div className="w-12 h-12 rounded-full bg-white/10" />
      </div>

      {/* --- Bottom strip: metadata placeholder --- */}
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <div className="h-3 w-full rounded bg-white/5" />
      </div>
    </div>
  );
}
