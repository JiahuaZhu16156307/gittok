"use client";

/**
 * SessionProvider wrapper — re-exports next-auth's SessionProvider as a
 * client component so it can be dropped into the server-rendered root layout.
 */

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function SessionProvider({ children }: { children: ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}

export default SessionProvider;
