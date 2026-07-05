"use client";

import { Radio } from "lucide-react";
import { useMemo } from "react";

import { publicDataWsBaseUrl } from "@/lib/api";
import type { Match } from "@/lib/types";
import { MatchCard } from "./MatchCard";
import { useWebSocket } from "@/hooks/useWebSocket";

interface LiveUpdate {
  match_id: string;
  minute: number;
  status: Match["status"];
  home_score: number;
  away_score: number;
  xg_live: { home: number; away: number };
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  dangerous_attacks: { home: number; away: number };
}

interface LiveMessage {
  type: "live_matches";
  updated_at: string;
  data: LiveUpdate[];
}

export function LiveMatchFeed({ initialMatches }: { initialMatches: Match[] }) {
  const { state, message } = useWebSocket<LiveMessage>(`${publicDataWsBaseUrl()}/ws/live`);
  const updatedAt = message?.updated_at;

  const matches = useMemo(() => {
    if (!message || message.type !== "live_matches") return initialMatches;
    return applyLiveUpdates(initialMatches, message.data);
  }, [initialMatches, message]);

  const updatedText = useMemo(() => {
    if (!updatedAt) return "等待实时流";
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(updatedAt));
  }, [updatedAt]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">实时比赛流</h2>
          <p className="mt-1 text-sm text-slate-500">实时连接秒级推送，轮询接口作为兜底。</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          <Radio size={16} className={state === "open" ? "text-red-600" : "text-slate-400"} aria-hidden />
          {state === "open" ? `已连接 · ${updatedText}` : "重连中"}
        </span>
      </div>

      {matches.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">当前没有实时比赛。</div>
      )}
    </section>
  );
}

function applyLiveUpdates(matches: Match[], updates: LiveUpdate[]): Match[] {
  if (!updates.length) return matches;
  const updateMap = new Map(updates.map((update) => [update.match_id, update]));
  return matches.map((match) => {
    const update = updateMap.get(match.id);
    if (!update) return match;
    return {
      ...match,
      homeScore: update.home_score,
      awayScore: update.away_score,
      status: update.status,
      minute: update.minute
    };
  });
}
