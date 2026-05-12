"use client";

import { useEffect, useState, useRef } from "react";

interface EnrichmentData {
  imageUrl: string | null;
  summary: string;
}

/** In-memory cache shared across all hook instances */
const enrichmentCache = new Map<string, EnrichmentData>();
/** Track in-flight requests to avoid duplicates */
const pendingRequests = new Map<string, Promise<EnrichmentData | null>>();

/**
 * Custom hook that lazily fetches enrichment data (README image + Chinese summary)
 * for a given repo. Caches results in memory to avoid redundant API calls.
 */
export function useEnrichment(owner: string, repo: string) {
  const [data, setData] = useState<EnrichmentData | null>(() => {
    return enrichmentCache.get(`${owner}/${repo}`) ?? null;
  });
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!owner || !repo) return;

    const key = `${owner}/${repo}`;

    // Already cached
    if (enrichmentCache.has(key)) {
      setData(enrichmentCache.get(key)!);
      return;
    }

    // Already fetching
    if (pendingRequests.has(key)) {
      setLoading(true);
      pendingRequests.get(key)!.then((result) => {
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }
      });
      return;
    }

    setLoading(true);

    const fetchPromise = fetch(`/api/feed/enrich?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const json: EnrichmentData = await res.json();
        enrichmentCache.set(key, json);
        return json;
      })
      .catch(() => null)
      .finally(() => {
        pendingRequests.delete(key);
      });

    pendingRequests.set(key, fetchPromise);

    fetchPromise.then((result) => {
      if (mountedRef.current) {
        setData(result);
        setLoading(false);
      }
    });
  }, [owner, repo]);

  return { data, loading };
}
