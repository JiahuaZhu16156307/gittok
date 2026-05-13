import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import {
  addDiscussionComment,
  explainGitHubDiscussionError,
  isGitHubAuthError,
} from "@/lib/github-discussions";

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.githubToken) {
    return NextResponse.json(
      { error: "登录 GitHub 后才能发表评论。", needsLogin: true },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    discussionId?: string;
    body?: string;
    replyToId?: string | null;
  } | null;

  const discussionId = body?.discussionId?.trim();
  const commentBody = body?.body?.trim();
  const replyToId = body?.replyToId?.trim() || null;

  if (!discussionId || !commentBody) {
    return NextResponse.json(
      { error: "缺少讨论 ID 或评论内容。" },
      { status: 400 }
    );
  }

  if (commentBody.length > 4000) {
    return NextResponse.json(
      { error: "评论内容太长，请控制在 4000 字以内。" },
      { status: 400 }
    );
  }

  try {
    const comment = await addDiscussionComment(
      session.user.githubToken,
      discussionId,
      commentBody,
      replyToId
    );
    return NextResponse.json({ comment });
  } catch (error) {
    if (isGitHubAuthError(error)) {
      return NextResponse.json(
        {
          error: "GitHub 登录状态已失效，请重新登录后发表评论。",
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
