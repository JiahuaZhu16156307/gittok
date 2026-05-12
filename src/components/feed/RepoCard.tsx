"use client";

import type { RepoCard } from "@/lib/types";
import { InteractionBar } from "./InteractionBar";
import { useEnrichment } from "@/hooks/useEnrichment";

/**
 * Color map for common programming languages.
 */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  PHP: "#4F5D95",
  Shell: "#89e051",
  Zig: "#ec915c",
  Scala: "#c22d40",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  Vue: "#41b883",
  HTML: "#e34c26",
  CSS: "#563d7c",
};

const DEFAULT_COLOR = "#6366f1";

function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (count >= 1000) {
    const v = count / 1000;
    return v < 10 ? `${v.toFixed(1).replace(/\.0$/, "")}K` : `${Math.round(v)}K`;
  }
  return count.toString();
}

interface RepoCardProps {
  repo: RepoCard;
  recommendationReason?: string;
  onNotInterested?: () => void;
}

export function RepoCardComponent({ repo, recommendationReason, onNotInterested }: RepoCardProps) {
  const languageColor = repo.language
    ? LANGUAGE_COLORS[repo.language] ?? DEFAULT_COLOR
    : DEFAULT_COLOR;

  const { imageUrl, summary: cnSummary } = useEnrichment(repo.owner, repo.name);
  const displaySummary = cnSummary || repo.readmeSummary || repo.description || "";

  return (
    <article
      className="h-full w-full snap-center relative overflow-hidden bg-zinc-950 text-white"
      aria-label={`Repository ${repo.fullName}`}
    >
      {/* === BG Layer 1: Blurred image or gradient === */}
      {imageUrl ? (
        <>
          {/* Blurred background fill */}
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
            aria-hidden="true"
          />
          {/* Centered contained image — fills upper half */}
          <div className="absolute inset-x-0 top-0 h-[45%] flex items-center justify-center p-4">
            <img
              src={imageUrl}
              alt={repo.name}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
          {/* Dark overlay for text */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" aria-hidden="true" />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 30% 20%, ${languageColor}44, transparent 50%), radial-gradient(ellipse at 70% 80%, ${languageColor}22, transparent 50%), linear-gradient(to bottom, #111 0%, #0a0a0a 100%)`,
          }}
          aria-hidden="true"
        />
      )}

      {/* === BG Layer 2: Bottom gradient for text legibility === */}
      <div
        className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-none"
        aria-hidden="true"
      />

      {/* === Top: Recommendation reason pill === */}
      {recommendationReason && (
        <div className="absolute top-4 left-4 right-4 z-20">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-lg text-[11px] text-white/85 border border-white/10">
            <span>💡</span>
            <span className="truncate">{recommendationReason}</span>
          </div>
        </div>
      )}

      {/* === Middle-bottom: Info + Actions (top-aligned) === */}
      <div className="absolute top-[45%] bottom-[72px] left-0 right-0 z-10 px-4 flex items-start gap-3">
        {/* Left: Info area */}
        <div className="flex-1 min-w-0 space-y-1.5 [text-shadow:0_1px_3px_rgb(0_0_0_/_0.8)]">
          {/* Author */}
          <a
            href={`https://github.com/${repo.owner}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <img
              src={`https://github.com/${repo.owner}.png?size=80`}
              alt={repo.owner}
              className="w-10 h-10 rounded-full ring-2 ring-white/20"
            />
            <span className="text-[15px] font-semibold text-white/90">@{repo.owner}</span>
          </a>

          {/* Repo name */}
          <a
            href={`https://github.com/${repo.fullName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block hover:opacity-80 transition-opacity"
          >
            <h2 className="text-xl font-bold text-white leading-snug tracking-tight">
              {repo.name}
            </h2>
          </a>

          {/* Summary — with expand button, scrollable when expanded */}
          {displaySummary && (
            <SummaryBlock text={displaySummary} />
          )}
        </div>

        {/* Right: Interaction bar */}
        <div className="shrink-0">
          <InteractionBar
            repoId={repo.id}
            repoFullName={repo.fullName}
            owner={repo.owner}
            starCount={repo.starCount}
            ownerAvatarUrl={`https://github.com/${repo.owner}.png?size=96`}
            onNotInterested={onNotInterested}
          />
        </div>
      </div>

      {/* === Fixed bottom strip: Tags + Metadata (above bottom nav) === */}
      <div className="absolute bottom-16 left-4 right-4 z-10 space-y-1.5 [text-shadow:0_1px_3px_rgb(0_0_0_/_0.8)]">
        {/* Topics — full text, wrap to 2 rows, scrollable */}
        {repo.topics.length > 0 && (
          <div
            className="flex flex-wrap gap-1.5 max-h-[3.5rem] overflow-y-auto no-scrollbar"
            onWheel={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {repo.topics.map((topic) => (
              <span
                key={topic}
                className="px-2.5 py-1 rounded-md bg-white/8 text-[11px] font-medium text-white/80 border border-white/10 whitespace-nowrap"
              >
                #{topic}
              </span>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-3 text-[11px] text-white/50">
          {repo.language && (
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: languageColor }} />
              <span>{repo.language}</span>
            </span>
          )}
          <span>🍴 {formatCount(repo.forkCount)}</span>
        </div>
      </div>
    </article>
  );
}

/** Summary block — always expanded, scrollable */
function SummaryBlock({ text }: { text: string }) {
  return (
    <div
      className="max-h-[30vh] overflow-y-auto no-scrollbar"
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <p className="text-[13px] text-white/90 leading-relaxed whitespace-pre-wrap">
        {text}
      </p>
    </div>
  );
}

export default RepoCardComponent;
