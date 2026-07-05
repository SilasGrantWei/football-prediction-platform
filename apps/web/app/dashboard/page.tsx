import { Activity, CalendarClock, CalendarDays, CheckCircle2, History, Radio, Target, Trophy, type LucideIcon } from "lucide-react";

import { DashboardRealtimeRefresh } from "@/components/DashboardRealtimeRefresh";
import { MatchCard } from "@/components/MatchCard";
import { getLiveMatches, getMatches } from "@/lib/api";
import type { Match } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [todayResult, tomorrowResult, liveResult, finishedResult, scheduledResult] = await Promise.all([
    safeLoadMatches(() => getMatches({ period: "today" })),
    safeLoadMatches(() => getMatches({ period: "tomorrow", status: "scheduled" })),
    safeLoadMatches(() => getLiveMatches()),
    safeLoadMatches(() => getMatches({ status: "finished" })),
    safeLoadMatches(() => getMatches({ status: "scheduled" }))
  ]);

  const dashboardLoads = [todayResult, tomorrowResult, liveResult, finishedResult, scheduledResult];
  const apiUnavailable = dashboardLoads.some((result) => result.failed);
  const todayMatches = todayResult.matches;
  const tomorrowMatches = tomorrowResult.matches;
  const liveMatches = liveResult.matches;
  const finishedMatches = finishedResult.matches;
  const scheduledMatches = scheduledResult.matches;
  const knockoutFinishedMatches = finishedMatches.filter(isKnockoutMatch);
  const groupStageMatches = finishedMatches.filter(isGroupStageMatch);
  const upcomingKnockoutMatches = scheduledMatches.filter(isKnockoutMatch).filter(isNotTodayOrTomorrow);
  const predictionConfidence = averageActionablePredictionConfidence([...todayMatches, ...tomorrowMatches, ...liveMatches]);

  return (
    <div className="space-y-7">
      <DashboardRealtimeRefresh />

      <section className="surface-card overflow-hidden rounded-lg">
        <div className="grid gap-6 p-5 lg:grid-cols-[1.1fr_0.9fr] lg:p-7">
          <div className="flex min-w-0 flex-col justify-between gap-6">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-field">
                <Trophy size={14} aria-hidden />
                2026 世界杯实时情报台
              </div>
              <h1 className="max-w-3xl text-3xl font-black tracking-tight text-ink sm:text-4xl">世界杯推算总览</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                聚焦世界杯小组赛与淘汰赛，集中展示实时比分、90 分钟赛果推算、赛后命中复盘和真实数据源状态。
              </p>
            </div>

            {apiUnavailable ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                后端数据服务暂时不可用，页面已进入容错模式。请确认本地数据服务正在运行。
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric icon={Target} label="强信号方向概率" value={formatPercent(predictionConfidence)} tone="blue" />
            <Metric icon={CalendarDays} label="今日" value={todayMatches.length} />
            <Metric icon={CalendarClock} label="明日" value={tomorrowMatches.length} />
            <Metric icon={Radio} label="进行中" value={liveMatches.length} tone="red" />
            <Metric icon={CheckCircle2} label="淘汰赛已结束" value={knockoutFinishedMatches.length} tone="slate" />
            <Metric icon={History} label="小组赛回顾" value={groupStageMatches.length} tone="slate" />
          </div>
        </div>
      </section>

      <MatchSection title="今日世界杯比赛" subtitle="优先展示正在进行和今日开赛的世界杯比赛。" icon={Activity} matches={todayMatches} />
      <MatchSection title="明日世界杯比赛" subtitle="提前查看赛前推算、强队方向和冷门风险。" icon={CalendarClock} matches={tomorrowMatches} />
      <MatchSection title="后续淘汰赛赛程" subtitle="只展示还未进入今日/明日窗口的淘汰赛。" icon={CalendarDays} matches={upcomingKnockoutMatches} />
      <MatchSection title="进行中" subtitle="实时连接和兜底轮询会自动更新比分状态。" icon={Radio} matches={liveMatches} />
      <MatchSection title="2026 淘汰赛已结束" subtitle="结束比赛会显示推算成功或失败，便于赛后复盘。" icon={CheckCircle2} matches={knockoutFinishedMatches} />
      <MatchSection title="本届世界杯小组赛回顾" subtitle="用于赛前状态、近期表现和模型复盘的基础样本。" icon={History} matches={groupStageMatches} />
    </div>
  );
}

async function safeLoadMatches(loader: () => Promise<Match[]>): Promise<{ matches: Match[]; failed: boolean }> {
  try {
    return { matches: await loader(), failed: false };
  } catch (error) {
    console.warn("Dashboard data fetch failed", error);
    return { matches: [], failed: true };
  }
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "field"
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone?: "field" | "blue" | "red" | "slate";
}) {
  const colors = {
    field: "bg-emerald-50 text-field ring-emerald-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    red: "bg-red-50 text-red-600 ring-red-100",
    slate: "bg-slate-100 text-slate-600 ring-slate-200"
  };

  return (
    <div className="rounded-lg border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
      <div className={`mb-3 inline-flex rounded-md p-1.5 ring-1 ${colors[tone]}`}>
        <Icon size={16} aria-hidden />
      </div>
      <div className="score-text text-2xl font-black text-ink">{value}</div>
      <div className="mt-1 text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function MatchSection({
  title,
  subtitle,
  icon: Icon,
  matches
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  matches: Match[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 rounded-md bg-emerald-50 p-1.5 text-field ring-1 ring-emerald-100">
            <Icon size={18} aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-black tracking-tight text-ink">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>
        <span className="score-text rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
          {matches.length} 场
        </span>
      </div>

      {matches.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-7 text-sm font-medium text-slate-500">
          暂无比赛。
        </div>
      )}
    </section>
  );
}

function isKnockoutMatch(match: Match): boolean {
  return match.competition.includes("淘汰赛");
}

function isGroupStageMatch(match: Match): boolean {
  return match.competition.includes("小组赛");
}

function isNotTodayOrTomorrow(match: Match): boolean {
  const target = new Date(match.startTime);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  return target.toDateString() !== today.toDateString() && target.toDateString() !== tomorrow.toDateString();
}

function averageActionablePredictionConfidence(matches: Match[]): number | undefined {
  const probabilities = matches
    .map((match) => match.prediction)
    .filter((prediction): prediction is NonNullable<Match["prediction"]> => Boolean(prediction))
    .map((prediction) => Math.max(prediction.homeWinProb, prediction.drawProb, prediction.awayWinProb));

  if (!probabilities.length) return undefined;
  const actionableProbabilities = probabilities.filter((value) => value >= 0.55);
  const selectedProbabilities = actionableProbabilities.length ? actionableProbabilities : probabilities;
  return selectedProbabilities.reduce((sum, value) => sum + value, 0) / selectedProbabilities.length;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${Math.round(value * 100)}%`;
}
