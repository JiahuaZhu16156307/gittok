/**
 * GitHub Starred Repos API Route
 * GET /api/github/starred?page=1&per_page=30
 *
 * Returns the authenticated user's starred repositories from GitHub.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { getStarredRepos } from "@/lib/github-api";

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const perPage = parseInt(searchParams.get("per_page") ?? "30", 10);

  const repos = await getStarredRepos(
    session.user.githubToken,
    page,
    Math.min(perPage, 100)
  );

  return NextResponse.json({ items: repos, page, perPage });
}
