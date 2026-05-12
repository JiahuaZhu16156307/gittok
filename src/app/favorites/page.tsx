"use client";

/**
 * Starred repos page - Lists user's GitHub starred repositories.
 *
 * Fetches real starred repos from GitHub via /api/github/starred.
 * Allows unstarring directly from this page.
 *
 * Validates: Requirements 7.1-7.3, Property 23
 */

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import Link from "next/link";

interface StarredRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export default function StarredPage() {
  const { isAuthenticated, restoreSession } = useAuthStore();
  const [repos, setRepos] = useState<StarredRepo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const loadStarred = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/github/starred?page=${pageNum}&per_page=30`);
      if (res.ok) {
        const data = await res.json();
        const items: StarredRepo[] = data.items ?? [];
        if (pageNum === 1) {
          setRepos(items);
        } else {
          setRepos((prev) => [...prev, ...items]);
        }
        setHasMore(items.length === 30);
      }
    } catch {
      // Ignore network errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadStarred(1);
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, loadStarred]);

  const handleUnstar = async (repo: StarredRepo) => {
    // Optimistic removal
    setRepos((prev) => prev.filter((r) => r.id !== repo.id));

    try {
      const [owner, repoName] = repo.full_name.split("/");
      await fetch("/api/github/star", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo: repoName }),
      });
    } catch {
      // Reload on failure
      loadStarred(1);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadStarred(nextPage);
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-black text-white p-6">
        <div className="text-center space-y-4">
          <p className="text-white/60">请先登录以查看星标仓库</p>
          <Link
            href="/login"
            className="inline-block px-4 py-2 rounded-lg bg-white text-black text-sm font-medium"
          >
            去登录
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white p-6 pb-24">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">⭐ 星标仓库</h1>
          <span className="text-sm text-white/50">GitHub Stars</span>
        </div>

        {isLoading && repos.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <div className="text-center py-12 text-white/50 text-sm">
            还没有星标任何仓库
          </div>
        ) : (
          <div className="space-y-3">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10"
              >
                <div className="flex-1 min-w-0">
                  <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-white hover:text-yellow-400 transition-colors truncate block"
                  >
                    {repo.full_name}
                  </a>
                  {repo.description && (
                    <p className="text-xs text-white/50 mt-1 truncate">
                      {repo.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    {repo.language && (
                      <span className="text-[10px] text-white/40">
                        {repo.language}
                      </span>
                    )}
                    <span className="text-[10px] text-white/40">
                      ⭐ {repo.stargazers_count.toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleUnstar(repo)}
                  className="ml-3 px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs font-medium hover:bg-yellow-500/20 transition-colors shrink-0"
                >
                  取消星标
                </button>
              </div>
            ))}

            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={isLoading}
                className="w-full py-3 rounded-lg bg-white/5 text-white/60 text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {isLoading ? "加载中..." : "加载更多"}
              </button>
            )}
          </div>
        )}

        <Link
          href="/"
          className="block text-center text-white/50 text-xs hover:text-white/70 transition-colors"
        >
          ← 返回信息流
        </Link>
      </div>
    </main>
  );
}
