"use client";

import { useEffect, useState } from "react";

interface DiscussionCount {
  siteCount: number;
  officialCount: number;
  totalCount: number;
}

const COUNT_EVENT = "gittok:discussion-count";
const EMPTY_COUNT: DiscussionCount = {
  siteCount: 0,
  officialCount: 0,
  totalCount: 0,
};

const cache = new Map<string, DiscussionCount>();

async function readCountResponse(
  res: Response,
  field: "totalCount" | "discussionsTotalCount"
): Promise<number | null> {
  const payload = await res.json().catch(() => ({}));
  const value = payload?.[field];
  return res.ok && typeof value === "number" ? value : null;
}

export function useDiscussionCount(
  owner: string,
  repo: string,
  enabled = true
): number {
  const key = `${owner}/${repo}`;
  const [count, setCount] = useState<number>(cache.get(key)?.totalCount ?? 0);

  useEffect(() => {
    function handleCountChange(event: Event) {
      const detail = (event as CustomEvent<{ key: string; totalCount: number }>).detail;
      if (detail?.key === key) {
        setCount(detail.totalCount);
      }
    }

    window.addEventListener(COUNT_EVENT, handleCountChange);
    return () => window.removeEventListener(COUNT_EVENT, handleCountChange);
  }, [key]);

  useEffect(() => {
    if (!enabled || !owner || !repo) return;

    if (cache.has(key)) {
      setCount(cache.get(key)?.totalCount ?? 0);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);

    async function fetchCount(
      url: string,
      field: "totalCount" | "discussionsTotalCount"
    ): Promise<number | null> {
      try {
        const res = await fetch(url, { signal: controller.signal });
        return await readCountResponse(res, field);
      } catch {
        return null;
      }
    }

    async function loadCount() {
      try {
        const repoFullName = `${owner}/${repo}`;
        const [siteCount, officialCount] = await Promise.all([
          fetchCount(
            `/api/gittok/comments?repoFullName=${encodeURIComponent(repoFullName)}`,
            "totalCount"
          ),
          fetchCount(
            `/api/github/discussions/count?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
            "discussionsTotalCount"
          ),
        ]);
        const nextCount = {
          siteCount: siteCount ?? 0,
          officialCount: officialCount ?? 0,
          totalCount: (siteCount ?? 0) + (officialCount ?? 0),
        };
        cache.set(key, nextCount);
        if (!cancelled) setCount(nextCount.totalCount);
      } catch {
        cache.set(key, EMPTY_COUNT);
        if (!cancelled) setCount(0);
      } finally {
        window.clearTimeout(timer);
      }
    }

    void loadCount();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [enabled, key, owner, repo]);

  return count;
}

export function refreshDiscussionCountCache(
  owner: string,
  repo: string,
  patch: Partial<DiscussionCount>
) {
  const key = `${owner}/${repo}`;
  const current = cache.get(key) ?? EMPTY_COUNT;
  const next = {
    ...current,
    ...patch,
  };
  next.totalCount = next.siteCount + next.officialCount;
  cache.set(key, next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(COUNT_EVENT, {
        detail: {
          key,
          totalCount: next.totalCount,
        },
      })
    );
  }
}
