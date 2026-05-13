"use client";

/**
 * SessionProvider wrapper — re-exports next-auth's SessionProvider as a
 * client component so it can be dropped into the server-rendered root layout.
 */

import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useAuthStore } from "@/stores/auth-store";

function AuthSessionBridge() {
  const { status } = useSession();
  const restoreSession = useAuthStore((state) => state.restoreSession);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession, status]);

  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <AuthSessionBridge />
      {children}
    </NextAuthSessionProvider>
  );
}

export default SessionProvider;
