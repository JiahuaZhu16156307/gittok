const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const GITHUB_GRAPHQL_TIMEOUT_MS = 12000;

export interface DiscussionAuthor {
  login: string;
  avatarUrl: string;
  url: string;
}

export interface DiscussionComment {
  id: string;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  replyToId: string | null;
  author: DiscussionAuthor | null;
}

export interface RepositoryDiscussion {
  id: string;
  number: number;
  title: string;
  bodyText: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  closed: boolean;
  locked: boolean;
  upvoteCount: number;
  author: DiscussionAuthor | null;
  commentsTotalCount: number;
  comments: DiscussionComment[];
}

export interface DiscussionCategory {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  isAnswerable: boolean;
}

export interface RepositoryDiscussionsResult {
  repository: {
    id: string;
    nameWithOwner: string;
    url: string;
    hasDiscussionsEnabled: boolean;
  };
  categories: DiscussionCategory[];
  discussionsTotalCount: number;
  discussions: RepositoryDiscussion[];
}

export interface RepositoryDiscussionCountResult {
  repository: {
    id: string;
    nameWithOwner: string;
    hasDiscussionsEnabled: boolean;
  };
  discussionsTotalCount: number;
}

interface GraphQLError {
  message: string;
  type?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export class GitHubGraphQLError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubGraphQLError";
    this.status = status;
  }
}

export function isGitHubAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = error instanceof GitHubGraphQLError ? error.status : 0;
  const message = error.message.toLowerCase();
  return (
    status === 401 ||
    message.includes("bad credentials") ||
    message.includes("requires authentication") ||
    message.includes("authentication required") ||
    message.includes("unauthorized")
  );
}

export function explainGitHubDiscussionError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "GitHub Discussions request failed";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("oauth app access restrictions") ||
    normalized.includes("third-parties is limited") ||
    normalized.includes("third-party") ||
    normalized.includes("restricting access to your organization's data")
  ) {
    return "这个仓库所属组织开启了 GitHub OAuth App 访问限制。你的登录是有效的，但该组织没有批准 GitTok 访问它的组织数据，所以无法在这里同步发布评论。需要组织管理员在 GitHub 里批准这个 OAuth App，或者去 GitHub 原页面评论。";
  }

  if (normalized.includes("timed out")) {
    return "GitHub 响应超时，请稍后重试。";
  }

  if (
    normalized.includes("resource not accessible") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission") ||
    normalized.includes("could not resolve")
  ) {
    return "当前 GitHub 账号没有权限在这个仓库执行该操作。很多公开仓库只允许维护者或有权限的成员发起 Discussions 或写入部分内容。";
  }

  return message;
}

function graphqlHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_GRAPHQL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: graphqlHeaders(token),
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
      next: { revalidate: 0 },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("GitHub request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = (await res.json().catch(() => ({}))) as GraphQLResponse<T>;
  if (!res.ok || payload.errors?.length) {
    const message =
      payload.errors?.map((error) => error.message).join("; ") ||
      `GitHub GraphQL request failed with ${res.status}`;
    throw new GitHubGraphQLError(message, res.status);
  }

  if (!payload.data) {
    throw new Error("GitHub GraphQL returned no data");
  }

  return payload.data;
}

const DISCUSSIONS_QUERY = `
  query RepositoryDiscussions(
    $owner: String!
    $repo: String!
    $discussionFirst: Int!
    $commentFirst: Int!
  ) {
    repository(owner: $owner, name: $repo) {
      id
      nameWithOwner
      url
      hasDiscussionsEnabled
      discussionCategories(first: 20) {
        nodes {
          id
          name
          emoji
          description
          isAnswerable
        }
      }
      discussions(first: $discussionFirst, orderBy: { field: UPDATED_AT, direction: DESC }) {
        totalCount
        nodes {
          id
          number
          title
          bodyText
          url
          createdAt
          updatedAt
          closed
          locked
          upvoteCount
          author {
            login
            avatarUrl
            url
          }
          comments(first: $commentFirst) {
            totalCount
            nodes {
              id
              bodyText
              createdAt
              updatedAt
              url
              upvoteCount
              viewerHasUpvoted
              replyTo {
                id
              }
              author {
                login
                avatarUrl
                url
              }
              replies(first: 10) {
                nodes {
                  id
                  bodyText
                  createdAt
                  updatedAt
                  url
                  upvoteCount
                  viewerHasUpvoted
                  replyTo {
                    id
                  }
                  author {
                    login
                    avatarUrl
                    url
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const DISCUSSION_COUNT_QUERY = `
  query RepositoryDiscussionCount($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      id
      nameWithOwner
      hasDiscussionsEnabled
      discussions(first: 1) {
        totalCount
      }
    }
  }
`;

interface RawRepositoryDiscussionsData {
  repository: {
    id: string;
    nameWithOwner: string;
    url: string;
    hasDiscussionsEnabled: boolean;
    discussionCategories: {
      nodes: Array<DiscussionCategory | null> | null;
    };
    discussions: {
      totalCount: number;
      nodes: Array<{
        id: string;
        number: number;
        title: string;
        bodyText: string;
        url: string;
        createdAt: string;
        updatedAt: string;
        closed: boolean;
        locked: boolean;
        upvoteCount: number;
        author: DiscussionAuthor | null;
        comments: {
          totalCount: number;
          nodes: Array<{
            id: string;
            bodyText: string;
            createdAt: string;
            updatedAt: string;
            url: string;
            upvoteCount: number;
            viewerHasUpvoted: boolean;
            replyTo: { id: string } | null;
            author: DiscussionAuthor | null;
            replies: {
              nodes: Array<{
                id: string;
                bodyText: string;
                createdAt: string;
                updatedAt: string;
                url: string;
                upvoteCount: number;
                viewerHasUpvoted: boolean;
                replyTo: { id: string } | null;
                author: DiscussionAuthor | null;
              } | null> | null;
            };
          } | null> | null;
        };
      } | null> | null;
    };
  } | null;
}

export async function getRepositoryDiscussions(
  token: string,
  owner: string,
  repo: string,
  discussionFirst = 5,
  commentFirst = 30
): Promise<RepositoryDiscussionsResult> {
  const data = await githubGraphQL<RawRepositoryDiscussionsData>(
    token,
    DISCUSSIONS_QUERY,
    { owner, repo, discussionFirst, commentFirst }
  );

  if (!data.repository) {
    throw new Error("Repository not found");
  }

  const discussionNodes = data.repository.discussions.nodes ?? [];
  const discussions = discussionNodes.filter(Boolean).map((discussion) => {
    const comments = (discussion!.comments.nodes ?? []).filter(Boolean).flatMap((comment) => {
      const rootComment = {
        id: comment!.id,
        bodyText: comment!.bodyText,
        createdAt: comment!.createdAt,
        updatedAt: comment!.updatedAt,
        url: comment!.url,
        upvoteCount: comment!.upvoteCount,
        viewerHasUpvoted: comment!.viewerHasUpvoted,
        replyToId: comment!.replyTo?.id ?? null,
        author: comment!.author,
      };

      const replies = (comment!.replies?.nodes ?? []).filter(Boolean).map((reply) => ({
        id: reply!.id,
        bodyText: reply!.bodyText,
        createdAt: reply!.createdAt,
        updatedAt: reply!.updatedAt,
        url: reply!.url,
        upvoteCount: reply!.upvoteCount,
        viewerHasUpvoted: reply!.viewerHasUpvoted,
        replyToId: reply!.replyTo?.id ?? comment!.id,
        author: reply!.author,
      }));

      return [rootComment, ...replies];
    });

    return {
      id: discussion!.id,
      number: discussion!.number,
      title: discussion!.title,
      bodyText: discussion!.bodyText,
      url: discussion!.url,
      createdAt: discussion!.createdAt,
      updatedAt: discussion!.updatedAt,
      closed: discussion!.closed,
      locked: discussion!.locked,
      upvoteCount: discussion!.upvoteCount,
      author: discussion!.author,
      commentsTotalCount: discussion!.comments.totalCount,
      comments,
    };
  });

  return {
    repository: {
      id: data.repository.id,
      nameWithOwner: data.repository.nameWithOwner,
      url: data.repository.url,
      hasDiscussionsEnabled: data.repository.hasDiscussionsEnabled,
    },
    categories: (data.repository.discussionCategories.nodes ?? []).filter(
      (category): category is DiscussionCategory => Boolean(category)
    ),
    discussionsTotalCount: data.repository.discussions.totalCount,
    discussions,
  };
}

interface RawRepositoryDiscussionCountData {
  repository: {
    id: string;
    nameWithOwner: string;
    hasDiscussionsEnabled: boolean;
    discussions: {
      totalCount: number;
    };
  } | null;
}

export async function getRepositoryDiscussionCount(
  token: string,
  owner: string,
  repo: string
): Promise<RepositoryDiscussionCountResult> {
  const data = await githubGraphQL<RawRepositoryDiscussionCountData>(
    token,
    DISCUSSION_COUNT_QUERY,
    { owner, repo }
  );

  if (!data.repository) {
    throw new Error("Repository not found");
  }

  return {
    repository: {
      id: data.repository.id,
      nameWithOwner: data.repository.nameWithOwner,
      hasDiscussionsEnabled: data.repository.hasDiscussionsEnabled,
    },
    discussionsTotalCount: data.repository.hasDiscussionsEnabled
      ? data.repository.discussions.totalCount
      : 0,
  };
}

const CREATE_DISCUSSION_MUTATION = `
  mutation CreateDiscussion(
    $repositoryId: ID!
    $categoryId: ID!
    $title: String!
    $body: String!
  ) {
    createDiscussion(input: {
      repositoryId: $repositoryId
      categoryId: $categoryId
      title: $title
      body: $body
    }) {
      discussion {
        id
        number
        title
        bodyText
        url
        createdAt
        updatedAt
        closed
        locked
        upvoteCount
        author {
          login
          avatarUrl
          url
        }
        comments(first: 1) {
          totalCount
          nodes {
            id
            bodyText
            createdAt
            updatedAt
            url
            upvoteCount
            viewerHasUpvoted
            replyTo {
              id
            }
            author {
              login
              avatarUrl
              url
            }
          }
        }
      }
    }
  }
`;

interface CreateDiscussionData {
  createDiscussion: {
    discussion: {
      id: string;
      number: number;
      title: string;
      bodyText: string;
      url: string;
      createdAt: string;
      updatedAt: string;
      closed: boolean;
      locked: boolean;
      upvoteCount: number;
      author: DiscussionAuthor | null;
      comments: {
        totalCount: number;
        nodes: Array<{
          id: string;
          bodyText: string;
          createdAt: string;
          updatedAt: string;
          url: string;
          upvoteCount: number;
          viewerHasUpvoted: boolean;
          replyTo: { id: string } | null;
          author: DiscussionAuthor | null;
        } | null> | null;
      };
    };
  };
}

export async function createRepositoryDiscussion(
  token: string,
  repositoryId: string,
  categoryId: string,
  title: string,
  body: string
): Promise<RepositoryDiscussion> {
  const data = await githubGraphQL<CreateDiscussionData>(
    token,
    CREATE_DISCUSSION_MUTATION,
    { repositoryId, categoryId, title, body }
  );

  const discussion = data.createDiscussion.discussion;
  return {
    id: discussion.id,
    number: discussion.number,
    title: discussion.title,
    bodyText: discussion.bodyText,
    url: discussion.url,
    createdAt: discussion.createdAt,
    updatedAt: discussion.updatedAt,
    closed: discussion.closed,
    locked: discussion.locked,
    upvoteCount: discussion.upvoteCount,
    author: discussion.author,
    commentsTotalCount: discussion.comments.totalCount,
    comments: (discussion.comments.nodes ?? []).filter(Boolean).map((comment) => ({
      id: comment!.id,
      bodyText: comment!.bodyText,
      createdAt: comment!.createdAt,
      updatedAt: comment!.updatedAt,
      url: comment!.url,
      upvoteCount: comment!.upvoteCount,
      viewerHasUpvoted: comment!.viewerHasUpvoted,
      replyToId: comment!.replyTo?.id ?? null,
      author: comment!.author,
    })),
  };
}

const ADD_COMMENT_MUTATION = `
  mutation AddDiscussionComment($discussionId: ID!, $body: String!, $replyToId: ID) {
    addDiscussionComment(input: { discussionId: $discussionId, body: $body, replyToId: $replyToId }) {
      comment {
        id
        bodyText
        createdAt
        updatedAt
        url
        upvoteCount
        viewerHasUpvoted
        replyTo {
          id
        }
        author {
          login
          avatarUrl
          url
        }
      }
    }
  }
`;

interface AddCommentData {
  addDiscussionComment: {
    comment: {
      id: string;
      bodyText: string;
      createdAt: string;
      updatedAt: string;
      url: string;
      upvoteCount: number;
      viewerHasUpvoted: boolean;
      replyTo: { id: string } | null;
      author: DiscussionAuthor | null;
    };
  };
}

export async function addDiscussionComment(
  token: string,
  discussionId: string,
  body: string,
  replyToId?: string | null
): Promise<DiscussionComment> {
  const data = await githubGraphQL<AddCommentData>(token, ADD_COMMENT_MUTATION, {
    discussionId,
    body,
    replyToId: replyToId ?? null,
  });

  const comment = data.addDiscussionComment.comment;
  return {
    id: comment.id,
    bodyText: comment.bodyText,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    url: comment.url,
    upvoteCount: comment.upvoteCount,
    viewerHasUpvoted: comment.viewerHasUpvoted,
    replyToId: comment.replyTo?.id ?? null,
    author: comment.author,
  };
}

const ADD_UPVOTE_MUTATION = `
  mutation AddUpvote($subjectId: ID!) {
    addUpvote(input: { subjectId: $subjectId }) {
      subject {
        ... on DiscussionComment {
          id
          upvoteCount
          viewerHasUpvoted
        }
      }
    }
  }
`;

const REMOVE_UPVOTE_MUTATION = `
  mutation RemoveUpvote($subjectId: ID!) {
    removeUpvote(input: { subjectId: $subjectId }) {
      subject {
        ... on DiscussionComment {
          id
          upvoteCount
          viewerHasUpvoted
        }
      }
    }
  }
`;

interface UpvoteData {
  addUpvote?: {
    subject: {
      id: string;
      upvoteCount: number;
      viewerHasUpvoted: boolean;
    } | null;
  };
  removeUpvote?: {
    subject: {
      id: string;
      upvoteCount: number;
      viewerHasUpvoted: boolean;
    } | null;
  };
}

export async function setDiscussionCommentUpvote(
  token: string,
  commentId: string,
  upvote: boolean
): Promise<{ id: string; upvoteCount: number; viewerHasUpvoted: boolean }> {
  const data = await githubGraphQL<UpvoteData>(
    token,
    upvote ? ADD_UPVOTE_MUTATION : REMOVE_UPVOTE_MUTATION,
    { subjectId: commentId }
  );

  const subject = upvote
    ? data.addUpvote?.subject
    : data.removeUpvote?.subject;

  if (!subject) {
    throw new Error("GitHub did not return the updated comment");
  }

  return subject;
}
