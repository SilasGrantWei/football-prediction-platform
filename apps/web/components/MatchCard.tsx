import clsx from "clsx";
import { CheckCircle2, Target, XCircle } from "lucide-react";
import Link from "next/link";

import { toChineseDisplay } from "@/lib/chineseDisplay";
import { formatOfficialKickoffTime } from "@/lib/kickoffDisplay";
import { formatFullMatchOutcome, getFullMatchScorePresentation } from "@/lib/fullMatchScorePresentation";
import { getMatchCardPresentation } from "@/lib/matchCardPresentation";
import type { Match, PredictionEvaluation } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { UpsetBadge } from "./UpsetBadge";

export function MatchCard({ match }: { match: Match }) {
  const strongerTeam = match.homeTeam.fifaRating >= match.awayTeam.fifaRating ? match.homeTeam.name : match.awayTeam.name;
  const evaluation = match.prediction?.evaluation;
  const topScore = match.prediction?.topScores[0];
  const isInPlay = match.status === "live" || match.status === "halftime";
  const presentation = getMatchCardPresentation({
    status: match.status,
    kickoffLabel: formatOfficialKickoffTime(match),
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    minute: match.minute
  });
  const fullMatchScore = getFullMatchScorePresentation(match);

  return (
    <Link
      href={`/match/${match.id}`}
      className={clsx(
        "broadcast-surface perf-card group relative block overflow-hidden rounded-2xl transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(10,26,43,0.13)]",
        "match-card",
        isInPlay && "match-card-live"
      )}
    >
      <span className={`absolute inset-y-0 left-0 w-1 status-rail-${presentation.tone}`} aria-hidden />

      <div className="p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex min-h-8 items-start justify-between gap-3">
          <div className="min-w-0 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
            {toChineseDisplay(match.competition, "世界杯比赛")}
          </div>
          <StatusBadge status={match.status} />
        </div>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7.25rem_minmax(0,1fr)] sm:gap-3">
          <TeamName role="主队" name={match.homeTeam.name} active={strongerTeam === match.homeTeam.name} align="left" />
          <div className="broadcast-scoreboard rounded-2xl px-2 py-3 text-center text-white sm:px-3">
            <div
              className={
                presentation.showRealScore
                  ? "score-text text-5xl font-black tracking-[-0.06em]"
                  : "score-text text-2xl font-black"
              }
            >
              {presentation.primary}
            </div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">
              {presentation.secondary}
            </div>
          </div>
          <TeamName role="客队" name={match.awayTeam.name} active={strongerTeam === match.awayTeam.name} align="right" />
        </div>

        {fullMatchScore ? (
          <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs font-black text-emerald-900">
            <span>整场比分</span>
            <span className="score-text text-sm text-slate-950">{fullMatchScore.score}</span>
            <span className="text-emerald-700">· {formatFullMatchOutcome(fullMatchScore)}</span>
          </div>
        ) : null}

        {topScore && !evaluation ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-2 font-black text-blue-800">
              <Target size={15} aria-hidden />
              首选比分 {topScore.score}
            </span>
            <span className="score-text font-black text-blue-700">{formatProbability(topScore.probability)}</span>
          </div>
        ) : null}

        {evaluation ? (
          <div
            className={clsx(
              "mt-4 rounded-xl border px-3 py-2.5",
              evaluation.status === "success" ? "border-emerald-200 bg-emerald-50/80" : "border-red-200 bg-red-50/80"
            )}
          >
            <PredictionOutcomeBadge evaluation={evaluation} />
            {evaluation.status === "failed" ? (
              <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-red-700">
                主要原因：{failureHeadline(evaluation)}
              </p>
            ) : null}
          </div>
        ) : null}

        {match.prediction ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <ProbabilityStrip match={match} />
            <UpsetBadge risk={match.prediction.upsetRisk} />
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
          <span className="h-2 overflow-hidden rounded-full bg-slate-200/80">
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
      <div className="mb-1 text-[11px] font-black text-slate-500">{role}</div>
      <span className={clsx("block min-h-12 break-words text-lg font-black leading-6", active ? "text-blue-700" : "text-ink")}>
        {toChineseDisplay(name, role)}
      </span>
    </div>
  );
}

function formatProbability(value: number): string {
  return `${Math.round(value * 100)}%`;
}
