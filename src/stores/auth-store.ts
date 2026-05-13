"use client";

/**
 * Auth store for managing authentication state.
 *
 * Thin wrapper around NextAuth. Provides:
 * - login(): redirects to NextAuth GitHub sign-in flow
 * - logout(): calls NextAuth signOut and clears local state
 * - restoreSession(): fetches /api/auth/session and hydrates the store
 *
 * _Requirements: 1.1, 1.2, 1.4, 1.5, 1.7_
 */

import { create } from "zustand";
import { signIn, signOut, getSession } from "next-auth/react";

export interface AuthUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  login: (callbackUrl?: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (callbackUrl) => {
    const nextUrl =
      callbackUrl ||
      (typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : "/");

    try {
      const result = await signIn("github", {
        callbackUrl: nextUrl,
        redirect: false,
      });

      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
    } catch {
      // Fall through to the explicit login page fallback below.
    }

    if (typeof window !== "undefined") {
      window.location.assign(`/login?callbackUrl=${encodeURIComponent(nextUrl)}`);
    }
  },

  logout: async () => {
    try {
      await signOut({ redirect: false });
    } finally {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  restoreSession: async () => {
    set({ isLoading: true });
    try {
      // getSession() hits /api/auth/session under the hood.
      const session = await getSession();
      if (session?.user?.id) {
        set({
          user: {
            id: session.user.id,
            name: session.user.name,
            avatarUrl: session.user.image ?? undefined,
          },
          isAuthenticated: true,
          isLoading: false,
        });
        return;
      }
      set({ user: null, isAuthenticated: false, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
