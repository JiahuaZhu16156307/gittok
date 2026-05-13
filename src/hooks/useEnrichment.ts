"use client";

import { useState, useEffect } from "react";

interface EnrichmentData {
  imageUrl: string | null;
  summary: string | null;
  status?: "ready" | "pending" | "unavailable";
  retryAfterMs?: number;
}

// In-memory cache to avoid re-fetching
const cache = new Map<string, EnrichmentData>();
const MAX_BACKGROUND_RETRIES = 8;

function buildClientUnavailableSummary(owner: string, repo: string): string {
  return `${owner}/${repo} 的 README 摘要暂时没有生成成功，可能是 GitHub API 限流、网络超时或翻译服务不可用。GitTok 会在稍后重新尝试生成。`;
}

/**
 * Hook to lazy-load README image + Chinese summary for a repo.
 * Only fetches when the component is mounted (visible card).
 */
export function useEnrichment(
  owner: string,
  repo: string,
  enabled = true
): EnrichmentData & { isLoading: boolean } {
  const key = `${owner}/${repo}`;
  const [data, setData] = useState<EnrichmentData>(
    cache.get(key) ?? { imageUrl: null, summary: null }
  );
  const [isLoading, setIsLoading] = useState(enabled && !cache.has(key));

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    if (cache.has(key)) {
      setData(cache.get(key)!);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchEnrichment(attempt = 0) {
      try {
        const res = await fetch(
          `/api/feed/enrich?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
        );
        if (!res.ok) {
          throw new Error(`Enrichment request failed with ${res.status}`);
        }
        const result: EnrichmentData = await res.json();
        if (!cancelled) {
          if (result.status === "ready") {
            cache.set(key, result);
          }
          setData(result);

          if (
            (result.status === "pending" || result.status === "unavailable") &&
            attempt < MAX_BACKGROUND_RETRIES
          ) {
            retryTimer = setTimeout(() => {
              void fetchEnrichment(attempt + 1);
            }, result.retryAfterMs ?? 3000);
          }
        }
      } catch {
        const result: EnrichmentData = {
          imageUrl: null,
          summary: buildClientUnavailableSummary(owner, repo),
          status: "unavailable",
          retryAfterMs: 8000,
        };
        if (!cancelled) {
          setData(result);
          if (attempt < 2) {
            retryTimer = setTimeout(() => {
              void fetchEnrichment(attempt + 1);
            }, result.retryAfterMs);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchEnrichment();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled, key, owner, repo]);

  return { ...data, isLoading };
}
