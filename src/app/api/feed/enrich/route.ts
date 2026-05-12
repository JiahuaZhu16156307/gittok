/**
 * Feed Enrichment API — GET /api/feed/enrich?owner=xxx&repo=yyy
 *
 * Returns README image + Chinese summary for a repo card.
 * Results are cached in Redis for 24h.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { extractFirstImage, extractSummary } from '@/lib/readme-parser';
import { translateToChinese, isChinese } from '@/lib/translate';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get('owner');
  const repo = searchParams.get('repo');

  if (!owner || !repo) {
    return NextResponse.json({ error: 'Missing owner or repo' }, { status: 400 });
  }

  try {
    // Try Redis cache first
    let cached: string | null = null;
    try {
      const { redis } = await import('@/lib/redis');
      cached = await redis.get(`enrich:${owner}/${repo}`);
    } catch {
      // Redis unavailable, skip cache
    }

    if (cached) {
      return NextResponse.json(JSON.parse(cached));
    }

    // Get user's GitHub token for API calls (or use unauthenticated)
    const session = await getServerSession();
    const token = session?.user?.githubToken;

    // Fetch README from GitHub
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitTok',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const readmeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers }
    );

    if (!readmeRes.ok) {
      const result = { imageUrl: null, summary: null };
      return NextResponse.json(result);
    }

    const readmeData = await readmeRes.json() as { content?: string; encoding?: string };
    let markdown = '';

    if (readmeData.content && readmeData.encoding === 'base64') {
      markdown = Buffer.from(readmeData.content, 'base64').toString('utf-8');
    }

    // Extract image and summary (full first section, up to 2000 chars)
    const imageUrl = extractFirstImage(markdown);
    let summary = extractSummary(markdown, 2000);

    // Translate to Chinese if needed
    if (summary && !isChinese(summary)) {
      summary = await translateToChinese(summary);
    }

    const result = { imageUrl, summary: summary || null };

    // Cache in Redis for 24h
    try {
      const { redis, TTL_REPO_CACHE } = await import('@/lib/redis');
      await redis.setex(`enrich:${owner}/${repo}`, TTL_REPO_CACHE, JSON.stringify(result));
    } catch {
      // Redis unavailable, skip cache
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[Enrich API] Error:', err);
    return NextResponse.json({ imageUrl: null, summary: null });
  }
}
