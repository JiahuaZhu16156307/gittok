/**
 * Feed Enrichment API — GET /api/feed/enrich?owner=xxx&repo=yyy
 *
 * Returns README image + Chinese summary for a repo card.
 * Results are cached in Redis for 24h.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractFirstImage, extractSummary } from '@/lib/readme-parser';
import { translateToChinese, isChinese } from '@/lib/translate';

const ENRICH_TIMEOUT_MS = 9000;
const TRANSLATE_TIMEOUT_MS = 10000;
const INITIAL_RESPONSE_WAIT_MS = 2600;
const CACHE_TIMEOUT_MS = 250;
const LOCAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const EMPTY_SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;
const UNAVAILABLE_CACHE_TTL_MS = 30 * 1000;
const SUMMARY_MAX_LENGTH = 450;
const CACHE_VERSION = 'v3';

type EnrichmentStatus = 'ready' | 'pending' | 'unavailable';
type EnrichmentResult = {
  imageUrl: string | null;
  summary: string | null;
  status: EnrichmentStatus;
  retryAfterMs?: number;
};

const localCache = globalThis as typeof globalThis & {
  __gittokEnrichCache?: Map<string, { expiresAt: number; result: EnrichmentResult }>;
  __gittokEnrichPending?: Map<string, Promise<EnrichmentResult>>;
};

const enrichCache =
  localCache.__gittokEnrichCache ??
  (localCache.__gittokEnrichCache = new Map<string, { expiresAt: number; result: EnrichmentResult }>());

const pendingEnrichment =
  localCache.__gittokEnrichPending ??
  (localCache.__gittokEnrichPending = new Map<string, Promise<EnrichmentResult>>());

async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function withWallClockTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

function shouldUseRemoteCache(): boolean {
  return process.env.NODE_ENV === 'production' && Boolean(process.env.REDIS_URL);
}

function getLocalCache(key: string): EnrichmentResult | null {
  const cached = enrichCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    enrichCache.delete(key);
    return null;
  }
  if (!cached.result.summary) {
    enrichCache.delete(key);
    return null;
  }
  return cached.result;
}

function setLocalCache(key: string, result: EnrichmentResult, ttlMs = LOCAL_CACHE_TTL_MS) {
  enrichCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    result,
  });
}

function buildUnavailableSummary(owner: string, repo: string): string {
  return `${owner}/${repo} 的 README 暂时无法从 GitHub 读取，可能是 GitHub API 限流或网络超时。页面会继续展示仓库信息，稍后会自动重新生成 README 摘要。`;
}

function buildSummaryGenerationFailed(owner: string, repo: string): string {
  return `${owner}/${repo} 的 README 已读取，但中文摘要生成服务暂时没有返回可用内容。GitTok 会稍后自动重试；你也可以先打开原仓库查看完整 README。`;
}

function buildPendingSummary(owner: string, repo: string): EnrichmentResult {
  return {
    imageUrl: null,
    summary: `${owner}/${repo} 的 README 摘要正在后台生成中，稍等片刻会自动刷新为中文摘要。`,
    status: 'pending',
    retryAfterMs: 1800,
  };
}

async function loadEnrichment(owner: string, repo: string, cacheKey: string): Promise<EnrichmentResult> {
  // Try Redis cache first. In local dev, skip remote Redis entirely so
  // non-critical enrichment can never block opening the feed.
  let cached: string | null = null;
  if (shouldUseRemoteCache()) {
    try {
      const { redis } = await import('@/lib/redis');
      cached = await withWallClockTimeout(
        redis.get(cacheKey),
        CACHE_TIMEOUT_MS,
        null
      );
    } catch {
      // Redis unavailable, skip cache
    }
  }

  if (cached) {
    const parsed = JSON.parse(cached) as EnrichmentResult;
    if (parsed.summary) {
      setLocalCache(cacheKey, parsed);
      return parsed;
    }
  }

  // Use an app token when configured, but do not read the user session here.
  // Enrichment is public, non-critical, and should not pay auth/session cost.
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;

  // Fetch README from GitHub
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitTok',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const readmeRes = await withTimeout(
    (signal) =>
      fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
        headers,
        signal,
      }),
    ENRICH_TIMEOUT_MS
  );

  if (!readmeRes.ok) {
    const result: EnrichmentResult = {
      imageUrl: null,
      summary: buildUnavailableSummary(owner, repo),
      status: 'unavailable',
      retryAfterMs: 6000,
    };
    setLocalCache(cacheKey, result, UNAVAILABLE_CACHE_TTL_MS);
    return result;
  }

  const readmeData = await readmeRes.json() as { content?: string; encoding?: string };
  let markdown = '';

  if (readmeData.content && readmeData.encoding === 'base64') {
    markdown = Buffer.from(readmeData.content, 'base64').toString('utf-8');
  }

  // Keep the translated text compact so cards update quickly.
  const imageUrl = extractFirstImage(markdown);
  let summary = extractSummary(markdown, SUMMARY_MAX_LENGTH);
  const hasExtractedSummary = Boolean(summary);

  // Translate to Chinese if needed
  if (summary && !isChinese(summary)) {
    try {
      const translatedSummary = await withTimeout(
        (signal) => translateToChinese(summary, { signal }),
        TRANSLATE_TIMEOUT_MS
      );
      summary = translatedSummary && isChinese(translatedSummary) ? translatedSummary : '';
    } catch (error) {
      console.error('[Enrich API] Translation failed:', error);
      summary = '';
    }
  }

  const result: EnrichmentResult = {
    imageUrl,
    summary: summary || (hasExtractedSummary ? buildSummaryGenerationFailed(owner, repo) : buildUnavailableSummary(owner, repo)),
    status: summary ? 'ready' : 'unavailable',
    retryAfterMs: summary ? undefined : 10_000,
  };
  setLocalCache(
    cacheKey,
    result,
    hasExtractedSummary && !summary ? EMPTY_SUMMARY_CACHE_TTL_MS : LOCAL_CACHE_TTL_MS
  );

  // Cache in Redis for 24h. This is best-effort and must stay non-blocking.
  if (shouldUseRemoteCache() && result.summary) {
    try {
      const { redis, TTL_REPO_CACHE } = await import('@/lib/redis');
      await withWallClockTimeout(
        redis.setex(cacheKey, TTL_REPO_CACHE, JSON.stringify(result)),
        CACHE_TIMEOUT_MS,
        'skipped'
      );
    } catch {
      // Redis unavailable, skip cache
    }
  }

  return result;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get('owner');
  const repo = searchParams.get('repo');

  if (!owner || !repo) {
    return NextResponse.json({ error: 'Missing owner or repo' }, { status: 400 });
  }

  try {
    const cacheKey = `enrich:${CACHE_VERSION}:${owner}/${repo}`;
    const localCached = getLocalCache(cacheKey);
    if (localCached) {
      return NextResponse.json(localCached);
    }

    const pending = pendingEnrichment.get(cacheKey);
    if (pending) {
      const result = await withWallClockTimeout(
        pending,
        INITIAL_RESPONSE_WAIT_MS,
        buildPendingSummary(owner, repo)
      );
      return NextResponse.json(result);
    }

    const work = loadEnrichment(owner, repo, cacheKey)
      .catch((error) => {
        console.error('[Enrich API] Background enrichment failed:', error);
        const result: EnrichmentResult = {
          imageUrl: null,
          summary: buildUnavailableSummary(owner, repo),
          status: 'unavailable',
          retryAfterMs: 6000,
        };
        setLocalCache(cacheKey, result, UNAVAILABLE_CACHE_TTL_MS);
        return result;
      })
      .finally(() => {
        pendingEnrichment.delete(cacheKey);
      });
    pendingEnrichment.set(cacheKey, work);

    const result = await withWallClockTimeout(
      work,
      INITIAL_RESPONSE_WAIT_MS,
      buildPendingSummary(owner, repo)
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Enrich API] Error:', err);
    return NextResponse.json({
      imageUrl: null,
      summary: buildUnavailableSummary(owner, repo),
      status: 'unavailable',
      retryAfterMs: 6000,
    });
  }
}
