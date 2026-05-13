"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { refreshDiscussionCountCache } from "@/hooks/useDiscussionCount";

type ActiveTab = "gittok" | "github";

interface DiscussionAuthor {
  login: string;
  avatarUrl: string;
  url: string;
}

interface DiscussionComment {
  id: string;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  replyToId: string | null;
  author: DiscussionAuthor | null;
}

interface DiscussionCategory {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  isAnswerable: boolean;
}

interface RepositoryDiscussion {
  id: string;
  number: number;
  title: string;
  bodyText: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  closed: boolean;
  locked: boolean;
  upvoteCount: number;
  author: DiscussionAuthor | null;
  commentsTotalCount: number;
  comments: DiscussionComment[];
}

interface DiscussionsResponse {
  repository: {
    id: string;
    nameWithOwner: string;
    url: string;
    hasDiscussionsEnabled: boolean;
  };
  categories: DiscussionCategory[];
  discussionsTotalCount: number;
  discussions: RepositoryDiscussion[];
}

interface GitTokCommentAuthor {
  id: string | null;
  name: string;
  avatarUrl: string | null;
}

interface GitTokComment {
  id: string;
  repoFullName: string;
  body: string;
  replyToId: string | null;
  author: GitTokCommentAuthor;
  createdAt: string;
  updatedAt: string;
}

interface GitTokCommentsResponse {
  repoFullName: string;
  totalCount: number;
  comments: GitTokComment[];
}

interface DiscussionDrawerProps {
  open: boolean;
  owner: string;
  repo: string;
  repoFullName: string;
  onClose: () => void;
}

function formatTime(value: string): string {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 2) return "昨天";
  if (days < 30) return `${days}天前`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function splitOfficialComments(comments: DiscussionComment[]) {
  const roots: DiscussionComment[] = [];
  const replies = new Map<string, DiscussionComment[]>();

  comments.forEach((comment) => {
    if (!comment.replyToId) {
      roots.push(comment);
      return;
    }
    const bucket = replies.get(comment.replyToId) ?? [];
    bucket.push(comment);
    replies.set(comment.replyToId, bucket);
  });

  comments.forEach((comment) => {
    if (comment.replyToId && !comments.some((item) => item.id === comment.replyToId)) {
      roots.push(comment);
    }
  });

  return { roots, replies };
}

function splitGitTokComments(comments: GitTokComment[]) {
  const roots: GitTokComment[] = [];
  const replies = new Map<string, GitTokComment[]>();

  comments.forEach((comment) => {
    if (!comment.replyToId) {
      roots.push(comment);
      return;
    }
    const bucket = replies.get(comment.replyToId) ?? [];
    bucket.push(comment);
    replies.set(comment.replyToId, bucket);
  });

  comments.forEach((comment) => {
    if (comment.replyToId && !comments.some((item) => item.id === comment.replyToId)) {
      roots.push(comment);
    }
  });

  return { roots, replies };
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const payload = await res.json().catch(() => ({}));
    return { res, payload };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("请求超时，请稍后重试。");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function DiscussionDrawer({
  open,
  owner,
  repo,
  repoFullName,
  onClose,
}: DiscussionDrawerProps) {
  const { login } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>("gittok");

  const [siteComments, setSiteComments] = useState<GitTokComment[]>([]);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [isSiteLoading, setIsSiteLoading] = useState(false);
  const [siteReplyTo, setSiteReplyTo] = useState<GitTokComment | null>(null);

  const [data, setData] = useState<DiscussionsResponse | null>(null);
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string | null>(null);
  const [officialReplyTo, setOfficialReplyTo] = useState<DiscussionComment | null>(null);
  const [officialError, setOfficialError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [isOfficialLoading, setIsOfficialLoading] = useState(false);
  const [upvotingCommentId, setUpvotingCommentId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingDiscussion, setIsCreatingDiscussion] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [draft, setDraft] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedDiscussion = useMemo(() => {
    if (!data?.discussions.length || !selectedDiscussionId) return null;
    return data.discussions.find((discussion) => discussion.id === selectedDiscussionId) ?? null;
  }, [data, selectedDiscussionId]);

  const discussionUrl = `https://github.com/${repoFullName}/discussions`;
  const canCreateOfficialTopic =
    activeTab === "github" &&
    Boolean(data?.repository.hasDiscussionsEnabled) &&
    Boolean(data?.categories.length);
  const officialDiscussionCount = data?.discussionsTotalCount ?? 0;
  const totalCommentCount = siteComments.length + officialDiscussionCount;

  const handleLogin = useCallback(() => {
    const callbackUrl =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : "/";
    void login(callbackUrl);
  }, [login]);

  const loadSiteComments = useCallback(async () => {
    if (!open) return;
    setIsSiteLoading(true);
    setSiteError(null);

    try {
      const res = await fetch(
        `/api/gittok/comments?repoFullName=${encodeURIComponent(repoFullName)}`
      );
      const payload = (await res.json()) as Partial<GitTokCommentsResponse> & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "GitTok 评论加载失败");
      }
      setSiteComments(payload.comments ?? []);
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : "GitTok 评论加载失败");
    } finally {
      setIsSiteLoading(false);
    }
  }, [open, repoFullName]);

  const loadOfficialDiscussions = useCallback(
    async (quiet = false) => {
      if (!open) return;
      if (!quiet) setIsOfficialLoading(true);
      setOfficialError(null);
      setNeedsLogin(false);

      try {
        const res = await fetch(
          `/api/github/discussions?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
        );
        const payload = await res.json();
        if (!res.ok) {
          setNeedsLogin(Boolean(payload.needsLogin));
          throw new Error(payload.error || "官方讨论加载失败");
        }

        setData(payload);
        setSelectedCategoryId((current) => current || payload.categories?.[0]?.id || "");
        setSelectedDiscussionId((current) => {
          if (current && payload.discussions.some((item: RepositoryDiscussion) => item.id === current)) {
            return current;
          }
          return null;
        });
      } catch (error) {
        setOfficialError(error instanceof Error ? error.message : "官方讨论加载失败");
      } finally {
        if (!quiet) setIsOfficialLoading(false);
      }
    },
    [open, owner, repo]
  );

  useEffect(() => {
    if (!open) return;
    void loadSiteComments();
    void loadOfficialDiscussions();
    const timer = window.setInterval(() => void loadOfficialDiscussions(true), 15_000);
    return () => window.clearInterval(timer);
  }, [open, loadSiteComments, loadOfficialDiscussions]);

  useEffect(() => {
    if (!open) {
      setActiveTab("gittok");
      setDraft("");
      setComposerError(null);
      setSiteReplyTo(null);
      setOfficialReplyTo(null);
      setSelectedDiscussionId(null);
      setIsCreating(false);
      setNewTitle("");
      setNewBody("");
    }
  }, [open]);

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setDraft("");
    setComposerError(null);
    setSiteReplyTo(null);
    setOfficialReplyTo(null);
  };

  const toggleDiscussion = (discussionId: string) => {
    setIsCreating(false);
    setSelectedDiscussionId((current) => (current === discussionId ? null : discussionId));
    setOfficialReplyTo(null);
    setComposerError(null);
  };

  const updateOfficialComment = (commentId: string, patch: Partial<DiscussionComment>) => {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        discussions: current.discussions.map((discussion) => ({
          ...discussion,
          comments: discussion.comments.map((comment) =>
            comment.id === commentId ? { ...comment, ...patch } : comment
          ),
        })),
      };
    });
  };

  const appendOfficialComment = (comment: DiscussionComment) => {
    if (!selectedDiscussion) return;
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        discussions: current.discussions.map((discussion) =>
          discussion.id === selectedDiscussion.id
            ? {
                ...discussion,
                commentsTotalCount: discussion.commentsTotalCount + 1,
                comments: [...discussion.comments, comment],
              }
            : discussion
        ),
      };
    });
  };

  const submitNewOfficialDiscussion = async () => {
    if (!data || !newTitle.trim() || !newBody.trim() || !selectedCategoryId) return;

    setIsCreatingDiscussion(true);
    setOfficialError(null);
    try {
      const { res, payload } = await fetchJsonWithTimeout(
        "/api/github/discussions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repositoryId: data.repository.id,
            categoryId: selectedCategoryId,
            title: newTitle.trim(),
            body: newBody.trim(),
          }),
        },
        16000
      );
      if (!res.ok) {
        if (payload.needsLogin) setNeedsLogin(true);
        throw new Error(payload.error || "话题创建失败，请稍后重试。");
      }

      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          discussionsTotalCount: current.discussionsTotalCount + 1,
          discussions: [payload.discussion, ...current.discussions],
        };
      });
      setSelectedDiscussionId(payload.discussion.id);
      setIsCreating(false);
      setNewTitle("");
      setNewBody("");
    } catch (error) {
      setOfficialError(error instanceof Error ? error.message : "话题创建失败，请稍后重试。");
    } finally {
      setIsCreatingDiscussion(false);
    }
  };

  const submitGitTokComment = async () => {
    if (!draft.trim()) return;

    setIsSubmitting(true);
    setComposerError(null);
    try {
      const { res, payload } = await fetchJsonWithTimeout(
        "/api/gittok/comments",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoFullName,
            body: draft.trim(),
            replyToId: siteReplyTo?.id ?? null,
          }),
        },
        12000
      );
      if (!res.ok) {
        throw new Error(payload.error || "GitTok 评论发布失败");
      }
      setSiteComments((current) => [...current, payload.comment]);
      refreshDiscussionCountCache(owner, repo, {
        siteCount: siteComments.length + 1,
        officialCount: officialDiscussionCount,
      });
      setDraft("");
      setSiteReplyTo(null);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "GitTok 评论发布失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitOfficialComment = async () => {
    if (!selectedDiscussion || !draft.trim()) return;

    setIsSubmitting(true);
    setComposerError(null);
    try {
      const { res, payload } = await fetchJsonWithTimeout(
        "/api/github/discussions/comment",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discussionId: selectedDiscussion.id,
            body: draft.trim(),
            replyToId: officialReplyTo?.id ?? null,
          }),
        },
        16000
      );
      if (!res.ok) {
        if (payload.needsLogin) setNeedsLogin(true);
        throw new Error(payload.error || "评论发布失败");
      }
      appendOfficialComment(payload.comment);
      setDraft("");
      setOfficialReplyTo(null);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "评论发布失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitComposer = () => {
    if (activeTab === "gittok") {
      void submitGitTokComment();
      return;
    }
    void submitOfficialComment();
  };

  const toggleUpvote = async (comment: DiscussionComment) => {
    if (upvotingCommentId) return;

    const nextUpvoted = !comment.viewerHasUpvoted;
    setUpvotingCommentId(comment.id);
    updateOfficialComment(comment.id, {
      viewerHasUpvoted: nextUpvoted,
      upvoteCount: Math.max(0, comment.upvoteCount + (nextUpvoted ? 1 : -1)),
    });

    try {
      const res = await fetch("/api/github/discussions/upvote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentId: comment.id,
          upvote: nextUpvoted,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (payload.needsLogin) {
          setNeedsLogin(true);
          setComposerError(payload.error || "登录 GitHub 后才能点赞。");
        }
        throw new Error(payload.error || "点赞失败");
      }
      updateOfficialComment(comment.id, {
        viewerHasUpvoted: payload.comment.viewerHasUpvoted,
        upvoteCount: payload.comment.upvoteCount,
      });
    } catch {
      updateOfficialComment(comment.id, {
        viewerHasUpvoted: comment.viewerHasUpvoted,
        upvoteCount: comment.upvoteCount,
      });
    } finally {
      setUpvotingCommentId(null);
    }
  };

  const startSiteReply = (comment: GitTokComment) => {
    setSiteReplyTo(comment);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const startOfficialReply = (comment: DiscussionComment) => {
    setIsCreating(false);
    setOfficialReplyTo(comment);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  if (!open) return null;

  const isComposerDisabled =
    activeTab === "github" &&
    (!selectedDiscussion || selectedDiscussion.locked || selectedDiscussion.closed);
  const replyLabel =
    activeTab === "gittok"
      ? siteReplyTo?.author.name
      : officialReplyTo?.author?.login;

  return (
    <div
      className="absolute inset-0 z-50 flex items-end bg-black/25"
      role="dialog"
      aria-modal="true"
      aria-label={`${repoFullName} 评论`}
      onClick={onClose}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <section
        className="flex max-h-[82dvh] min-h-[58dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-[18px] bg-zinc-50 text-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-zinc-200/80 bg-zinc-50/95 px-4 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300" />
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-200 text-zinc-600">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-zinc-500">
                {repoFullName}
              </p>
              <h3 className="truncate text-[17px] font-semibold">评论区</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                共 {totalCommentCount} 条 · GitTok {siteComments.length} 条 · 官方 {officialDiscussionCount} 个话题
              </p>
            </div>
            {activeTab === "github" && (
              <button
                type="button"
                onClick={() => {
                  setIsCreating((value) => !value);
                  setSelectedDiscussionId(null);
                  setOfficialReplyTo(null);
                }}
                disabled={isOfficialLoading || !canCreateOfficialTopic}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 active:scale-95 disabled:opacity-40"
                aria-label="新增官方话题"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </button>
            )}
            <a
              href={selectedDiscussion?.url ?? discussionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 active:scale-95"
              aria-label="在 GitHub 打开"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M7 17 17 7" />
                <path d="M8 7h9v9" />
              </svg>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-800 active:scale-95"
              aria-label="关闭评论"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 rounded-full bg-zinc-200/80 p-1 text-sm font-semibold">
            <TabButton
              active={activeTab === "gittok"}
              label={`GitTok 评论 ${siteComments.length}`}
              onClick={() => switchTab("gittok")}
            />
            <TabButton
              active={activeTab === "github"}
              label={`官方讨论 ${officialDiscussionCount}`}
              onClick={() => switchTab("github")}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {activeTab === "gittok" ? (
            <GitTokCommentsPanel
              comments={siteComments}
              error={siteError}
              isLoading={isSiteLoading}
              onReply={startSiteReply}
            />
          ) : (
            <OfficialDiscussionsPanel
              data={data}
              error={officialError}
              isLoading={isOfficialLoading}
              needsLogin={needsLogin}
              isCreating={isCreating}
              selectedDiscussionId={selectedDiscussionId}
              selectedCategoryId={selectedCategoryId}
              newTitle={newTitle}
              newBody={newBody}
              isCreatingDiscussion={isCreatingDiscussion}
              discussionUrl={discussionUrl}
              onLogin={handleLogin}
              onToggleDiscussion={toggleDiscussion}
              onReply={startOfficialReply}
              onToggleUpvote={toggleUpvote}
              onCategoryChange={setSelectedCategoryId}
              onTitleChange={setNewTitle}
              onBodyChange={setNewBody}
              onCancelCreate={() => setIsCreating(false)}
              onSubmitCreate={submitNewOfficialDiscussion}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 bg-zinc-50 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2">
          {composerError && (
            <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
              {composerError}
              {needsLogin && activeTab === "github" && (
                <button
                  type="button"
                  onClick={handleLogin}
                  className="ml-2 font-semibold text-rose-900 underline underline-offset-2"
                >
                  去登录
                </button>
              )}
            </div>
          )}
          {replyLabel && (
            <div className="mb-2 flex items-center justify-between rounded-full bg-zinc-200 px-3 py-1.5 text-xs text-zinc-600">
              <span className="truncate">回复 @{replyLabel}</span>
              <button
                type="button"
                onClick={() => {
                  setSiteReplyTo(null);
                  setOfficialReplyTo(null);
                }}
                className="ml-3 text-zinc-900"
              >
                取消
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-[22px] bg-zinc-100 px-3 py-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              rows={1}
              maxLength={activeTab === "gittok" ? 2000 : 4000}
              placeholder={
                activeTab === "gittok"
                  ? "发条 GitTok 评论，所有仓库都能留言"
                  : !selectedDiscussion
                    ? "先点开一个官方话题，再发表评论"
                    : selectedDiscussion.locked || selectedDiscussion.closed
                      ? "该话题已关闭"
                      : "同步到 GitHub Discussions"
              }
              disabled={isComposerDisabled || isSubmitting}
              className="max-h-28 min-h-[2rem] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-5 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={submitComposer}
              disabled={!draft.trim() || isSubmitting || isComposerDisabled}
              className="mb-0.5 shrink-0 rounded-full bg-zinc-950 px-3 py-1.5 text-sm font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
            >
              {isSubmitting ? "发送中" : "发送"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2 transition ${
        active ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500"
      }`}
    >
      {label}
    </button>
  );
}

function GitTokCommentsPanel({
  comments,
  error,
  isLoading,
  onReply,
}: {
  comments: GitTokComment[];
  error: string | null;
  isLoading: boolean;
  onReply: (comment: GitTokComment) => void;
}) {
  const { roots, replies } = splitGitTokComments(comments);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
        正在加载 GitTok 评论...
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!roots.length) {
    return (
      <div className="flex h-52 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-semibold text-zinc-800">还没有 GitTok 评论</p>
        <p className="max-w-[18rem] text-xs leading-relaxed text-zinc-500">
          这里是站内评论区，不受 GitHub 组织 OAuth 限制影响。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-2">
      {roots.map((comment) => (
        <GitTokCommentThread
          key={comment.id}
          comment={comment}
          replies={replies.get(comment.id) ?? []}
          onReply={onReply}
        />
      ))}
    </div>
  );
}

function OfficialDiscussionsPanel({
  data,
  error,
  isLoading,
  needsLogin,
  isCreating,
  selectedDiscussionId,
  selectedCategoryId,
  newTitle,
  newBody,
  isCreatingDiscussion,
  discussionUrl,
  onLogin,
  onToggleDiscussion,
  onReply,
  onToggleUpvote,
  onCategoryChange,
  onTitleChange,
  onBodyChange,
  onCancelCreate,
  onSubmitCreate,
}: {
  data: DiscussionsResponse | null;
  error: string | null;
  isLoading: boolean;
  needsLogin: boolean;
  isCreating: boolean;
  selectedDiscussionId: string | null;
  selectedCategoryId: string;
  newTitle: string;
  newBody: string;
  isCreatingDiscussion: boolean;
  discussionUrl: string;
  onLogin: () => void;
  onToggleDiscussion: (discussionId: string) => void;
  onReply: (comment: DiscussionComment) => void;
  onToggleUpvote: (comment: DiscussionComment) => void;
  onCategoryChange: (categoryId: string) => void;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
  onCancelCreate: () => void;
  onSubmitCreate: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
        正在同步 GitHub Discussions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {needsLogin ? "登录 GitHub 后查看和发起官方讨论。" : error}
      </div>
    );
  }

  if (needsLogin && !data) {
    return (
      <div className="flex h-44 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium text-zinc-800">登录 GitHub 后同步官方讨论</p>
        <button
          type="button"
          onClick={onLogin}
          className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white active:scale-95"
        >
          登录 GitHub
        </button>
      </div>
    );
  }

  if (data && !data.repository.hasDiscussionsEnabled) {
    return (
      <EmptyState
        title="这个仓库没有开启 Discussions"
        description="GitHub 没有开放官方讨论区时，GitTok 无法替它创建官方话题。"
        actionUrl={data.repository.url}
        actionText="打开仓库"
      />
    );
  }

  if (data?.repository.hasDiscussionsEnabled && isCreating) {
    return (
      <NewDiscussionForm
        categories={data.categories}
        selectedCategoryId={selectedCategoryId}
        title={newTitle}
        body={newBody}
        isSubmitting={isCreatingDiscussion}
        onCategoryChange={onCategoryChange}
        onTitleChange={onTitleChange}
        onBodyChange={onBodyChange}
        onCancel={onCancelCreate}
        onSubmit={onSubmitCreate}
      />
    );
  }

  if (data?.repository.hasDiscussionsEnabled && data.discussions.length === 0) {
    return (
      <EmptyState
        title="这个仓库暂时还没有官方讨论"
        description="能否在官方讨论区创建话题，取决于仓库和组织权限。"
        actionUrl={discussionUrl}
        actionText="去 GitHub 查看"
      />
    );
  }

  return (
    <div className="divide-y divide-zinc-200/80">
      {data?.discussions.map((discussion) => (
        <DiscussionRow
          key={discussion.id}
          discussion={discussion}
          expanded={selectedDiscussionId === discussion.id}
          onToggle={() => onToggleDiscussion(discussion.id)}
          onReply={onReply}
          onToggleUpvote={onToggleUpvote}
        />
      ))}
    </div>
  );
}

function NewDiscussionForm({
  categories,
  selectedCategoryId,
  title,
  body,
  isSubmitting,
  onCategoryChange,
  onTitleChange,
  onBodyChange,
  onCancel,
  onSubmit,
}: {
  categories: DiscussionCategory[];
  selectedCategoryId: string;
  title: string;
  body: string;
  isSubmitting: boolean;
  onCategoryChange: (categoryId: string) => void;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-950">发起官方话题</h4>
        <button type="button" onClick={onCancel} className="text-xs font-medium text-zinc-500">
          取消
        </button>
      </div>
      <select
        value={selectedCategoryId}
        onChange={(event) => onCategoryChange(event.target.value)}
        className="mb-2 h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-sm outline-none"
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.emoji ? `${category.emoji} ` : ""}
            {category.name}
          </option>
        ))}
      </select>
      <input
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        maxLength={200}
        placeholder="话题标题"
        className="mb-2 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none placeholder:text-zinc-400"
      />
      <textarea
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        maxLength={8000}
        rows={4}
        placeholder="写下你的问题、观点或建议"
        className="mb-3 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-5 outline-none placeholder:text-zinc-400"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!title.trim() || !body.trim() || !selectedCategoryId || isSubmitting}
        className="h-9 w-full rounded-full bg-zinc-950 text-sm font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
      >
        {isSubmitting ? "创建中" : "发布话题"}
      </button>
    </div>
  );
}

function DiscussionRow({
  discussion,
  expanded,
  onToggle,
  onReply,
  onToggleUpvote,
}: {
  discussion: RepositoryDiscussion;
  expanded: boolean;
  onToggle: () => void;
  onReply: (comment: DiscussionComment) => void;
  onToggleUpvote: (comment: DiscussionComment) => void;
}) {
  const { roots, replies } = splitOfficialComments(discussion.comments);

  return (
    <div className="py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs font-semibold text-zinc-500">
          ↑ {discussion.upvoteCount}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h4 className="line-clamp-2 flex-1 text-[15px] font-semibold leading-5 text-zinc-950">
              {discussion.title}
            </h4>
            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-500">
              {discussion.commentsTotalCount}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {discussion.author?.login ?? "GitHub 用户"} · {formatTime(discussion.updatedAt)}
            {discussion.locked ? " · 已锁定" : discussion.closed ? " · 已关闭" : ""}
          </p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`mt-1 h-5 w-5 shrink-0 text-zinc-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-4 space-y-5 pl-12">
          {discussion.bodyText && (
            <p className="whitespace-pre-wrap break-words rounded-lg bg-zinc-100 px-3 py-3 text-[14px] leading-6 text-zinc-800">
              {discussion.bodyText}
            </p>
          )}
          {roots.length > 0 ? (
            roots.map((comment) => (
              <OfficialCommentThread
                key={comment.id}
                comment={comment}
                replies={replies.get(comment.id) ?? []}
                onReply={onReply}
                onToggleUpvote={onToggleUpvote}
              />
            ))
          ) : (
            <p className="rounded-lg bg-zinc-100 px-3 py-3 text-sm text-zinc-500">
              这个话题下面还没有评论。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function GitTokCommentThread({
  comment,
  replies,
  onReply,
}: {
  comment: GitTokComment;
  replies: GitTokComment[];
  onReply: (comment: GitTokComment) => void;
}) {
  return (
    <div className="space-y-3">
      <GitTokCommentItem comment={comment} onReply={onReply} />
      {replies.length > 0 && (
        <div className="ml-10 space-y-3 border-l border-zinc-200 pl-3">
          {replies.map((reply) => (
            <GitTokCommentItem key={reply.id} comment={reply} compact onReply={onReply} />
          ))}
        </div>
      )}
    </div>
  );
}

function GitTokCommentItem({
  comment,
  compact = false,
  onReply,
}: {
  comment: GitTokComment;
  compact?: boolean;
  onReply: (comment: GitTokComment) => void;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={`${compact ? "h-8 w-8" : "h-10 w-10"} shrink-0 overflow-hidden rounded-full bg-zinc-200`}
      >
        {comment.author.avatarUrl ? (
          <img
            src={comment.author.avatarUrl}
            alt={comment.author.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-500">
            G
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-zinc-400">
          {comment.author.name}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-6 text-zinc-950">
          {comment.body}
        </p>
        <div className="mt-1 flex items-center gap-4 text-xs font-medium text-zinc-400">
          <span>{formatTime(comment.createdAt)}</span>
          <button type="button" onClick={() => onReply(comment)} className="text-zinc-500">
            回复
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionUrl,
  actionText,
}: {
  title: string;
  description: string;
  actionUrl: string;
  actionText: string;
}) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-semibold text-zinc-800">{title}</p>
      <p className="max-w-[18rem] text-xs leading-relaxed text-zinc-500">
        {description}
      </p>
      <a
        href={actionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white active:scale-95"
      >
        {actionText}
      </a>
    </div>
  );
}

function OfficialCommentThread({
  comment,
  replies,
  onReply,
  onToggleUpvote,
}: {
  comment: DiscussionComment;
  replies: DiscussionComment[];
  onReply: (comment: DiscussionComment) => void;
  onToggleUpvote: (comment: DiscussionComment) => void;
}) {
  return (
    <div className="space-y-3">
      <OfficialCommentItem comment={comment} onReply={onReply} onToggleUpvote={onToggleUpvote} />
      {replies.length > 0 && (
        <div className="ml-10 space-y-3 border-l border-zinc-200 pl-3">
          {replies.map((reply) => (
            <OfficialCommentItem
              key={reply.id}
              comment={reply}
              compact
              onReply={onReply}
              onToggleUpvote={onToggleUpvote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OfficialCommentItem({
  comment,
  compact = false,
  onReply,
  onToggleUpvote,
}: {
  comment: DiscussionComment;
  compact?: boolean;
  onReply: (comment: DiscussionComment) => void;
  onToggleUpvote: (comment: DiscussionComment) => void;
}) {
  return (
    <div className="flex gap-3">
      <a
        href={comment.author?.url ?? comment.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${compact ? "h-8 w-8" : "h-10 w-10"} shrink-0 overflow-hidden rounded-full bg-zinc-200`}
      >
        {comment.author?.avatarUrl ? (
          <img
            src={comment.author.avatarUrl}
            alt={comment.author.login}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
            ?
          </div>
        )}
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-zinc-400">
              {comment.author?.login ?? "GitHub 用户"}
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-6 text-zinc-950">
              {comment.bodyText}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggleUpvote(comment)}
            className={`flex w-10 shrink-0 flex-col items-center gap-0.5 text-xs ${
              comment.viewerHasUpvoted ? "text-rose-500" : "text-zinc-400"
            }`}
            aria-label={comment.viewerHasUpvoted ? "取消点赞" : "点赞"}
          >
            <svg viewBox="0 0 24 24" fill={comment.viewerHasUpvoted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M20.8 4.6c-1.7-1.7-4.4-1.7-6.1 0L12 7.3 9.3 4.6a4.3 4.3 0 0 0-6.1 6.1L12 19.5l8.8-8.8c1.7-1.7 1.7-4.4 0-6.1Z" />
            </svg>
            {comment.upvoteCount > 0 && <span>{comment.upvoteCount}</span>}
          </button>
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs font-medium text-zinc-400">
          <span>{formatTime(comment.createdAt)}</span>
          <button type="button" onClick={() => onReply(comment)} className="text-zinc-500">
            回复
          </button>
          <a href={comment.url} target="_blank" rel="noopener noreferrer" className="text-zinc-400">
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

export default DiscussionDrawer;
