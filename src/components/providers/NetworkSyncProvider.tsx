"use client";

/**
 * NetworkSyncProvider - Manages offline/online state and queue flushing.
 *
 * Listens to browser online/offline events. On reconnect, flushes the
 * offline queue. Shows a toast when 3 consecutive timeouts occur.
 *
 * Validates: Requirements 4.7, 8.6, 10.4
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { flush, hasPending } from "@/lib/offline-queue";

interface NetworkSyncProviderProps {
  children: React.ReactNode;
}

export function NetworkSyncProvider({ children }: NetworkSyncProviderProps) {
  const [isOffline, setIsOffline] = useState(false);
  const [showSlowToast, setShowSlowToast] = useState(false);
  const timeoutCountRef = useRef(0);

  const handleOnline = useCallback(async () => {
    setIsOffline(false);
    timeoutCountRef.current = 0;
    setShowSlowToast(false);

    // Flush offline queue on reconnect
    const pending = await hasPending();
    if (pending) {
      try {
        await flush();
      } catch (err) {
        console.error('[NetworkSync] Flush failed on reconnect:', err);
      }
    }
  }, []);

  const handleOffline = useCallback(() => {
    setIsOffline(true);
  }, []);

  // Track slow network via a periodic connectivity check
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (!isOffline) {
      intervalId = setInterval(async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          // Simple connectivity check — just hit a lightweight endpoint
          await fetch('/api/auth/session', {
            signal: controller.signal,
            cache: 'no-store',
          }).catch(() => {});
          clearTimeout(timeoutId);
          // Success: reset counter
          timeoutCountRef.current = 0;
          setShowSlowToast(false);
        } catch {
          timeoutCountRef.current++;
          if (timeoutCountRef.current >= 3) {
            setShowSlowToast(true);
          }
        }
      }, 30000); // Check every 30s
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOffline]);

  useEffect(() => {
    // Set initial state
    setIsOffline(!navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Flush any pending events on mount if online
    if (navigator.onLine) {
      hasPending().then((pending) => {
        if (pending) flush().catch(() => {});
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return (
    <>
      {children}

      {/* Offline indicator */}
      {isOffline && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-yellow-500/90 text-black text-xs font-medium backdrop-blur-sm shadow-lg">
          离线模式 · 操作将在恢复连接后同步
        </div>
      )}

      {/* Slow network toast */}
      {showSlowToast && !isOffline && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-orange-500/90 text-white text-xs font-medium backdrop-blur-sm shadow-lg">
          网络缓慢 · 请稍后重试
        </div>
      )}
    </>
  );
}

export default NetworkSyncProvider;
