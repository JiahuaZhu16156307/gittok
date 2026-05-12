"use client";

/**
 * Interaction store for managing user interaction state (stars, follows).
 *
 * Features:
 * - Optimistic updates with rollback on failure
 * - Star: calls GitHub API via /api/github/star (PUT/DELETE)
 * - Follow: calls GitHub API via /api/github/follow (PUT/DELETE)
 * - Check status on load via /api/github/star/check and /api/github/follow/check
 * - In mock mode (USE_MOCK_FEED=true), does local-only optimistic updates
 *
 * Validates: Requirements 4.1-4.5, 5.1, Property 14, Property 22
 */

import { create } from "zustand";

export interface InteractionState {
  starredRepos: Set<string>; // Set of "owner/repo" strings
  followedAuthors: Set<string>;
  isProcessing: Set<string>; // Track in-flight operations to prevent double-clicks

  // Actions
  toggleStar: (owner: string, repo: string) => Promise<void>;
  toggleFollow: (username: string) => Promise<void>;
  markNotInterested: (repoId: string, metadata?: Record<string, unknown>) => Promise<void>;

  // Status checks (call on page load)
  checkStarStatus: (owner: string, repo: string) => Promise<void>;
  checkFollowStatus: (username: string) => Promise<void>;

  // State queries
  isStarred: (owner: string, repo: string) => boolean;
  isFollowed: (authorId: string) => boolean;

  // Hydration
  hydrate: (starred: string[], followed: string[]) => void;
}

/** Whether we're in mock mode (no real API calls) */
function isMockMode(): boolean {
  if (typeof window === "undefined") return false;
  // In mock mode, just do optimistic local updates without real API calls
  // This is determined by checking if the env var was exposed to the client
  return process.env.NEXT_PUBLIC_USE_MOCK_FEED === "true";
}

export const useInteractionStore = create<InteractionState>((set, get) => ({
  starredRepos: new Set<string>(),
  followedAuthors: new Set<string>(),
  isProcessing: new Set<string>(),

  toggleStar: async (owner: string, repo: string) => {
    const fullName = `${owner}/${repo}`;
    const key = `star:${fullName}`;
    if (get().isProcessing.has(key)) return;

    const wasStarred = get().starredRepos.has(fullName);

    // Optimistic update
    set((state) => {
      const newStarred = new Set(state.starredRepos);
      const newProcessing = new Set(state.isProcessing);
      newProcessing.add(key);
      if (wasStarred) {
        newStarred.delete(fullName);
      } else {
        newStarred.add(fullName);
      }
      return { starredRepos: newStarred, isProcessing: newProcessing };
    });

    // In mock mode, skip real API call
    if (isMockMode()) {
      set((state) => {
        const newProcessing = new Set(state.isProcessing);
        newProcessing.delete(key);
        return { isProcessing: newProcessing };
      });
      return;
    }

    try {
      const method = wasStarred ? "DELETE" : "POST";
      const res = await fetch("/api/github/star", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });

      if (!res.ok) {
        throw new Error(`Star API returned ${res.status}`);
      }
    } catch {
      // Rollback on failure
      set((state) => {
        const newStarred = new Set(state.starredRepos);
        if (wasStarred) {
          newStarred.add(fullName);
        } else {
          newStarred.delete(fullName);
        }
        return { starredRepos: newStarred };
      });
    } finally {
      set((state) => {
        const newProcessing = new Set(state.isProcessing);
        newProcessing.delete(key);
        return { isProcessing: newProcessing };
      });
    }
  },

  toggleFollow: async (username: string) => {
    const key = `follow:${username}`;
    if (get().isProcessing.has(key)) return;

    const wasFollowed = get().followedAuthors.has(username);

    // Optimistic update
    set((state) => {
      const newFollowed = new Set(state.followedAuthors);
      const newProcessing = new Set(state.isProcessing);
      newProcessing.add(key);
      if (wasFollowed) {
        newFollowed.delete(username);
      } else {
        newFollowed.add(username);
      }
      return { followedAuthors: newFollowed, isProcessing: newProcessing };
    });

    // In mock mode, skip real API call
    if (isMockMode()) {
      set((state) => {
        const newProcessing = new Set(state.isProcessing);
        newProcessing.delete(key);
        return { isProcessing: newProcessing };
      });
      return;
    }

    try {
      const method = wasFollowed ? "DELETE" : "POST";
      const res = await fetch("/api/github/follow", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (!res.ok) {
        throw new Error(`Follow API returned ${res.status}`);
      }
    } catch {
      // Rollback on failure
      set((state) => {
        const newFollowed = new Set(state.followedAuthors);
        if (wasFollowed) {
          newFollowed.add(username);
        } else {
          newFollowed.delete(username);
        }
        return { followedAuthors: newFollowed };
      });
    } finally {
      set((state) => {
        const newProcessing = new Set(state.isProcessing);
        newProcessing.delete(key);
        return { isProcessing: newProcessing };
      });
    }
  },

  markNotInterested: async (repoId: string, metadata?: Record<string, unknown>) => {
    const key = `ni:${repoId}`;
    if (get().isProcessing.has(key)) return;

    set((state) => {
      const newProcessing = new Set(state.isProcessing);
      newProcessing.add(key);
      return { isProcessing: newProcessing };
    });

    try {
      await fetch("/api/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId, type: "not_interested", metadata }),
      });
    } catch {
      // Not interested doesn't need rollback — fire and forget
    } finally {
      set((state) => {
        const newProcessing = new Set(state.isProcessing);
        newProcessing.delete(key);
        return { isProcessing: newProcessing };
      });
    }
  },

  checkStarStatus: async (owner: string, repo: string) => {
    if (isMockMode()) return;

    try {
      const res = await fetch(
        `/api/github/star/check?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
      );
      if (res.ok) {
        const data = await res.json();
        const fullName = `${owner}/${repo}`;
        set((state) => {
          const newStarred = new Set(state.starredRepos);
          if (data.starred) {
            newStarred.add(fullName);
          } else {
            newStarred.delete(fullName);
          }
          return { starredRepos: newStarred };
        });
      }
    } catch {
      // Silently fail — status check is best-effort
    }
  },

  checkFollowStatus: async (username: string) => {
    if (isMockMode()) return;

    try {
      const res = await fetch(
        `/api/github/follow/check?username=${encodeURIComponent(username)}`
      );
      if (res.ok) {
        const data = await res.json();
        set((state) => {
          const newFollowed = new Set(state.followedAuthors);
          if (data.following) {
            newFollowed.add(username);
          } else {
            newFollowed.delete(username);
          }
          return { followedAuthors: newFollowed };
        });
      }
    } catch {
      // Silently fail — status check is best-effort
    }
  },

  isStarred: (owner: string, repo: string) =>
    get().starredRepos.has(`${owner}/${repo}`),
  isFollowed: (authorId: string) => get().followedAuthors.has(authorId),

  hydrate: (starred: string[], followed: string[]) => {
    set({
      starredRepos: new Set(starred),
      followedAuthors: new Set(followed),
    });
  },
}));

// Keep backward-compatible aliases for any code that still references old names
// These are deprecated and will be removed in a future version
export type { InteractionState as InteractionStoreState };
