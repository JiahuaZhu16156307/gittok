"use client";

import { useState, useEffect } from "react";

interface EnrichmentData {
  imageUrl: string | null;
  summary: string | null;
}

// In-memory cache to avoid re-fetching
const cache = new Map<string, EnrichmentData>();

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

    async function fetchEnrichment() {
      try {
        const res = await fetch(
          `/api/feed/enrich?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
        );
        if (!res.ok) return;
        const result: EnrichmentData = await res.json();
        if (!cancelled) {
          cache.set(key, result);
          setData(result);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchEnrichment();
    return () => { cancelled = true; };
  }, [enabled, key, owner, repo]);

  return { ...data, isLoading };
}
