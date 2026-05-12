/**
 * GitHub Star API Route
 * POST /api/github/star — Star a repo
 * DELETE /api/github/star — Unstar a repo
 *
 * Body: { owner: string, repo: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { starRepo, unstarRepo } from "@/lib/github-api";

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { owner, repo } = body;

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo" },
      { status: 400 }
    );
  }

  const success = await starRepo(session.user.githubToken, owner, repo);
  if (success) {
    return NextResponse.json({ starred: true });
  }
  return NextResponse.json({ error: "Failed to star repo" }, { status: 500 });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { owner, repo } = body;

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo" },
      { status: 400 }
    );
  }

  const success = await unstarRepo(session.user.githubToken, owner, repo);
  if (success) {
    return NextResponse.json({ starred: false });
  }
  return NextResponse.json(
    { error: "Failed to unstar repo" },
    { status: 500 }
  );
}
