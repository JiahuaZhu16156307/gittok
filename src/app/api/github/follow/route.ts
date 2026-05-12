/**
 * GitHub Follow API Route
 * POST /api/github/follow — Follow a user
 * DELETE /api/github/follow — Unfollow a user
 *
 * Body: { username: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { followUser, unfollowUser } from "@/lib/github-api";

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { username } = body;

  if (!username) {
    return NextResponse.json(
      { error: "Missing username" },
      { status: 400 }
    );
  }

  const success = await followUser(session.user.githubToken, username);
  if (success) {
    return NextResponse.json({ following: true });
  }
  return NextResponse.json(
    { error: "Failed to follow user" },
    { status: 500 }
  );
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { username } = body;

  if (!username) {
    return NextResponse.json(
      { error: "Missing username" },
      { status: 400 }
    );
  }

  const success = await unfollowUser(session.user.githubToken, username);
  if (success) {
    return NextResponse.json({ following: false });
  }
  return NextResponse.json(
    { error: "Failed to unfollow user" },
    { status: 500 }
  );
}
