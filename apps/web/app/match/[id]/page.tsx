import { Activity, AlertTriangle, CheckCircle2, Gauge, ShieldCheck } from "lucide-react";

import { BackendRetryPanel } from "@/components/BackendRetryPanel";
import { EventTimeline } from "@/components/EventTimeline";
import { MatchRealtimeRefresh } from "@/components/MatchRealtimeRefresh";
import { OddsComparisonPanel } from "@/components/OddsComparisonPanel";
import { ProbabilityBars } from "@/components/ProbabilityBars";
import { PostMatchReview } from "@/components/PostMatchReview";
import { PredictionExplanation } from "@/components/PredictionExplanation";
import { ProjectedLineupPanel } from "@/components/ProjectedLineupPanel";
import { RecalculatePredictionButton } from "@/components/RecalculatePredictionButton";
import { ScoreTop3 } from "@/components/ScoreTop3";
import { StatusBadge } from "@/components/StatusBadge";
import { TeamRecordsPanel } from "@/components/TeamRecordsPanel";
import { TrendChart } from "@/components/TrendChart";
import { UpsetBadge } from "@/components/UpsetBadge";
import { WorldCupScoreEnhancementPanel } from "@/components/WorldCupScoreEnhancementPanel";
import { toChineseDisplay } from "@/lib/chineseDisplay";
import { formatOfficialKickoffTime } from "@/lib/kickoffDisplay";
import { formatFullMatchOutcome, getFullMatchScorePresentation } from "@/lib/fullMatchScorePresentation";
import { getRecalculateState } from "@/lib/predictionRecalculation";
import { getMatch, getMatchEvents, getMatchLineupValidation, getMatchTeamRecords, getMatchTrend } from "@/lib/serverApi";

export const dynamic = "force-dynamic";

const styleLabels = {
  defensive: "防守型",
  balanced: "平衡型",
  open: "开放型"
};

type MatchSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MatchDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: MatchSearchParams;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const manualPredictionNotice = buildManualPredictionNotice(query);
  const match = await getMatch(id).catch((error: unknown) => {
    console.error("Failed to load match detail", { id, error });
    return undefined;
  });

  if (!match) {
    return <BackendUnavailable matchId={id} />;
  }

  const [events, trend, teamRecords, lineupValidation] = await Promise.all([
    getMatchEvents(id).catch(() => []),
    getMatchTrend(id).catch(() => []),
    getMatchTeamRecords(id).catch(() => undefined),
    getMatchLineupValidation(id).catch(() => undefined)
  ]);
  const prediction = match.prediction;
  const strongerTeam = match.homeTeam.fifaRating >= match.awayTeam.fifaRating ? match.homeTeam.name : match.awayTeam.name;
  const recalculateState = getRecalculateState(match);
  const fullMatchScore = getFullMatchScorePresentation(match);

  return (
    <div className="space-y-6">
      <MatchRealtimeRefresh />
      {manualPredictionNotice ? <ManualPredictionNoticeBanner notice={manualPredictionNotice} /> : null}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">{match.competition}</div>
            <h1 className="mt-1 text-2xl font-bold text-ink">
              {toChineseDisplay(match.homeTeam.name, "主队")} 对 {toChineseDisplay(match.awayTeam.name, "客队")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={match.status} />
            {prediction ? <UpsetBadge risk={prediction.upsetRisk} /> : null}
            <RecalculatePredictionButton
              matchId={match.id}
              disabled={!recalculateState.allowed}
              disabledReason={recalculateState.reason}
              succeeded={manualPredictionNotice?.status === "success"}
            />
          </div>
        </div>

        <div className="grid items-center gap-5 md:grid-cols-[1fr_auto_1fr]">
          <TeamBlock role="主队" name={match.homeTeam.name} rating={match.homeTeam.fifaRating} active={strongerTeam === match.homeTeam.name} />
          <div className="text-center">
            <div className="score-text rounded-lg bg-slate-950 px-8 py-5 text-6xl font-black text-white">
              {match.homeScore}-{match.awayScore}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {matchClockLabel(match)}
            </div>
            {fullMatchScore ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900 shadow-sm">
                整场比分 <span className="score-text text-base font-black text-slate-950">{fullMatchScore.score}</span>
                <span className="text-emerald-700"> · {formatFullMatchOutcome(fullMatchScore)}</span>
              </div>
            ) : null}
          </div>
          <TeamBlock
            role="客队"
            name={match.awayTeam.name}
            rating={match.awayTeam.fifaRating}
            active={strongerTeam === match.awayTeam.name}
            align="right"
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">比赛事件时间线</h2>
            <p className="mt-1 text-sm text-slate-500">显示真实数据源返回的进球、点球、犯规、越位、黄红牌、角球、射门和换人时间。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {events.length ? `${events.length} 条事件` : eventEmptyLabel(match.status)}
          </span>
        </div>
        <EventTimeline events={events} matchStatus={match.status} />
      </section>

      {prediction ? (
        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-4 flex items-center gap-2">
              <Gauge size={18} className="text-field" aria-hidden />
              <h2 className="text-base font-semibold text-ink">90分钟方向推算</h2>
            </div>
            <ProbabilityBars prediction={prediction} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-4 flex items-center gap-2">
              <Activity size={18} className="text-field" aria-hidden />
              <h2 className="text-base font-semibold text-ink">90分钟比分推算</h2>
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-slate-600">九十分钟最可能比分前三</div>
                <ScoreTop3 scores={prediction.topScores} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">比赛风格</div>
                  <div className="mt-1 font-semibold text-ink">{styleLabels[prediction.gameStyle]}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-500">预期进球</div>
                  <div className="score-text mt-1 font-semibold text-ink">
                    {prediction.expectedHomeGoals} : {prediction.expectedAwayGoals}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {prediction?.scoreEnhancement ? <WorldCupScoreEnhancementPanel enhancement={prediction.scoreEnhancement} /> : null}

      {prediction ? <OddsComparisonPanel matchId={match.id} prediction={prediction} /> : null}

      {prediction?.lineupProjection ? <ProjectedLineupPanel projection={prediction.lineupProjection} validation={lineupValidation} /> : null}

      {prediction?.evaluation ? <PostMatchReview evaluation={prediction.evaluation} /> : null}

      {teamRecords ? (
        <TeamRecordsPanel records={teamRecords} />
      ) : (
        <SectionUnavailable title="赛前战绩暂时无法加载" text="后端数据服务恢复后，这里会自动显示两队同年赛前战绩对比。" />
      )}

      {prediction?.explanation ? <PredictionExplanation explanation={prediction.explanation} match={match} /> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <h2 className="mb-4 text-base font-semibold text-ink">比赛走势</h2>
        <TrendChart data={trend} homeTeam={match.homeTeam.name} awayTeam={match.awayTeam.name} />
      </section>
    </div>
  );
}

interface ManualPredictionNotice {
  status: "success" | "error";
  title: string;
  detail: string;
}

function buildManualPredictionNotice(searchParams: Record<string, string | string[] | undefined>): ManualPredictionNotice | null {
  const state = firstSearchValue(searchParams.manualPrediction);

  if (state === "success") {
    const score = firstSearchValue(searchParams.score);
    const probability = firstSearchValue(searchParams.probability);
    const detail = score
      ? `新的赛前推算已生成，首选比分 ${score}${probability ? `，概率 ${probability}%` : ""}。`
      : "新的赛前推算已生成，页面已刷新。";

    return {
      status: "success",
      title: "手动重新推算成功",
      detail
    };
  }

  if (state === "error") {
    return {
      status: "error",
      title: "手动重新推算失败",
      detail: firstSearchValue(searchParams.message) ?? "请稍后再试，或先同步赛程和比分数据。"
    };
  }

  return null;
}

function ManualPredictionNoticeBanner({ notice }: { notice: ManualPredictionNotice }) {
  const isSuccess = notice.status === "success";

  return (
    <section
      className={
        isSuccess
          ? "rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-panel"
          : "rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 shadow-panel"
      }
    >
      <div className="flex items-start gap-2">
        {isSuccess ? <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden /> : <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden />}
        <div>
          <h2 className="text-sm font-semibold">{notice.title}</h2>
          <p className="mt-1 text-sm leading-6">{toChineseDisplay(notice.detail, notice.detail)}</p>
        </div>
      </div>
    </section>
  );
}

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function BackendUnavailable({ matchId }: { matchId: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-panel">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={20} aria-hidden />
        <h1 className="text-lg font-semibold">后端数据服务暂时不可用</h1>
      </div>
      <p className="text-sm leading-6">
        当前无法读取比赛 {matchId} 的实时数据。页面会自动检测本地 API，服务恢复后会重新加载比赛详情。
      </p>
      <div className="mt-4 rounded-md bg-white/70 px-3 py-2 text-sm text-amber-950">本地启动命令：npm run start:local</div>
      <BackendRetryPanel matchId={matchId} />
    </section>
  );
}

function SectionUnavailable({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 text-slate-600 shadow-panel">
      <h2 className="mb-2 text-base font-semibold text-ink">{title}</h2>
      <p className="text-sm leading-6">{text}</p>
    </section>
  );
}

function TeamBlock({
  role,
  name,
  rating,
  active,
  align = "left"
}: {
  role: "主队" | "客队";
  name: string;
  rating: number;
  active: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="mb-1 text-xs font-semibold text-slate-400">{role}</div>
      <div className={active ? "text-xl font-bold text-blue-700" : "text-xl font-bold text-ink"}>{toChineseDisplay(name, role)}</div>
      <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
        <ShieldCheck size={15} aria-hidden />
        国际足联评分 {rating}
      </div>
    </div>
  );
}

function formatTime(value: string): string {
  return formatOfficialKickoffTime(value);
}

function matchClockLabel(match: Awaited<ReturnType<typeof getMatch>>): string {
  if (match.status === "live") return `${match.minute}' · 实时分钟`;
  if (match.status === "halftime") return `中场 · ${match.minute}'`;
  if (match.status === "finished") return `${formatTime(match.startTime)} · 已结束 · 90分钟比分`;
  return `${formatTime(match.startTime)} · 未开始`;
}

function eventEmptyLabel(status: Awaited<ReturnType<typeof getMatch>>["status"]): string {
  if (status === "finished") return "缺少真实事件时间";
  if (status === "scheduled") return "未开赛";
  return "等待真实事件";
}
