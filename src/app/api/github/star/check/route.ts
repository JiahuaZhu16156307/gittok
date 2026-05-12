/**
 * GitHub Star Check API Route
 * GET /api/github/star/check?owner=x&repo=y
 *
 * Returns { starred: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { isRepoStarred } from "@/lib/github-api";

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo query params" },
      { status: 400 }
    );
  }

  const starred = await isRepoStarred(
    session.user.githubToken,
    owner,
    repo
  );
  return NextResponse.json({ starred });
}
