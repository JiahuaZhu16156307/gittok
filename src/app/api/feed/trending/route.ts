/**
 * Trending Feed API — GET /api/feed/trending
 *
 * Scrapes GitHub Trending page (https://github.com/trending)
 * and returns today's trending repos in RepoCard format.
 */

import { NextRequest, NextResponse } from "next/server";
import type { RepoCard } from "@/lib/types";

const TRENDING_URL = "https://github.com/trending?since=daily";
const TRENDING_TIMEOUT_MS = 3500;
const SEARCH_TIMEOUT_MS = 2500;
const TRENDING_CACHE_TTL_MS = 30 * 60 * 1000;

export const dynamic = "force-dynamic";

const globalForTrending = globalThis as unknown as {
  trendingCache?: { cards: RepoCard[]; cachedAt: number };
};

async function fetchTrendingHTML(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRENDING_TIMEOUT_MS);
  try {
    const res = await fetch(TRENDING_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 GitTok/1.0",
        "Accept": "text/html",
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) {
      throw new Error(`GitHub Trending returned ${res.status}`);
    }

    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function withAbortableTimeout<T>(
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

async function fetchTrendingFromSearch(): Promise<RepoCard[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "GitTok",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const query = `stars:>1000 pushed:>=${since} archived:false fork:false`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=25`;
  const res = await withAbortableTimeout(
    (signal) => fetch(url, { headers, signal }),
    SEARCH_TIMEOUT_MS
  );

  if (!res.ok) {
    throw new Error(`GitHub Search returned ${res.status}`);
  }

  const data = await res.json() as {
    items?: Array<{
      id: number;
      full_name: string;
      name: string;
      owner: { login: string };
      description: string | null;
      language: string | null;
      stargazers_count: number;
      forks_count: number;
      topics?: string[];
      archived: boolean;
      fork: boolean;
      pushed_at: string;
      default_branch: string;
      updated_at: string;
    }>;
  };

  const now = new Date();
  return (data.items ?? []).map((item) => ({
    id: `trending-search-${item.id}`,
    fullName: item.full_name,
    owner: item.owner.login,
    name: item.name,
    description: item.description ?? "",
    language: item.language,
    starCount: item.stargazers_count,
    forkCount: item.forks_count,
    topics: item.topics ?? [],
    isArchived: item.archived,
    isFork: item.fork,
    readmeSummary: `近 24 小时 GitHub 活跃热门仓库，当前 ${item.stargazers_count.toLocaleString()} stars。`,
    lastCommitAt: new Date(item.pushed_at || now),
    defaultBranch: item.default_branch || "main",
    updatedAt: new Date(item.updated_at || now),
  }));
}

async function firstNonEmptyCards(source: Promise<RepoCard[]>): Promise<RepoCard[]> {
  const cards = await source;
  if (cards.length === 0) {
    throw new Error("Trending source returned no cards");
  }
  return cards;
}

async function fetchTrendingCards(): Promise<RepoCard[]> {
  return Promise.any([
    firstNonEmptyCards(fetchTrendingHTML().then(parseTrendingHTML)),
    firstNonEmptyCards(fetchTrendingFromSearch()),
  ]);
}

function getFreshCachedTrending(): RepoCard[] | null {
  const cached = globalForTrending.trendingCache;
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > TRENDING_CACHE_TTL_MS) return null;
  return cached.cards;
}

export async function GET(_request: NextRequest) {
  try {
    const cached = getFreshCachedTrending();
    if (cached) {
      return NextResponse.json({
        cards: cached,
        hasMore: false,
        cached: true,
      });
    }

    const cards = await fetchTrendingCards();
    globalForTrending.trendingCache = { cards, cachedAt: Date.now() };

    return NextResponse.json({
      cards,
      hasMore: false,
    });
  } catch (err) {
    console.error("[Trending API] Error:", err);
    const cached = getFreshCachedTrending();
    if (cached) {
      return NextResponse.json({
        cards: cached,
        hasMore: false,
        stale: true,
      });
    }

    return NextResponse.json(
      { cards: [], hasMore: false, error: "Failed to fetch GitHub Trending" },
      { status: 504 }
    );
  }
}

/**
 * Parse GitHub Trending HTML to extract repo data.
 * Each repo is in an article whose class list contains Box-row. GitHub changes
 * surrounding markup often, so the extraction below avoids exact class matches.
 */
function parseTrendingHTML(html: string): RepoCard[] {
  const repos: RepoCard[] = [];
  const seen = new Set<string>();

  const articleRegex = /<article\b[^>]*class="[^"]*\bBox-row\b[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    const block = match[1];
    const nameMatch = block.match(/<h2\b[\s\S]*?<a\b[^>]*href="\/([^"?#]+)"[^>]*>/);
    if (!nameMatch) continue;

    const fullName = decodeHtml(nameMatch[1]).trim();
    const parts = fullName.split("/").map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 2) continue;

    const [owner, name] = parts;
    if (owner === "sponsors" || seen.has(fullName)) continue;

    seen.add(fullName);

    const descMatch = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/);
    const description = descMatch ? cleanText(descMatch[1]) : "";

    const langMatch = block.match(/itemprop="programmingLanguage"[^>]*>(.*?)<\/span>/);
    const language = langMatch ? cleanText(langMatch[1]) : null;
    const escapedOwner = escapeRegExp(owner);
    const escapedName = escapeRegExp(name);
    const starCount = extractLinkedCount(block, `/${escapedOwner}/${escapedName}/stargazers`);
    const forkCount =
      extractLinkedCount(block, `/${escapedOwner}/${escapedName}/forks`) ||
      extractLinkedCount(block, `/${escapedOwner}/${escapedName}/network/members`);
    const todayStars = extractTodayStars(block);
    const now = new Date();

    repos.push({
      id: `trending-${owner}-${name}`,
      fullName,
      owner,
      name,
      description,
      language,
      starCount,
      forkCount,
      topics: [],
      isArchived: false,
      isFork: false,
      readmeSummary: todayStars > 0 ? `今日 GitHub Trending：+${todayStars.toLocaleString()} stars` : "",
      lastCommitAt: now,
      defaultBranch: "main",
      updatedAt: now,
    });
  }

  return repos;
}

function extractLinkedCount(block: string, escapedPath: string): number {
  const linkRegex = new RegExp(`<a\\b[^>]*href="${escapedPath}"[^>]*>([\\s\\S]*?)<\\/a>`);
  const match = block.match(linkRegex);
  return match ? parseCount(cleanText(match[1])) : 0;
}

function extractTodayStars(block: string): number {
  const text = cleanText(block);
  const match = text.match(/([\d,]+)\s+stars?\s+today/i);
  return match ? parseCount(match[1]) : 0;
}

function parseCount(value: string): number {
  const match = value.match(/[\d,]+/);
  return match ? Number.parseInt(match[0].replace(/,/g, ""), 10) : 0;
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
