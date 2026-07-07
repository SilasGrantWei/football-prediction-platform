"use client";

import { RefreshCw, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getLiveMatchesClient, publicWsUrl } from "@/lib/api";
import type { Match } from "@/lib/types";
import { MatchCard } from "./MatchCard";

interface LivePayload {
  type: "live_snapshot";
  updatedAt: string;
  data: Match[];
}

export function LiveMatchBoard({ initialMatches }: { initialMatches: Match[] }) {
  const [matches, setMatches] = useState(initialMatches);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const nextMatches = await getLiveMatchesClient();
      setMatches(nextMatches);
      setUpdatedAt(new Date().toISOString());
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const socket = new WebSocket(publicWsUrl());

    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => setConnected(false));
    socket.addEventListener("error", () => setConnected(false));
    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data as string) as LivePayload;
        if (payload.type === "live_snapshot") {
          setMatches(payload.data);
          setUpdatedAt(payload.updatedAt);
        }
      } catch {
        void refresh();
      }
    });

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);

    return () => {
      window.clearInterval(timer);
      socket.close();
    };
  }, [refresh]);

  const statusText = useMemo(() => {
    if (!updatedAt) return "等待实时数据";
    return `更新于 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(updatedAt))}`;
  }, [updatedAt]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">实时比赛</h1>
          <p className="mt-1 text-sm text-slate-500">公开赛事数据源同步，实时连接推送，缓存层加速，十秒兜底刷新。</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            <Radio size={16} className={connected ? "text-red-600" : "text-slate-400"} aria-hidden />
            {connected ? "已连接" : "重连中"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden />
            刷新
          </button>
        </div>
      </div>

      <div className="text-sm text-slate-500">{statusText}</div>

      {matches.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
          当前没有进行中的比赛；已结束或未开始的比赛会在总览页自动刷新。
        </div>
      )}
    </section>
  );
}
