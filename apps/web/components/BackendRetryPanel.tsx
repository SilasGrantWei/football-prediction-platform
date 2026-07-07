"use client";

import { RefreshCw, Wifi } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface BackendRetryPanelProps {
  matchId: string;
}

type RetryState = "checking" | "waiting" | "ready" | "exhausted";

const POLL_INTERVAL_MS = 3_000;
const MAX_AUTO_RELOADS = 3;
const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

export function BackendRetryPanel({ matchId }: BackendRetryPanelProps) {
  const [state, setState] = useState<RetryState>("checking");
  const [message, setMessage] = useState("正在检查本地 API 是否已经恢复。");
  const [attempt, setAttempt] = useState(0);
  const timerRef = useRef<number | undefined>(undefined);
  const storageKey = useMemo(() => `football-match-reload:${matchId}`, [matchId]);

  const reloadIfAllowed = useCallback(() => {
    const current = Number(window.sessionStorage.getItem(storageKey) ?? "0");
    if (current >= MAX_AUTO_RELOADS) {
      setState("exhausted");
      setMessage("本地 API 已恢复，但页面已自动刷新多次。请点下面按钮强制刷新。");
      return;
    }

    window.sessionStorage.setItem(storageKey, String(current + 1));
    window.location.reload();
  }, [storageKey]);

  const checkBackend = useCallback(async () => {
    setAttempt((value) => value + 1);
    setState("checking");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2_500);

    try {
      const response = await fetch(`${PUBLIC_API_BASE_URL}/api/matches/${encodeURIComponent(matchId)}?ts=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal
      });

      if (response.ok) {
        setState("ready");
        setMessage("本地 API 已恢复，正在重新加载比赛详情。");
        reloadIfAllowed();
        return;
      }

      setState("waiting");
      setMessage(`本地 API 返回 ${response.status}，继续等待自动重试。`);
    } catch {
      setState("waiting");
      setMessage("本地 API 暂时还没响应，页面会继续自动重试。");
    } finally {
      window.clearTimeout(timeout);
    }
  }, [matchId, reloadIfAllowed]);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => {
      void checkBackend();
    }, 0);
    timerRef.current = window.setInterval(() => {
      void checkBackend();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(initialCheck);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [checkBackend]);

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-white/75 p-4 text-sm text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Wifi className="mt-0.5 shrink-0" size={16} aria-hidden />
          <div>
            <div className="font-semibold">
              {state === "ready" ? "服务已恢复" : state === "exhausted" ? "需要手动刷新" : "自动重试中"}
            </div>
            <div className="mt-1 leading-6 text-amber-900">{message}</div>
            <div className="mt-1 text-xs text-amber-700">已检查 {attempt} 次。</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-amber-100 px-3 text-xs font-bold text-amber-950 transition hover:bg-amber-200"
        >
          <RefreshCw size={14} aria-hidden />
          立即刷新
        </button>
      </div>
    </div>
  );
}
