/**
 * Trending Feed API — GET /api/feed/trending
 *
 * Scrapes GitHub Trending page (https://github.com/trending)
 * and returns today's trending repos in RepoCard format.
 */

import { NextRequest, NextResponse } from "next/server";
import type { RepoCard } from "@/lib/types";

const TRENDING_URL = "https://github.com/trending?since=daily";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const res = await fetch(TRENDING_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 GitTok/1.0",
        "Accept": "text/html",
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { cards: [], hasMore: false, error: `GitHub Trending returned ${res.status}` },
        { status: 502 }
      );
    }

    const html = await res.text();
    const cards = parseTrendingHTML(html);

    return NextResponse.json({
      cards,
      hasMore: false,
    });
  } catch (err) {
    console.error("[Trending API] Error:", err);
    return NextResponse.json(
      { cards: [], hasMore: false, error: "Failed to fetch GitHub Trending" },
      { status: 500 }
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
