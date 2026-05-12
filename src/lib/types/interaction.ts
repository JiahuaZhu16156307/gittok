/**
 * Interaction event type definitions for GitTok.
 */

/** All possible interaction types */
export type InteractionType =
  | 'like'
  | 'unlike'
  | 'favorite'
  | 'unfavorite'
  | 'follow'
  | 'unfollow'
  | 'not_interested'
  | 'view'
  | 'quick_skip'
  | 'open_external';

/** A user interaction event */
export interface InteractionEvent {
  id: string;
  userId: string;
  repoId: string;
  repoFullName: string;
  type: InteractionType;
  dwellTimeMs?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  syncedAt?: Date;
}

/** Request body for creating a single interaction */
export interface CreateInteractionRequest {
  repoId: string;
  type: InteractionType;
  /**
   * Full repo name in `owner/name` form. Optional on the client-facing type
   * (can also be provided via metadata.fullName), but required for server-side
   * persistence so the API route will derive it if missing.
   */
  repoFullName?: string;
  dwellTimeMs?: number;
  metadata?: Record<string, unknown>;
}

/** Request body for batch syncing offline events */
export interface BatchSyncRequest {
  events: CreateInteractionRequest[];
}
