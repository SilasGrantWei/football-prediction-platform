import clsx from "clsx";
import { CalendarClock, CheckCircle2, ShieldCheck, Target, TrendingUp, XCircle } from "lucide-react";
import Link from "next/link";

import { toChineseDisplay } from "@/lib/chineseDisplay";
import { formatOfficialKickoffTime } from "@/lib/kickoffDisplay";
import type { Match, PredictionEvaluation } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { UpsetBadge } from "./UpsetBadge";

export function MatchCard({ match }: { match: Match }) {
  const strongerTeam = match.homeTeam.fifaRating >= match.awayTeam.fifaRating ? match.homeTeam.name : match.awayTeam.name;
  const evaluation = match.prediction?.evaluation;
  const topScore = match.prediction?.topScores[0];
  const isInPlay = match.status === "live" || match.status === "halftime";
  const leadingProbability = match.prediction
    ? Math.max(match.prediction.homeWinProb, match.prediction.drawProb, match.prediction.awayWinProb)
    : undefined;

  return (
    <Link
      href={`/match/${match.id}`}
      className={clsx(
        "perf-card group block overflow-hidden rounded-xl transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(15,23,42,0.12)]",
        "match-card",
        isInPlay && "match-card-live",
        match.status === "finished" && "match-card-finished",
        match.status === "scheduled" && "match-card-scheduled"
      )}
    >
      <div className="h-1.5 bg-gradient-to-r from-field via-blue-600 to-slate-950" />

      <div className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-black text-slate-500">{toChineseDisplay(match.competition, "世界杯比赛")}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {evaluation ? <PredictionOutcomeBadge evaluation={evaluation} /> : null}
              {!evaluation && topScore ? (
                <span className="score-text inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-200">
                  <Target size={13} aria-hidden />
                  赛前推算 {topScore.score} · {formatProbability(topScore.probability)}
                </span>
              ) : null}
            </div>
          </div>
          <StatusBadge status={match.status} />
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamName role="主队" name={match.homeTeam.name} active={strongerTeam === match.homeTeam.name} align="left" />
          <div className="score-text min-w-[6.5rem] rounded-xl bg-slate-950 px-4 py-3 text-center text-4xl font-black text-white shadow-inner">
            {match.homeScore}-{match.awayScore}
          </div>
          <TeamName role="客队" name={match.awayTeam.name} active={strongerTeam === match.awayTeam.name} align="right" />
        </div>

        <div className="mt-4 grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={15} aria-hidden />
            {isInPlay ? `${match.minute}'` : formatOfficialKickoffTime(match)}
          </span>
          <span className="inline-flex items-center gap-1.5 font-bold text-blue-700 sm:justify-end">
            <ShieldCheck size={15} aria-hidden />
            强队 {toChineseDisplay(strongerTeam, "球队")}
          </span>
        </div>

        {match.prediction ? (
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-black text-slate-700">
                <TrendingUp size={15} className="text-field" aria-hidden />
                {evaluation ? "赛后验证" : "赛前推算胜率"}
              </span>
              <span className="score-text text-sm font-black text-slate-700">
                {evaluation ? `90分钟 ${evaluation.actualScore}` : leadingProbability === undefined ? "-" : formatProbability(leadingProbability)}
              </span>
            </div>

            {evaluation ? (
              <div className="mb-3 space-y-1">
                <div className={clsx("text-sm font-bold", evaluation.status === "success" ? "text-emerald-700" : "text-red-700")}>
                  {evaluation.resultHit ? "方向命中" : "方向失败"} · {evaluation.exactScoreHit ? "比分命中" : "比分未命中"}
                </div>
                {evaluation.status === "failed" ? (
                  <div className="line-clamp-2 text-xs font-semibold leading-5 text-red-600">
                    原因：{failureHeadline(evaluation)}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div key={row.key} className="grid grid-cols-[1.5rem_1fr_2.5rem] items-center gap-2 text-[11px] font-bold text-slate-500">
          <span>{row.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-white">
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
      ? `推算成功 · 第${evaluation.top3Rank ?? 3}候选`
      : `推算失败 · 预测 ${evaluation.predictedScore}`;

  return (
    <span
      className={clsx(
        "score-text inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ring-1",
        success ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
      )}
    >
      {success ? <CheckCircle2 size={13} aria-hidden /> : <XCircle size={13} aria-hidden />}
      {label}
    </span>
  );
}

function failureHeadline(evaluation: PredictionEvaluation): string {
  return (
    evaluation.failureBreakdown?.[0]?.title ??
    evaluation.failureReasons[0]?.split("：")[0] ??
    "比分矩阵未覆盖真实赛果"
  );
}

function TeamName({ role, name, active, align }: { role: "主队" | "客队"; name: string; active: boolean; align: "left" | "right" }) {
  return (
    <div className={align === "right" ? "min-w-0 text-right" : "min-w-0 text-left"}>
      <div className="mb-1 text-[11px] font-black text-slate-400">{role}</div>
      <span className={clsx("block truncate text-lg font-black", active ? "text-blue-700" : "text-ink")}>
        {toChineseDisplay(name, role)}
      </span>
    </div>
  );
}

function formatProbability(value: number): string {
  return `${Math.round(value * 100)}%`;
}
