/**
 * GitHub Follow Check API Route
 * GET /api/github/follow/check?username=x
 *
 * Returns { following: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { isFollowing } from "@/lib/github-api";

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Missing username query param" },
      { status: 400 }
    );
  }

  const following = await isFollowing(session.user.githubToken, username);
  return NextResponse.json({ following });
}
