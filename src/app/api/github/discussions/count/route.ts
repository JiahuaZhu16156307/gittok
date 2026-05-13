import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import {
  explainGitHubDiscussionError,
  getRepositoryDiscussionCount,
  isGitHubAuthError,
} from "@/lib/github-discussions";

function getGitHubToken(sessionToken?: string) {
  return sessionToken || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
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
  const token = getGitHubToken(session?.user?.githubToken);

  if (!token) {
    return NextResponse.json(
      {
        discussionsTotalCount: null,
        needsLogin: true,
      },
      { status: 200 }
    );
  }

  try {
    const data = await getRepositoryDiscussionCount(token, owner, repo);
    return NextResponse.json(data);
  } catch (error) {
    if (isGitHubAuthError(error)) {
      return NextResponse.json(
        {
          discussionsTotalCount: null,
          needsLogin: true,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        discussionsTotalCount: null,
        error: explainGitHubDiscussionError(error),
      },
      { status: 200 }
    );
  }
}
