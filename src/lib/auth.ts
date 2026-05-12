import { NextAuthOptions, getServerSession as nextAuthGetServerSession } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      httpOptions: {
        timeout: 30000,
      },
      authorization: {
        params: {
          // public_repo: needed for starring repos
          // user:follow: needed for following/unfollowing users
          scope: "public_repo user:follow",
        },
      },
      // Custom token exchange — NextAuth's built-in openid-client doesn't
      // handle GitHub App responses correctly (returns "no access token")
      token: {
        url: "https://github.com/login/oauth/access_token",
        async request(context) {
          const { params, provider } = context;
          const res = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({
              client_id: provider.clientId,
              client_secret: provider.clientSecret,
              code: params.code,
            }),
          });
          const data = await res.json() as Record<string, unknown>;
          console.log("[NextAuth] Token exchange response:", JSON.stringify(data));
          if (data.error) {
            throw new Error(String(data.error_description || data.error));
          }
          return {
            tokens: {
              access_token: data.access_token as string,
              token_type: (data.token_type as string) || "bearer",
              scope: data.scope as string,
            },
          };
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || !profile) return false;

      // Skip DB operations in mock mode (no database available)
      if (!process.env.DATABASE_URL || process.env.USE_MOCK_FEED === 'true') {
        return true;
      }

      const githubId = String(profile.sub ?? account.providerAccountId);
      const name = user.name ?? (profile as { login?: string }).login ?? "Unknown";
      const avatarUrl = user.image ?? "";

      await prisma.user.upsert({
        where: { githubId },
        update: {
          name,
          avatarUrl,
          accessToken: account.access_token ?? "",
        },
        create: {
          githubId,
          name,
          avatarUrl,
          accessToken: account.access_token ?? "",
        },
      });

      return true;
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const githubId = String(profile.sub ?? account.providerAccountId);

        // Skip DB lookup in mock mode
        if (!process.env.DATABASE_URL || process.env.USE_MOCK_FEED === 'true') {
          token.userId = githubId;
          token.githubToken = account.access_token ?? undefined;
          return token;
        }

        const dbUser = await prisma.user.findUnique({
          where: { githubId },
          select: { id: true },
        });

        token.userId = dbUser?.id;
        token.githubToken = account.access_token ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      if (token.githubToken) {
        session.user.githubToken = token.githubToken;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Get the server-side session using NextAuth's getServerSession with our authOptions.
 */
export async function getServerSession() {
  return nextAuthGetServerSession(authOptions);
}

/**
 * Get the current authenticated user from the session, or null if not authenticated.
 */
export async function getCurrentUser() {
  const session = await getServerSession();
  return session?.user ?? null;
}
