import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface GitTokCommentRow {
  id: string;
  repo_full_name: string;
  body: string;
  reply_to_id: string | null;
  author_id: string | null;
  author_name: string;
  author_avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

const commentsTableState = globalThis as typeof globalThis & {
  __gittokCommentsTablePromise?: Promise<void>;
};

async function ensureCommentsTable() {
  if (commentsTableState.__gittokCommentsTablePromise) {
    return commentsTableState.__gittokCommentsTablePromise;
  }

  commentsTableState.__gittokCommentsTablePromise = ensureCommentsTableOnce().catch((error) => {
    commentsTableState.__gittokCommentsTablePromise = undefined;
    throw error;
  });

  return commentsTableState.__gittokCommentsTablePromise;
}

async function ensureCommentsTableOnce() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GitTokComment" (
      "id" TEXT PRIMARY KEY,
      "repo_full_name" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "reply_to_id" TEXT,
      "author_id" TEXT,
      "author_name" TEXT NOT NULL,
      "author_avatar_url" TEXT,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "GitTokComment_repo_created_idx"
    ON "GitTokComment" ("repo_full_name", "created_at" DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "GitTokComment_reply_idx"
    ON "GitTokComment" ("reply_to_id")
  `);
}

function normalizeRepoFullName(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[^/\s]+\/[^/\s]+$/.test(trimmed) ? trimmed : null;
}

function mapComment(row: GitTokCommentRow) {
  return {
    id: row.id,
    repoFullName: row.repo_full_name,
    body: row.body,
    replyToId: row.reply_to_id,
    author: {
      id: row.author_id,
      name: row.author_name,
      avatarUrl: row.author_avatar_url,
    },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const repoFullName = normalizeRepoFullName(searchParams.get("repoFullName"));

  if (!repoFullName) {
    return NextResponse.json(
      { error: "Missing or invalid repoFullName" },
      { status: 400 }
    );
  }

  try {
    await ensureCommentsTable();
    const rows = await prisma.$queryRawUnsafe<GitTokCommentRow[]>(
      `
        SELECT
          "id",
          "repo_full_name",
          "body",
          "reply_to_id",
          "author_id",
          "author_name",
          "author_avatar_url",
          "created_at",
          "updated_at"
        FROM "GitTokComment"
        WHERE "repo_full_name" = $1
        ORDER BY "created_at" ASC
        LIMIT 200
      `,
      repoFullName
    );

    return NextResponse.json({
      repoFullName,
      totalCount: rows.length,
      comments: rows.map(mapComment),
    });
  } catch (error) {
    console.error("[GitTok Comments GET] Error:", error);
    return NextResponse.json(
      { error: "GitTok 评论加载失败，请稍后重试。" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    repoFullName?: string;
    body?: string;
    replyToId?: string | null;
  } | null;

  const repoFullName = normalizeRepoFullName(body?.repoFullName ?? null);
  const commentBody = body?.body?.trim();
  const replyToId = body?.replyToId?.trim() || null;

  if (!repoFullName || !commentBody) {
    return NextResponse.json(
      { error: "缺少仓库或评论内容。" },
      { status: 400 }
    );
  }

  if (commentBody.length > 2000) {
    return NextResponse.json(
      { error: "评论内容太长，请控制在 2000 字以内。" },
      { status: 400 }
    );
  }

  try {
    await ensureCommentsTable();
    const session = await getServerSession();
    const user = session?.user;
    const id = crypto.randomUUID();
    const authorName = user?.name || "GitTok 访客";
    const authorId = user?.id ?? null;
    const authorAvatarUrl = user?.image ?? null;

    const rows = await prisma.$queryRawUnsafe<GitTokCommentRow[]>(
      `
        INSERT INTO "GitTokComment" (
          "id",
          "repo_full_name",
          "body",
          "reply_to_id",
          "author_id",
          "author_name",
          "author_avatar_url"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          "id",
          "repo_full_name",
          "body",
          "reply_to_id",
          "author_id",
          "author_name",
          "author_avatar_url",
          "created_at",
          "updated_at"
      `,
      id,
      repoFullName,
      commentBody,
      replyToId,
      authorId,
      authorName,
      authorAvatarUrl
    );

    return NextResponse.json({ comment: mapComment(rows[0]) });
  } catch (error) {
    console.error("[GitTok Comments POST] Error:", error);
    return NextResponse.json(
      { error: "GitTok 评论发布失败，请稍后重试。" },
      { status: 500 }
    );
  }
}
