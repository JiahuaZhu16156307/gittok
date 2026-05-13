"use client";

/**
 * InteractionBar - Vertical action bar for repository interactions.
 *
 * Renders buttons for: Star (⭐), Follow (user+),
 * Not Interested (X), and Open GitHub (external link).
 *
 * Star calls the real GitHub API to star/unstar repos.
 * Follow calls the real GitHub API to follow/unfollow users.
 *
 * Each button shows active state when toggled. Protected actions are
 * disabled for unauthenticated users.
 *
 * Validates: Requirements 4.1-4.5, 5.1, Property 22
 */

import { useEffect } from "react";
import { useInteractionStore } from "@/stores/interaction-store";
import { useAuthStore } from "@/stores/auth-store";

/** Format number with K/M suffix like TikTok */
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

const PUBLIC_APP_URL = "https://gittok.onrender.com/";

function isLocalPreviewHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function buildShareUrl(repoFullName: string): string {
  const base =
    typeof window !== "undefined" && !isLocalPreviewHost(window.location.hostname)
      ? window.location.origin
      : PUBLIC_APP_URL;
  const url = new URL("/", base);
  url.searchParams.set("repo", repoFullName);
  return url.toString();
}

interface InteractionBarProps {
  repoId: string;
  repoFullName: string;
  owner: string;
  starCount: number;
  ownerAvatarUrl?: string;
  metadata?: Record<string, unknown>;
  onNotInterested?: () => void;
}

export function InteractionBar({
  repoId,
  repoFullName,
  owner,
  starCount,
  ownerAvatarUrl,
  metadata,
  onNotInterested,
}: InteractionBarProps) {
  const { isAuthenticated } = useAuthStore();
  const {
    toggleStar,
    toggleFollow,
    markNotInterested,
    isStarred,
    isFollowed,
    checkStarStatus,
    checkFollowStatus,
  } = useInteractionStore();

  // Parse owner/repo from repoFullName
  const [repoOwner, repoName] = repoFullName.split("/");

  const starred = isStarred(repoOwner, repoName);
  const followed = isFollowed(owner);

  // Check real status from GitHub on mount
  useEffect(() => {
    if (isAuthenticated && repoOwner && repoName) {
      checkStarStatus(repoOwner, repoName);
    }
  }, [isAuthenticated, repoOwner, repoName, checkStarStatus]);

  useEffect(() => {
    if (isAuthenticated && owner) {
      checkFollowStatus(owner);
    }
  }, [isAuthenticated, owner, checkFollowStatus]);

  const interactionMetadata = metadata ?? { fullName: repoFullName };

  const handleStar = () => {
    if (!isAuthenticated) return;
    toggleStar(repoOwner, repoName);
  };

  const handleFollow = () => {
    if (!isAuthenticated) return;
    toggleFollow(owner);
  };

  const handleNotInterested = () => {
    markNotInterested(repoId, interactionMetadata);
    onNotInterested?.();
  };

  const handleComment = () => {
    const currentUrl =
      typeof window !== "undefined" ? window.location.href : "https://gittok.onrender.com/";
    const title = `关于 ${repoFullName} 的 GitTok 反馈`;
    const body = [
      `我在 GitTok 看到仓库：${repoFullName}`,
      "",
      `页面：${currentUrl}`,
      "",
      "我的建议：",
    ].join("\n");
    const discussionUrl = new URL("https://github.com/Mad12345-qw/gittok/discussions/new");
    discussionUrl.searchParams.set("category", "general");
    discussionUrl.searchParams.set("title", title);
    discussionUrl.searchParams.set("body", body);
    window.open(discussionUrl.toString(), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col gap-5 items-center">
      {/* Author Avatar + Follow (TikTok style: avatar with red + badge) */}
      <div className="flex flex-col items-center relative mb-1">
        <div className="relative">
          {/* Avatar — click opens GitHub profile */}
          <a
            href={`https://github.com/${owner}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`block w-12 h-12 rounded-full overflow-hidden ring-2 transition-all ${
              followed ? "ring-blue-400" : "ring-white/30"
            }`}
          >
            {ownerAvatarUrl ? (
              <img
                src={ownerAvatarUrl}
                alt={owner}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-white/20 flex items-center justify-center text-sm font-bold text-white">
                {owner.charAt(0).toUpperCase()}
              </div>
            )}
          </a>
          {/* Red + badge — click toggles follow (separate from avatar link) */}
          {!followed && (
            <button
              type="button"
              onClick={handleFollow}
              disabled={!isAuthenticated}
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-lg active:scale-90 transition-transform disabled:opacity-50"
              aria-label={`关注 ${owner}`}
            >
              <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </button>
          )}
          {/* Blue checkmark when already followed — click to unfollow */}
          {followed && (
            <button
              type="button"
              onClick={handleFollow}
              disabled={!isAuthenticated}
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
              aria-label={`取消关注 ${owner}`}
            >
              <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Star */}
      <InteractionButton
        onClick={handleStar}
        active={starred}
        disabled={!isAuthenticated}
        activeColor="text-yellow-400"
        label={formatCount(starCount)}
        icon={
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        }
      />

      {/* Share */}
      <InteractionButton
        onClick={async () => {
          const url = buildShareUrl(repoFullName);
          // Try native share first (works on mobile even on some HTTP contexts)
          try {
            await navigator.share({
              title: `${repoFullName} - GitTok`,
              text: `我在 GitTok 发现了 ${repoFullName}，来这里一起刷 GitHub 仓库`,
              url,
            });
            return;
          } catch (e: unknown) {
            // If AbortError = user cancelled, that's fine
            if (e instanceof Error && e.name === "AbortError") return;
            // Otherwise fall through to copy
          }
          // Fallback: copy to clipboard
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(url);
            } else {
              const ta = document.createElement("textarea");
              ta.value = url;
              ta.style.cssText = "position:fixed;opacity:0";
              document.body.appendChild(ta);
              ta.select();
              document.execCommand("copy");
              document.body.removeChild(ta);
            }
            alert("链接已复制到剪贴板");
          } catch {
            window.open(url, "_blank");
          }
        }}
        active={false}
        disabled={false}
        activeColor=""
        label="分享"
        icon={
          <svg viewBox="0 0 48 48" fill="currentColor" className="w-7 h-7">
            <path d="M28 6v6.5c-9.8.4-17 4.7-20.3 13.5-1.1 3-.6 5.7.3 5.2 2.5-1.5 6.4-3.7 11-4.5 2-.3 5.5-.5 9-.2V33l14-13.5L28 6z" />
          </svg>
        }
      />

      {/* Comment / feedback */}
      <InteractionButton
        onClick={handleComment}
        active={false}
        disabled={false}
        activeColor=""
        label="评论"
        icon={
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
            <path d="M4 4h16v12H7.17L4 19.17V4zm2 2v8.34L6.34 14H18V6H6zm2 3h8v2H8V9zm0 3h5v2H8v-2z" />
          </svg>
        }
      />

      {/* Not Interested */}
      <InteractionButton
        onClick={handleNotInterested}
        active={false}
        disabled={false}
        activeColor=""
        label="不感兴趣"
        icon={
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        }
      />
    </div>
  );
}

/** Individual interaction button */
function InteractionButton({
  onClick,
  active,
  disabled,
  activeColor,
  label,
  icon,
}: {
  onClick: () => void;
  active: boolean;
  disabled: boolean;
  activeColor: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 group"
      aria-label={label}
      aria-pressed={active}
    >
      <span
        className={`flex items-center justify-center w-12 h-12 rounded-full backdrop-blur-sm transition-all active:scale-90 ${
          active
            ? `bg-white/20 ${activeColor}`
            : disabled
            ? "bg-white/5 text-white/40 cursor-not-allowed"
            : "bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {icon}
      </span>
      <span className="text-[10px] font-medium text-white/70">{label}</span>
    </button>
  );
}

export default InteractionBar;
