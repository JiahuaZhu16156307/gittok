/**
 * GitHub Following API Route
 * GET /api/github/following?page=1&per_page=30
 *
 * Returns the list of users the authenticated user is following on GitHub.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { getFollowing } from "@/lib/github-api";

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const perPage = parseInt(searchParams.get("per_page") ?? "30", 10);

  const users = await getFollowing(
    session.user.githubToken,
    page,
    Math.min(perPage, 100)
  );

  return NextResponse.json({ items: users, page, perPage });
}
