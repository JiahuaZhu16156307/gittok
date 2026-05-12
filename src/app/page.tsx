import { FeedContainer } from "@/components/feed/FeedContainer";

/**
 * Home page — the GitTok feed.
 *
 * Layout:
 * - Full-height viewport with a centered phone-sized column on desktop
 * - Mobile: edge-to-edge
 * - Desktop: max-w-md centered with subtle ambient glow on either side
 */
export default function HomePage() {
  return (
    <main className="relative h-[100dvh] w-full bg-black overflow-hidden">
      {/* Ambient glow behind the phone frame (visible only on desktop) */}
      <div
        aria-hidden="true"
        className="hidden md:block absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.15),_transparent_50%)] pointer-events-none"
      />

      {/* Phone-sized centered column */}
      <div className="relative max-w-md mx-auto h-[100dvh] bg-black overflow-hidden md:shadow-2xl md:shadow-indigo-500/10 md:ring-1 md:ring-white/5">
        <FeedContainer />
      </div>

      {/* Desktop-only brand label */}
      <div
        aria-hidden="true"
        className="hidden md:block absolute top-6 left-6 text-white/40 text-sm font-mono tracking-tight select-none"
      >
        GitTok · swipe with ↑↓
      </div>
    </main>
  );
}
