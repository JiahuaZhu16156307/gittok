import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import {
  createRepositoryDiscussion,
  explainGitHubDiscussionError,
  getRepositoryDiscussions,
  isGitHubAuthError,
} from "@/lib/github-discussions";

function getGitHubToken(sessionToken?: string) {
  if (sessionToken) return { token: sessionToken, source: "session" as const };
  const appToken = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  if (appToken) return { token: appToken, source: "app" as const };
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo" },
      { status: 400 }
    );
  }

  const session = await getServerSession();
  const credential = getGitHubToken(session?.user?.githubToken);
  if (!credential) {
    return NextResponse.json(
      {
        error: "同步 GitHub Discussions 需要登录 GitHub。",
        needsLogin: true,
      },
      { status: 401 }
    );
  }

  try {
    const data = await getRepositoryDiscussions(credential.token, owner, repo);
    return NextResponse.json(data);
  } catch (error) {
    if (isGitHubAuthError(error)) {
      return NextResponse.json(
        {
          error:
            credential.source === "session"
              ? "GitHub 登录状态已失效，请重新登录后同步讨论区。"
              : "服务端 GitHub Token 已失效，请登录 GitHub 后同步讨论区。",
          needsLogin: true,
        },
        { status: 401 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to load discussions";
    return NextResponse.json(
      { error: explainGitHubDiscussionError(message) },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json(
      { error: "GitHub login required", needsLogin: true },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    repositoryId?: string;
    categoryId?: string;
    title?: string;
    body?: string;
  } | null;

  const repositoryId = body?.repositoryId?.trim();
  const categoryId = body?.categoryId?.trim();
  const title = body?.title?.trim();
  const discussionBody = body?.body?.trim();

  if (!repositoryId || !categoryId || !title || !discussionBody) {
    return NextResponse.json(
      { error: "Missing repositoryId, categoryId, title, or body" },
      { status: 400 }
    );
  }

  if (title.length > 200 || discussionBody.length > 8000) {
    return NextResponse.json(
      { error: "Discussion title or body is too long" },
      { status: 400 }
    );
  }

  try {
    const discussion = await createRepositoryDiscussion(
      session.user.githubToken,
      repositoryId,
      categoryId,
      title,
      discussionBody
    );
    return NextResponse.json({ discussion });
  } catch (error) {
    if (isGitHubAuthError(error)) {
      return NextResponse.json(
        {
          error: "GitHub 登录状态已失效，请重新登录后发布话题。",
          needsLogin: true,
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: explainGitHubDiscussionError(error) },
      { status: 502 }
    );
  }
}
