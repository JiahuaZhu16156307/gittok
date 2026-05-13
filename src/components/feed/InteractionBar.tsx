"use client";

import { useEffect } from "react";
import { useInteractionStore } from "@/stores/interaction-store";
import { useAuthStore } from "@/stores/auth-store";
import { useDiscussionCount } from "@/hooks/useDiscussionCount";

function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (count >= 1000) {
    const value = count / 1000;
    return value < 10
      ? `${value.toFixed(1).replace(/\.0$/, "")}K`
      : `${Math.round(value)}K`;
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
  isActive?: boolean;
  onComment?: () => void;
  onNotInterested?: () => void;
}

export function InteractionBar({
  repoId,
  repoFullName,
  owner,
  starCount,
  ownerAvatarUrl,
  metadata,
  isActive = true,
  onComment,
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

  const [repoOwner, repoName] = repoFullName.split("/");
  const starred = isStarred(repoOwner, repoName);
  const followed = isFollowed(owner);
  const interactionMetadata = metadata ?? { fullName: repoFullName };
  const discussionCount = useDiscussionCount(repoOwner, repoName, isActive);

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

  const handleStar = () => {
    if (!isAuthenticated) return;
    void toggleStar(repoOwner, repoName);
  };

  const handleFollow = () => {
    if (!isAuthenticated) return;
    void toggleFollow(owner);
  };

  const handleNotInterested = () => {
    void markNotInterested(repoId, interactionMetadata);
    onNotInterested?.();
  };

  const handleShare = async () => {
    const url = buildShareUrl(repoFullName);

    try {
      await navigator.share({
        title: `${repoFullName} - GitTok`,
        text: `我在 GitTok 发现了 ${repoFullName}，来这里一起刷 GitHub 仓库`,
        url,
      });
      return;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      alert("链接已复制到剪贴板");
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative mb-1 flex flex-col items-center">
        <div className="relative">
          <a
            href={`https://github.com/${owner}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`block h-12 w-12 overflow-hidden rounded-full ring-2 transition-all ${
              followed ? "ring-blue-400" : "ring-white/30"
            }`}
          >
            {ownerAvatarUrl ? (
              <img
                src={ownerAvatarUrl}
                alt={owner}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/20 text-sm font-bold text-white">
                {owner.charAt(0).toUpperCase()}
              </div>
            )}
          </a>

          <button
            type="button"
            onClick={handleFollow}
            disabled={!isAuthenticated}
            className={`absolute -bottom-1.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full shadow-lg transition-transform active:scale-90 disabled:opacity-50 ${
              followed ? "bg-blue-500" : "bg-red-500"
            }`}
            aria-label={followed ? `取消关注 ${owner}` : `关注 ${owner}`}
          >
            {followed ? (
              <svg viewBox="0 0 24 24" fill="white" className="h-3 w-3">
                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="white" className="h-3 w-3">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <InteractionButton
        onClick={handleStar}
        active={starred}
        disabled={!isAuthenticated}
        activeColor="text-yellow-400"
        label={formatCount(starCount)}
        icon={
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
            <path d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        }
      />

      <InteractionButton
        onClick={() => onComment?.()}
        active={false}
        disabled={false}
        activeColor=""
        label={formatCount(discussionCount)}
        icon={
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
            <path d="M4 4h16v12H7.17L4 19.17V4zm2 2v8.34L6.34 14H18V6H6zm2 3h8v2H8V9zm0 3h5v2H8v-2z" />
          </svg>
        }
      />

      <InteractionButton
        onClick={() => void handleShare()}
        active={false}
        disabled={false}
        activeColor=""
        label="分享"
        icon={
          <svg viewBox="0 0 48 48" fill="currentColor" className="h-7 w-7">
            <path d="M28 6v6.5c-9.8.4-17 4.7-20.3 13.5-1.1 3-.6 5.7.3 5.2 2.5-1.5 6.4-3.7 11-4.5 2-.3 5.5-.5 9-.2V33l14-13.5L28 6z" />
          </svg>
        }
      />

      <InteractionButton
        onClick={handleNotInterested}
        active={false}
        disabled={false}
        activeColor=""
        label="不感兴趣"
        icon={
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        }
      />
    </div>
  );
}

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
      className="group flex flex-col items-center gap-1"
      aria-label={label}
      aria-pressed={active}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-sm transition-all active:scale-90 ${
          active
            ? `bg-white/20 ${activeColor}`
            : disabled
              ? "cursor-not-allowed bg-white/5 text-white/40"
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
