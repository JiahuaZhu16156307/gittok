"use client";

/**
 * Login page — GitHub OAuth sign-in.
 *
 * Uses next-auth/react signIn() to properly initiate the OAuth flow
 * with the correct callback URL.
 */

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const handleLogin = () => {
    signIn("github", { callbackUrl: "/" });
  };

  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Logo / Brand */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">GitTok</h1>
          <p className="text-white/60 text-sm">
            发现有趣的 GitHub 仓库
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error === "OAuthSignin" && "无法启动 GitHub 登录流程"}
            {error === "OAuthCallback" && "GitHub 回调失败，请重试"}
            {error === "OAuthAccountNotLinked" && "该账号已关联其他登录方式"}
            {error === "AccessDenied" && "访问被拒绝"}
            {error === "github" && "GitHub 登录失败，请检查网络后重试"}
            {!["OAuthSignin", "OAuthCallback", "OAuthAccountNotLinked", "AccessDenied", "github"].includes(error) && "登录失败，请重试"}
          </div>
        )}

        {/* Login button */}
        <button
          onClick={handleLogin}
          className="flex items-center justify-center gap-3 w-full px-6 py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          使用 GitHub 登录
        </button>

        {/* Skip / continue as guest */}
        <Link
          href="/"
          className="block text-white/50 text-xs hover:text-white/70 transition-colors"
        >
          跳过，以访客身份浏览
        </Link>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-[100dvh] flex items-center justify-center bg-black text-white">
        <div className="text-white/50">加载中...</div>
      </main>
    }>
      <LoginContent />
    </Suspense>
  );
}
