"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

import { publicApiBaseUrl } from "@/lib/api";
import type { OddsData, Prediction } from "@/lib/types";

type OutcomeKey = "home" | "draw" | "away";

const outcomeRows: Array<{
  key: OutcomeKey;
  label: string;
  oddsKey: "homeOdds" | "drawOdds" | "awayOdds";
  modelKey: "homeWinProb" | "drawProb" | "awayWinProb";
}> = [
  { key: "home", label: "主胜", oddsKey: "homeOdds", modelKey: "homeWinProb" },
  { key: "draw", label: "平局", oddsKey: "drawOdds", modelKey: "drawProb" },
  { key: "away", label: "客胜", oddsKey: "awayOdds", modelKey: "awayWinProb" }
];

export function OddsComparisonPanel({ matchId, prediction }: { matchId: string; prediction?: Prediction }) {
  const [odds, setOdds] = useState<OddsData | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      const response = await fetch(`${publicApiBaseUrl()}/api/odds/${matchId}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { data: OddsData };
      if (!disposed) setOdds(payload.data);
    };
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [matchId]);

  const rows = useMemo(() => {
    if (!odds) return [];
    return outcomeRows.map((row) => {
      const marketProbability = odds.marketProbabilities[row.key];
      const modelProbability = prediction?.[row.modelKey] ?? null;
      const value = modelProbability === null ? null : modelProbability - marketProbability;
      return {
        ...row,
        odds: odds[row.oddsKey],
        marketProbability,
        modelProbability,
        value
      };
    });
  }, [odds, prediction]);

  const bestValue = rows
    .filter((row) => row.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];

  if (!odds) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-panel">
        暂无赔率数据。启动实时数据服务或配置赔率接口密钥后，系统会自动同步市场赔率。
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">智能模型与赔率市场对比</h2>
          <p className="mt-1 text-sm text-slate-500">用模型概率减去市场隐含概率，判断哪一侧可能被低估。</p>
        </div>
        {bestValue ? (
          <div
            className={clsx(
              "rounded-full px-3 py-1 text-sm font-semibold",
              (bestValue?.value ?? 0) > 0.03 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
            )}
          >
            最高价值：{bestValue?.label} {formatSignedPercent(bestValue?.value ?? 0)}
          </div>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-[0.9fr_0.9fr_1fr_1fr_1fr] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
          <span>结果</span>
          <span>赔率</span>
          <span>市场概率</span>
          <span>模型概率</span>
          <span>价值差</span>
        </div>
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[0.9fr_0.9fr_1fr_1fr_1fr] items-center border-t border-slate-100 px-3 py-3 text-sm">
            <span className="font-semibold text-ink">{row.label}</span>
            <span className="score-text font-bold text-ink">{row.odds.toFixed(2)}</span>
            <span>{formatPercent(row.marketProbability)}</span>
            <span>{row.modelProbability === null ? "暂无" : formatPercent(row.modelProbability)}</span>
            <span className={clsx("font-semibold", (row.value ?? 0) > 0 ? "text-emerald-700" : "text-rose-700")}>
              {row.value === null ? "暂无" : formatSignedPercent(row.value)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 text-xs text-slate-500">更新时间 {new Date(odds.timestamp).toLocaleString("zh-CN")}</div>
    </section>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 1000) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}
