import clsx from "clsx";
import { CalendarClock, CheckCircle2, ShieldCheck, Target, TrendingUp, XCircle } from "lucide-react";
import Link from "next/link";

import { toChineseDisplay } from "@/lib/chineseDisplay";
import type { Match, PredictionEvaluation } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { UpsetBadge } from "./UpsetBadge";

export function MatchCard({ match }: { match: Match }) {
  const strongerTeam = match.homeTeam.fifaRating >= match.awayTeam.fifaRating ? match.homeTeam.name : match.awayTeam.name;
  const evaluation = match.prediction?.evaluation;
  const topScore = match.prediction?.topScores[0];
  const isInPlay = match.status === "live" || match.status === "halftime";
  const predictionLabel = isInPlay ? "赛前冻结推算" : "赛前推算";
  const leadingProbability = match.prediction
    ? Math.max(match.prediction.homeWinProb, match.prediction.drawProb, match.prediction.awayWinProb)
    : undefined;

  return (
    <Link
      href={`/match/${match.id}`}
      className="group block overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-panel transition duration-200 hover:-translate-y-0.5 hover:border-field/40 hover:shadow-[0_20px_46px_rgba(15,23,42,0.12)]"
    >
      <div className="h-1 bg-gradient-to-r from-field via-blue-600 to-slate-950" />

      <div className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-slate-500">{toChineseDisplay(match.competition, "世界杯比赛")}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {evaluation ? <PredictionOutcomeBadge evaluation={evaluation} /> : null}
              {!evaluation && topScore ? (
                <span className="score-text inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200">
                  <Target size={13} aria-hidden />
                  {predictionLabel} {topScore.score} · {formatProbability(topScore.probability)}
                </span>
              ) : null}
            </div>
          </div>
          <StatusBadge status={match.status} />
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamName role="主队" name={match.homeTeam.name} active={strongerTeam === match.homeTeam.name} align="left" />
          <div className="score-text min-w-[6.25rem] rounded-lg bg-slate-950 px-4 py-3 text-center text-4xl font-black text-white shadow-inner">
            {match.homeScore}-{match.awayScore}
          </div>
          <TeamName role="客队" name={match.awayTeam.name} active={strongerTeam === match.awayTeam.name} align="right" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={15} aria-hidden />
            {match.status === "live" || match.status === "halftime" ? `${match.minute}'` : formatTime(match.startTime)}
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-blue-700">
            <ShieldCheck size={15} aria-hidden />
            强队 {toChineseDisplay(strongerTeam, "球队")}
          </span>
        </div>

        {match.prediction ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            {evaluation ? (
              <div className={clsx("text-sm font-semibold", evaluation.status === "success" ? "text-emerald-700" : "text-red-700")}>
                90分钟 {evaluation.actualScore} / {evaluation.resultHit ? "方向命中" : "方向失败"}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                  <TrendingUp size={15} className="text-field" aria-hidden />
                  {predictionLabel}方向概率 {leadingProbability === undefined ? "-" : formatProbability(leadingProbability)}
                </span>
                <span className="text-slate-500">主胜 {formatProbability(match.prediction.homeWinProb)}</span>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <ProbabilityStrip match={match} />
              <UpsetBadge risk={match.prediction.upsetRisk} />
            </div>
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function ProbabilityStrip({ match }: { match: Match }) {
  const prediction = match.prediction;
  if (!prediction) return null;

  const rows = [
    { key: "home", label: "主", value: prediction.homeWinProb, color: "bg-blue-600" },
    { key: "draw", label: "平", value: prediction.drawProb, color: "bg-slate-500" },
    { key: "away", label: "客", value: prediction.awayWinProb, color: "bg-field" }
  ];

  return (
    <div className="grid min-w-[13rem] flex-1 gap-1.5">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[1.5rem_1fr_2.5rem] items-center gap-2 text-[11px] font-semibold text-slate-500">
          <span>{row.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <span className={clsx("block h-full rounded-full", row.color)} style={{ width: `${Math.round(row.value * 100)}%` }} />
          </span>
          <span className="score-text text-right text-slate-700">{formatProbability(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PredictionOutcomeBadge({ evaluation }: { evaluation: PredictionEvaluation }) {
  const success = evaluation.status === "success";
  const label = evaluation.exactScoreHit
    ? "推算成功 · 第一候选"
    : evaluation.top3ScoreHit
      ? `推算成功 · 第${evaluation.top3Rank}候选`
      : `推算失败 · 首选 ${evaluation.predictedScore}`;

  return (
    <span
      className={clsx(
        "score-text inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1",
        success ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
      )}
    >
      {success ? <CheckCircle2 size={13} aria-hidden /> : <XCircle size={13} aria-hidden />}
      {label}
    </span>
  );
}

function TeamName({ role, name, active, align }: { role: "主队" | "客队"; name: string; active: boolean; align: "left" | "right" }) {
  return (
    <div className={align === "right" ? "min-w-0 text-right" : "min-w-0 text-left"}>
      <div className="mb-1 text-[11px] font-bold text-slate-400">{role}</div>
      <span className={clsx("block truncate text-lg font-black", active ? "text-blue-700" : "text-ink")}>
        {toChineseDisplay(name, role)}
      </span>
    </div>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatProbability(value: number): string {
  return `${Math.round(value * 100)}%`;
}
