"use client";

import { useRef, useState } from "react";
import type { RepoCard } from "@/lib/types";
import { InteractionBar } from "./InteractionBar";
import { DiscussionDrawer } from "./DiscussionDrawer";
import { useEnrichment } from "@/hooks/useEnrichment";
import { buildRepoInteractionMetadata } from "@/lib/utils/repo-interaction-metadata";

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

function hasChinese(text?: string | null): boolean {
  return Boolean(text && /[\u4e00-\u9fff]/.test(text));
}

function buildGeneratedSummary(repo: RepoCard): string {
  const language = repo.language ? `${repo.language} \u9879\u76ee` : "\u5f00\u6e90\u9879\u76ee";
  const stars = formatCount(repo.starCount);
  const forks = formatCount(repo.forkCount);
  const topics = repo.topics.slice(0, 4).map((topic) => `#${topic}`).join(" ");

  return [
    `${repo.fullName} \u662f\u4e00\u4e2a ${language}\uff0c\u76ee\u524d\u7ea6\u6709 ${stars} stars \u548c ${forks} forks\u3002`,
    topics ? `\u76f8\u5173\u65b9\u5411\uff1a${topics}` : "",
    "README \u6458\u8981\u6b63\u5728\u751f\u6210\u4e2d\uff0c\u7a0d\u540e\u4f1a\u81ea\u52a8\u66f4\u65b0\u4e3a\u66f4\u5b8c\u6574\u7684\u4e2d\u6587\u4ecb\u7ecd\u3002",
  ].filter(Boolean).join("\n");
}

function buildUnavailableSummary(repo: RepoCard): string {
  return `${repo.fullName} 的 README 摘要暂时没有生成成功，可能是 GitHub API 限流、网络超时或翻译服务不可用。GitTok 会稍后自动重试生成。`;
}

/** Format a date to relative time (e.g., "3天前", "2小时前") or absolute date */
function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
}

interface RepoCardProps {
  repo: RepoCard;
  recommendationReason?: string;
  isActive?: boolean;
  onNotInterested?: () => void;
}

export function RepoCardComponent({
  repo,
  recommendationReason,
  isActive = true,
  onNotInterested,
}: RepoCardProps) {
  const [isDiscussionOpen, setIsDiscussionOpen] = useState(false);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());
  const languageColor = repo.language
    ? LANGUAGE_COLORS[repo.language] ?? DEFAULT_COLOR
    : DEFAULT_COLOR;

  const {
    imageUrl,
    summary: cnSummary,
    status: enrichmentStatus,
    isLoading: isEnrichmentLoading,
  } = useEnrichment(
    repo.owner,
    repo.name,
    isActive
  );
  const generatedSummary = buildGeneratedSummary(repo);
  const displaySummary = (enrichmentStatus === "ready" || !enrichmentStatus) && hasChinese(cnSummary)
    ? cnSummary
    : enrichmentStatus === "unavailable"
      ? buildUnavailableSummary(repo)
    : isEnrichmentLoading
      ? generatedSummary
      : generatedSummary;
  const interactionMetadata = buildRepoInteractionMetadata(repo);
  const candidateImageUrl = imageUrl ?? repo.readmeImageUrl ?? null;
  const displayImageUrl =
    candidateImageUrl && !failedImageUrls.has(candidateImageUrl) ? candidateImageUrl : null;

  const handleImageError = (failedUrl: string) => {
    setFailedImageUrls((current) => {
      if (current.has(failedUrl)) return current;
      const next = new Set(current);
      next.add(failedUrl);
      return next;
    });
  };

  return (
    <article
      className="h-full w-full snap-center relative overflow-hidden bg-zinc-950 text-white"
      aria-label={`Repository ${repo.fullName}`}
    >
      {/* === BG Layer 1: Blurred image or gradient === */}
      {displayImageUrl ? (
        <>
          {/* Blurred background fill */}
          <img
            src={displayImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
            aria-hidden="true"
            onError={() => handleImageError(displayImageUrl)}
          />
          {/* Centered contained image — fills upper half */}
          <div className="absolute inset-x-0 top-0 h-[45%] flex items-center justify-center p-4">
            <img
              src={displayImageUrl}
              alt={repo.name}
              className="max-w-full max-h-full object-contain rounded-lg"
              onError={() => handleImageError(displayImageUrl)}
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

      {/* === Fixed identity + protected reading area === */}
      <div className="absolute left-4 right-[5.25rem] top-[45%] bottom-[calc(var(--feed-bottom-clearance)+0.75rem)] z-10 flex min-h-0 flex-col [text-shadow:0_1px_3px_rgb(0_0_0_/_0.8)]">
        {/* Author */}
        <a
          href={`https://github.com/${repo.owner}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-2.5 hover:opacity-80 transition-opacity"
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
          className="mt-2 block hover:opacity-80 transition-opacity"
        >
          <h2 className="text-xl font-bold text-white leading-snug tracking-tight">
            {repo.name}
          </h2>
        </a>

        {/* Update date — use lastCommitAt (GitHub pushed_at) to match the "Updated" timestamp on github.com */}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/50">
          <span>🕐 更新于 {formatDate(repo.lastCommitAt)}</span>
        </div>

        <div className="relative mt-2 min-h-0 flex-1">
          <ProtectedContentScroll>
            <div className="flex min-h-full flex-col gap-3 pb-1">
              {displaySummary && (
                <p className="text-[13px] text-white/90 leading-relaxed whitespace-pre-wrap">
                  {displaySummary}
                </p>
              )}

              <div className="mt-auto space-y-2 pt-2">
                {repo.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
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

                <div className="flex items-center gap-3 text-[11px] text-white/55">
                  {repo.language && (
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: languageColor }} />
                      <span>{repo.language}</span>
                    </span>
                  )}
                  <span>🍴 {formatCount(repo.forkCount)}</span>
                </div>
              </div>
            </div>
          </ProtectedContentScroll>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-black/35 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/80 to-transparent" />
        </div>
      </div>

      {/* === Right: fixed action rail, outside the protected reading area === */}
      <div className="absolute right-4 top-[45%] z-20">
        <InteractionBar
          repoId={repo.id}
          repoFullName={repo.fullName}
          owner={repo.owner}
          starCount={repo.starCount}
          ownerAvatarUrl={`https://github.com/${repo.owner}.png?size=96`}
          metadata={interactionMetadata}
          isActive={isActive}
          onComment={() => setIsDiscussionOpen(true)}
          onNotInterested={onNotInterested}
        />
      </div>

      <DiscussionDrawer
        open={isDiscussionOpen}
        owner={repo.owner}
        repo={repo.name}
        repoFullName={repo.fullName}
        onClose={() => setIsDiscussionOpen(false)}
      />
    </article>
  );
}

function canScrollInDirection(element: HTMLElement, deltaY: number): boolean {
  const maxScrollTop = element.scrollHeight - element.clientHeight;
  if (maxScrollTop <= 1) return false;
  if (deltaY > 0) return element.scrollTop < maxScrollTop - 1;
  if (deltaY < 0) return element.scrollTop > 1;
  return false;
}

function hasScrollableOverflow(element: HTMLElement): boolean {
  return element.scrollHeight - element.clientHeight > 1;
}

function ProtectedContentScroll({ children }: { children: React.ReactNode }) {
  const touchStartYRef = useRef<number | null>(null);

  return (
    <div
      className="h-full overflow-y-auto no-scrollbar pr-1 overscroll-y-contain touch-pan-y"
      role="region"
      aria-label="仓库详情"
      tabIndex={0}
      onWheel={(e) => {
        if (!hasScrollableOverflow(e.currentTarget)) return;

        e.stopPropagation();
        if (!canScrollInDirection(e.currentTarget, e.deltaY)) {
          e.preventDefault();
        }
      }}
      onTouchStart={(e) => {
        touchStartYRef.current = e.touches[0]?.clientY ?? null;
        e.stopPropagation();
      }}
      onTouchMove={(e) => {
        const startY = touchStartYRef.current;
        const currentY = e.touches[0]?.clientY;
        if (startY === null || currentY === undefined) return;

        const deltaY = startY - currentY;
        if (!hasScrollableOverflow(e.currentTarget)) return;

        e.stopPropagation();
        if (!canScrollInDirection(e.currentTarget, deltaY)) {
          e.preventDefault();
        }
      }}
      onTouchEnd={() => {
        touchStartYRef.current = null;
      }}
      onKeyDown={(e) => {
        const keyDelta: Record<string, number> = {
          ArrowDown: 40,
          PageDown: e.currentTarget.clientHeight,
          ArrowUp: -40,
          PageUp: -e.currentTarget.clientHeight,
        };
        const deltaY = keyDelta[e.key];
        if (deltaY !== undefined && hasScrollableOverflow(e.currentTarget)) {
          e.stopPropagation();
          if (!canScrollInDirection(e.currentTarget, deltaY)) {
            e.preventDefault();
          }
        }
      }}
    >
      {children}
    </div>
  );
}

export default RepoCardComponent;
