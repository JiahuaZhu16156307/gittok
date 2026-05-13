"use client";

/**
 * Settings page - User preferences and account management.
 *
 * Features:
 * - Toggle: blockForks
 * - Editable list: blockedLanguages
 * - Button: "重置推荐偏好" with confirmation
 * - Button: "退出登录"
 *
 * Validates: Requirements 9.3, 9.4, 11.5
 */

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import Link from "next/link";

export default function SettingsPage() {
  const { isAuthenticated, logout, restoreSession } = useAuthStore();
  const [blockForks, setBlockForks] = useState(false);
  const [blockedLanguages, setBlockedLanguages] = useState<string[]>([]);
  const [newLanguage, setNewLanguage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Load settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setBlockForks(data.blockForks ?? false);
          setBlockedLanguages(data.blockedLanguages ?? []);
        }
      } catch {
        // Ignore errors on load
      }
    }
    if (isAuthenticated) {
      loadSettings();
    }
  }, [isAuthenticated]);

  const saveSettings = useCallback(async (newBlockForks: boolean, newBlockedLanguages: string[]) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockForks: newBlockForks,
          blockedLanguages: newBlockedLanguages,
        }),
      });
      if (res.ok) {
        setMessage('设置已保存');
        setTimeout(() => setMessage(null), 2000);
      }
    } catch {
      setMessage('保存失败');
      setTimeout(() => setMessage(null), 2000);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const handleToggleForks = () => {
    const newValue = !blockForks;
    setBlockForks(newValue);
    saveSettings(newValue, blockedLanguages);
  };

  const handleAddLanguage = () => {
    const lang = newLanguage.trim();
    if (lang && !blockedLanguages.includes(lang)) {
      const newList = [...blockedLanguages, lang];
      setBlockedLanguages(newList);
      setNewLanguage("");
      saveSettings(blockForks, newList);
    }
  };

  const handleRemoveLanguage = (lang: string) => {
    const newList = blockedLanguages.filter((l) => l !== lang);
    setBlockedLanguages(newList);
    saveSettings(blockForks, newList);
  };

  const handleResetProfile = async () => {
    setIsResetting(true);
    try {
      const res = await fetch('/api/settings/reset-profile', { method: 'POST' });
      if (res.ok) {
        setMessage('推荐偏好已重置');
        setShowResetConfirm(false);
      } else {
        setMessage('重置失败');
      }
    } catch {
      setMessage('重置失败');
    } finally {
      setIsResetting(false);
      setTimeout(() => setMessage(null), 2000);
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center bg-black text-white p-6">
        <div className="text-center space-y-4">
          <p className="text-white/60">请先登录以访问设置</p>
          <Link
            href="/login"
            className="inline-block px-4 py-2 rounded-lg bg-white text-black text-sm font-medium"
          >
            去登录
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-black text-white p-6 pb-24">
      <div className="max-w-md mx-auto space-y-8">
        <h1 className="text-2xl font-bold">设置</h1>

        {/* Toast message */}
        {message && (
          <div className="px-4 py-2 rounded-lg bg-white/10 text-sm text-white/80 text-center">
            {message}
          </div>
        )}

        {/* Block Forks Toggle */}
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-white/70">内容过滤</h2>
          <label className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
            <span className="text-sm">屏蔽 Fork 仓库</span>
            <button
              type="button"
              role="switch"
              aria-checked={blockForks}
              onClick={handleToggleForks}
              disabled={isSaving}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                blockForks ? 'bg-indigo-500' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  blockForks ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        </section>

        {/* Blocked Languages */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-white/70">屏蔽语言</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddLanguage()}
              placeholder="输入语言名称..."
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleAddLanguage}
              disabled={!newLanguage.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              添加
            </button>
          </div>
          {blockedLanguages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {blockedLanguages.map((lang) => (
                <span
                  key={lang}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs text-white/80"
                >
                  {lang}
                  <button
                    onClick={() => handleRemoveLanguage(lang)}
                    className="text-white/50 hover:text-white"
                    aria-label={`移除 ${lang}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Reset Profile */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-white/70">推荐偏好</h2>
          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full px-4 py-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-medium hover:bg-orange-500/20 transition-colors"
            >
              重置推荐偏好
            </button>
          ) : (
            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20 space-y-3">
              <p className="text-sm text-orange-300">
                确定要重置推荐偏好吗？这将清除所有学习到的偏好数据。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleResetProfile}
                  disabled={isResetting}
                  className="flex-1 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {isResetting ? '重置中...' : '确认重置'}
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-white/10 text-white text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Logout */}
        <section className="pt-4 border-t border-white/10">
          <button
            onClick={logout}
            className="w-full px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            退出登录
          </button>
        </section>

        {/* Back to feed */}
        <Link
          href="/"
          className="block text-center text-white/50 text-xs hover:text-white/70 transition-colors"
        >
          ← 返回推荐
        </Link>

        <section className="pt-4 border-t border-white/10 text-center space-y-3">
          <p className="text-xs leading-relaxed text-white/50">
            欢迎访问并留下宝贵建议
          </p>
          <a
            href="https://github.com/Mad12345-qw/gittok"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15"
          >
            本项目作者仓库
          </a>
        </section>
      </div>
    </main>
  );
}
