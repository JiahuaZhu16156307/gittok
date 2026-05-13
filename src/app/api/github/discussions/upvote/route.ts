import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import {
  explainGitHubDiscussionError,
  isGitHubAuthError,
  setDiscussionCommentUpvote,
} from "@/lib/github-discussions";

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json(
      { error: "GitHub login required", needsLogin: true },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    commentId?: string;
    upvote?: boolean;
  } | null;

  const commentId = body?.commentId?.trim();
  if (!commentId || typeof body?.upvote !== "boolean") {
    return NextResponse.json(
      { error: "Missing commentId or upvote" },
      { status: 400 }
    );
  }

  try {
    const comment = await setDiscussionCommentUpvote(
      session.user.githubToken,
      commentId,
      body.upvote
    );
    return NextResponse.json({ comment });
  } catch (error) {
    if (isGitHubAuthError(error)) {
      return NextResponse.json(
        {
          error: "GitHub 登录状态已失效，请重新登录后点赞。",
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
