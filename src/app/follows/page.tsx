"use client";

/**
 * Follows page - Lists users the authenticated user is following on GitHub.
 *
 * Fetches real following list from GitHub via /api/github/follow (GET /user/following).
 * Allows unfollowing directly from this page.
 *
 * Validates: Requirements 7.4-7.6, Property 23
 */

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import Link from "next/link";

interface FollowingUser {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  type: string;
}

export default function FollowsPage() {
  const { isAuthenticated, restoreSession } = useAuthStore();
  const [users, setUsers] = useState<FollowingUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const loadFollowing = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/github/following");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items ?? []);
      }
    } catch {
      // Ignore network errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadFollowing();
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, loadFollowing]);

  const handleUnfollow = async (username: string) => {
    // Optimistic removal
    setUsers((prev) => prev.filter((u) => u.login !== username));

    try {
      await fetch("/api/github/follow", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
    } catch {
      // Reload on failure
      loadFollowing();
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-black text-white p-6">
        <div className="text-center space-y-4">
          <p className="text-white/60">请先登录以查看关注</p>
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
          <h1 className="text-2xl font-bold">关注</h1>
          <span className="text-sm text-white/50">{users.length} 位用户</span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-white/50 text-sm">
            还没有关注任何用户
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="w-10 h-10 rounded-full shrink-0"
                  />
                  <div className="min-w-0">
                    <a
                      href={user.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-white hover:text-blue-400 transition-colors truncate block"
                    >
                      @{user.login}
                    </a>
                  </div>
                </div>
                <button
                  onClick={() => handleUnfollow(user.login)}
                  className="ml-3 px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs font-medium hover:bg-white/20 transition-colors shrink-0"
                >
                  取消关注
                </button>
              </div>
            ))}
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
