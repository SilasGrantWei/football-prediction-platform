import {
  Activity,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  History,
  Radio,
  Trophy,
  type LucideIcon
} from "lucide-react";

import { DashboardRealtimeRefresh } from "@/components/DashboardRealtimeRefresh";
import { MatchCard } from "@/components/MatchCard";
import { getLiveMatches, getMatches } from "@/lib/api";
import { isOutsideBeijingTodayAndTomorrow } from "@/lib/matchDisplayPolicy";
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
  const upcomingKnockoutMatches = scheduledMatches
    .filter(isKnockoutMatch)
    .filter((match) => isOutsideBeijingTodayAndTomorrow(match.startTime));
  const predictionConfidence = averageActionablePredictionConfidence([...todayMatches, ...tomorrowMatches, ...liveMatches]);

  return (
    <div className="space-y-7">
      <DashboardRealtimeRefresh />

      <BroadcastDesk
        apiUnavailable={apiUnavailable}
        todayCount={todayMatches.length}
        tomorrowCount={tomorrowMatches.length}
        liveCount={liveMatches.length}
        finishedCount={knockoutFinishedMatches.length}
        confidence={predictionConfidence}
      />

      <MatchSection title="今日世界杯比赛（北京时间）" subtitle="按北京时间今天展示比赛；已结束的今日比赛也保留在这里。" icon={Activity} matches={todayMatches} />
      {liveMatches.length > 0 ? (
        <MatchSection title="进行中" subtitle="实时比分和比赛分钟。" icon={Radio} matches={liveMatches} />
      ) : null}
      <MatchSection title="明日世界杯比赛" subtitle="提前看赛前推算、强弱方向、冷门风险和比分候选。" icon={CalendarClock} matches={tomorrowMatches} />
      <MatchSection title="后续淘汰赛赛程" subtitle="只展示未进入今日或明日窗口的淘汰赛。" icon={CalendarDays} matches={upcomingKnockoutMatches} />
      <MatchSection title="2026 淘汰赛已结束" subtitle="结束比赛会显示推算成功或失败，便于赛后复盘。" icon={CheckCircle2} matches={knockoutFinishedMatches} />
      <MatchSection title="本届世界杯小组赛回顾" subtitle="作为赛前状态、近期表现和模型复盘的基础样本。" icon={History} matches={groupStageMatches} />
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

function BroadcastDesk({
  apiUnavailable,
  todayCount,
  tomorrowCount,
  liveCount,
  finishedCount,
  confidence
}: {
  apiUnavailable: boolean;
  todayCount: number;
  tomorrowCount: number;
  liveCount: number;
  finishedCount: number;
  confidence: number | undefined;
}) {
  const beijingNow = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());

  return (
    <section className="broadcast-surface overflow-hidden rounded-3xl">
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-7">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-field">
            <Trophy size={15} aria-hidden />
            2026 世界杯赛事中心
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-ink sm:text-4xl">今日赛程与比分</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-slate-600">
            <span>{beijingNow} · 北京时间</span>
            <span className="inline-flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${apiUnavailable ? "bg-amber-500" : "bg-emerald-500"}`} aria-hidden />
              {apiUnavailable ? "数据服务异常" : "数据已同步"}
            </span>
            <span>90 分钟口径，不含加时与点球</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <BroadcastMetric label="今日" value={todayCount} />
          <BroadcastMetric label="明日" value={tomorrowCount} />
          <BroadcastMetric label="进行中" value={liveCount} alert={liveCount > 0} />
          <BroadcastMetric label="已结束" value={finishedCount} />
          <BroadcastMetric label="强信号" value={formatPercent(confidence)} accent wide />
        </div>
      </div>
    </section>
  );
}

function BroadcastMetric({
  label,
  value,
  alert = false,
  accent = false,
  wide = false
}: {
  label: string;
  value: string | number;
  alert?: boolean;
  accent?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`${wide ? "col-span-2 sm:col-span-1" : ""} min-w-[6rem] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3`}>
      <div className={`score-text text-2xl font-black ${alert ? "text-red-600" : accent ? "text-blue-700" : "text-ink"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-bold text-slate-500">{label}</div>
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
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-xl bg-emerald-50 p-2 text-field ring-1 ring-emerald-100">
            <Icon size={20} aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-black tracking-tight text-ink sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
          </div>
        </div>
        <span className="score-text rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500 ring-1 ring-slate-200">
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
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-sm font-semibold text-slate-500">
          暂无比赛。
        </div>
      )}
    </section>
  );
}

function isKnockoutMatch(match: Match): boolean {
  return match.competition.includes("淘汰赛") || match.competition.includes("决赛") || match.competition.includes("1/8") || match.competition.includes("1/16");
}

function isGroupStageMatch(match: Match): boolean {
  return match.competition.includes("小组赛");
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
