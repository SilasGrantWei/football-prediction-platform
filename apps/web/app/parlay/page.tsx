import { AlertTriangle, CheckCircle2, FilterX, Rows3, ShieldAlert, Target } from "lucide-react";
import Link from "next/link";

import { getMatches } from "@/lib/api";
import { toChineseDisplay } from "@/lib/chineseDisplay";
import type { EnhancedScorePrediction, Match, ScorePrediction } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LoadResult {
  matches: Match[];
  error: string | null;
}

type CandidateSource = "historical_enhanced" | "base_model";

interface Candidate {
  match: Match;
  topScores: EnhancedScorePrediction[];
  p3: number;
  top1Probability: number;
  positiveEdgeMean: number;
  archetype: string;
  riskLevel: "低" | "中" | "高";
  source: CandidateSource;
  rejectReasons: string[];
}

interface Combo {
  items: Candidate[];
  score: number;
  rho: number;
  positiveEdgeMean: number;
  probabilityEstimate: number;
}

const MAX_CANDIDATES_FOR_COMBOS = 12;

const reasonLabels: Record<string, string> = {
  low_mass3: "前三比分覆盖率不足",
  mass3_below_reject: "前三比分覆盖率低于剔除线",
  mass3_below_keep: "前三比分覆盖率低于保留线",
  high_entropy: "前三候选过于分散",
  entropy_above_keep: "前三候选过于分散",
  wide_scenario_span: "比分场景跨度过大",
  scenario_span_eq_reject: "比分场景跨度达到剔除线",
  extreme_tail: "包含历史长尾比分",
  high_xg_low_p1: "高进球场但第一候选不够集中",
  bonus_tail_risk: "奖金长尾风险过高"
};

export default async function ParlayPage() {
  const result = await safeLoadMatches();
  const eligibleMatches = result.matches.filter(isParlayEligibleMatch);
  const strictCandidates = eligibleMatches
    .map(toHistoricalCandidate)
    .filter((candidate): candidate is Candidate => Boolean(candidate))
    .sort(compareCandidate);
  const baseCandidates = eligibleMatches
    .map(toBaseCandidate)
    .filter((candidate): candidate is Candidate => Boolean(candidate))
    .sort(compareCandidate);
  const candidates = fillCandidatePool(strictCandidates, baseCandidates).slice(0, MAX_CANDIDATES_FOR_COMBOS);
  const combos = buildCombos(candidates).slice(0, 8);
  const rejected = eligibleMatches
    .filter((match) => match.prediction?.scoreEnhancement && !candidates.some((candidate) => candidate.match.id === match.id))
    .slice(0, 12);

  const enhancedCount = candidates.filter((candidate) => candidate.source === "historical_enhanced").length;
  const baseCount = candidates.filter((candidate) => candidate.source === "base_model").length;

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-slate-200/80 bg-white p-7 shadow-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-field ring-1 ring-emerald-200">
              <Rows3 size={16} aria-hidden />
              三串一组合中心
            </span>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-ink">三串一候选排序</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              只使用赛前模型输出，不使用实时比分反推。优先采用世界杯历史画像增强结果；增强候选不足三场时，用基础赛前 Top3 补足组合池并明确标注来源。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MetricCard label="可用候选" value={candidates.length} />
            <MetricCard label="组合数量" value={combos.length} />
            <MetricCard label="历史增强" value={enhancedCount} />
            <MetricCard label="基础补足" value={baseCount} />
            <MetricCard label="数据口径" value="90分钟" />
          </div>
        </div>

        {result.error ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            后端数据服务未连接，无法生成三串一组合。请先启动本地服务后刷新：<code>npm run start:local</code>
          </div>
        ) : null}

        {!result.error && strictCandidates.length < 3 && candidates.length >= 3 ? (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            历史画像增强候选当前只有 {strictCandidates.length} 场，不足三串一最低要求；页面已使用基础赛前比分候选补足，补足项会标记为“基础补足”，不会伪装成增强器通过。
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-ink">推荐组合</h2>
            <p className="mt-1 text-sm text-slate-500">优先展示通过历史画像过滤的比赛；候选不足时显示基础补足原因。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-600">{combos.length} 组</span>
        </div>

        {combos.length > 0 ? (
          <div className="grid gap-4">
            {combos.map((combo, index) => (
              <ComboCard key={combo.items.map((item) => item.match.id).join("-")} combo={combo} rank={index + 1} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="当前不足三场可进入三串一的比赛"
            description={
              result.error
                ? "后端未返回比赛数据，先启动本地 API 服务。"
                : "当前赛前候选少于三场，或所有比赛缺少赛前比分 Top3，暂时不能生成三串一组合。"
            }
          />
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-ink">单场候选</h2>
              <p className="mt-1 text-sm text-slate-500">每场保留赛前前三比分；组合页不使用开赛后的实时比分重新排序。</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-field ring-1 ring-emerald-200">
              {candidates.length} 场
            </span>
          </div>

          {candidates.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {candidates.map((candidate) => (
                <CandidateCard key={candidate.match.id} candidate={candidate} />
              ))}
            </div>
          ) : (
            <EmptyState title="暂无可用候选" description="当前没有赛前比赛带有可用比分候选，先检查本地 API 数据或等待赛程更新。" />
          )}
        </div>

        <aside className="space-y-4">
          <div>
            <h2 className="text-2xl font-black text-ink">剔除原因</h2>
            <p className="mt-1 text-sm text-slate-500">这些比赛没有进入组合池，但仍可在详情页查看单场推算。</p>
          </div>
          {rejected.length > 0 ? (
            <div className="space-y-3">
              {rejected.map((match) => (
                <RejectedCard key={match.id} match={match} />
              ))}
            </div>
          ) : (
            <EmptyState title="暂无剔除样本" description="当前没有返回增强器剔除理由的比赛。" compact />
          )}
        </aside>
      </section>
    </div>
  );
}

async function safeLoadMatches(): Promise<LoadResult> {
  try {
    return { matches: await getMatches({ status: "scheduled" }), error: null };
  } catch (error) {
    return { matches: [], error: error instanceof Error ? error.message : "数据读取失败" };
  }
}

function isParlayEligibleMatch(match: Match): boolean {
  return match.status === "scheduled" && Boolean(match.prediction?.topScores?.length);
}

function toHistoricalCandidate(match: Match): Candidate | null {
  const enhancement = match.prediction?.scoreEnhancement;
  if (!enhancement?.keep) return null;

  const topScores = enhancement.adjustedTop3.length > 0 ? enhancement.adjustedTop3 : enhancement.rawTop3;
  if (topScores.length < 3) return null;

  const positiveEdgeMean = averagePositiveEdge(topScores);
  return {
    match,
    topScores: topScores.slice(0, 3),
    p3: clampProbability(enhancement.mass3),
    top1Probability: clampProbability(topScores[0]?.probability ?? 0),
    positiveEdgeMean,
    archetype: enhancement.histBucket || match.prediction?.gameStyle || "未分类",
    riskLevel: enhancement.mass3 >= 0.5 && enhancement.scenarioSpan <= 1 ? "低" : enhancement.mass3 >= 0.44 ? "中" : "高",
    source: "historical_enhanced",
    rejectReasons: []
  };
}

function toBaseCandidate(match: Match): Candidate | null {
  const topScores = match.prediction?.topScores ?? [];
  if (topScores.length < 3) return null;

  const normalizedScores = normalizeScorePredictions(topScores.slice(0, 3));
  const p3 = normalizedScores.reduce((sum, item) => sum + item.probability, 0);
  const topProbability = normalizedScores[0]?.probability ?? 0;
  const enhancement = match.prediction?.scoreEnhancement;

  return {
    match,
    topScores: normalizedScores,
    p3: clampProbability(p3),
    top1Probability: clampProbability(normalizedScores[0]?.probability ?? 0),
    positiveEdgeMean: 0,
    archetype: enhancement?.histBucket || match.prediction?.gameStyle || "基础模型",
    riskLevel: p3 >= 0.36 && topProbability >= 0.11 ? "中" : "高",
    source: "base_model",
    rejectReasons:
      enhancement?.rejectReasons && enhancement.rejectReasons.length > 0
        ? enhancement.rejectReasons
        : ["增强候选不足，使用基础赛前比分补足"]
  };
}

function fillCandidatePool(strictCandidates: Candidate[], baseCandidates: Candidate[]): Candidate[] {
  const candidates = [...strictCandidates];
  const seenIds = new Set(candidates.map((candidate) => candidate.match.id));

  for (const candidate of baseCandidates) {
    if (candidates.length >= Math.max(3, MAX_CANDIDATES_FOR_COMBOS)) break;
    if (seenIds.has(candidate.match.id)) continue;
    candidates.push(candidate);
    seenIds.add(candidate.match.id);
  }

  return candidates.sort(compareCandidate);
}

function compareCandidate(a: Candidate, b: Candidate): number {
  if (a.source !== b.source) return a.source === "historical_enhanced" ? -1 : 1;
  return b.p3 - a.p3;
}

function normalizeScorePredictions(scores: ScorePrediction[]): EnhancedScorePrediction[] {
  return scores.map((score) => ({
    score: score.score,
    probability: clampProbability(score.probability),
    modelProbability: score.probability
  }));
}

function buildCombos(candidates: Candidate[]): Combo[] {
  const combos: Combo[] = [];
  const pool = candidates.slice(0, MAX_CANDIDATES_FOR_COMBOS);

  for (let first = 0; first < pool.length; first += 1) {
    for (let second = first + 1; second < pool.length; second += 1) {
      for (let third = second + 1; third < pool.length; third += 1) {
        const items = [pool[first], pool[second], pool[third]];
        const rho = calculateCorrelationPenalty(items);
        const positiveEdgeMean = items.reduce((sum, item) => sum + item.positiveEdgeMean, 0) / items.length;
        const probabilityEstimate = items.reduce((product, item) => product * item.top1Probability, 1);
        const score = probabilityEstimate * (1 - rho);
        combos.push({ items, score, rho, positiveEdgeMean, probabilityEstimate });
      }
    }
  }

  return combos.sort((a, b) => b.score - a.score);
}

function calculateCorrelationPenalty(items: Candidate[]): number {
  let rho = 0;

  if (hasDuplicate(items.map((item) => scoreFamily(item.topScores[0]?.score ?? "0-0")))) rho += 0.05;
  if (hasDuplicate(items.map((item) => goalBand(item.topScores[0]?.score ?? "0-0")))) rho += 0.05;
  if (hasDuplicate(items.map((item) => eloBucket(item.match)))) rho += 0.03;

  return Math.min(rho, 0.3);
}

function scoreFamily(score: string): "home" | "draw" | "away" {
  const [home, away] = parseScore(score);
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function goalBand(score: string): "low" | "medium" | "high" {
  const [home, away] = parseScore(score);
  const total = home + away;
  if (total <= 1) return "low";
  if (total <= 3) return "medium";
  return "high";
}

function eloBucket(match: Match): "balanced" | "mid_gap" | "strong_gap" {
  const diff = Math.abs(match.homeTeam.fifaRating - match.awayTeam.fifaRating) * 6.3;
  if (diff <= 60) return "balanced";
  if (diff < 150) return "mid_gap";
  return "strong_gap";
}

function parseScore(score: string): [number, number] {
  const [home = 0, away = 0] = score
    .replace(":", "-")
    .split("-")
    .map((item) => Number.parseInt(item, 10));
  return [Number.isFinite(home) ? home : 0, Number.isFinite(away) ? away : 0];
}

function hasDuplicate(values: string[]): boolean {
  return new Set(values).size < values.length;
}

function ComboCard({ combo, rank }: { combo: Combo; rank: number }) {
  return (
    <article className="rounded-lg border border-slate-200/80 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-lg font-black text-white">
            {rank}
          </span>
          <div>
            <h3 className="text-lg font-black text-ink">推荐组合 {rank}</h3>
            <p className="text-sm text-slate-500">已扣除相关性风险，基础补足项会额外降权。</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniMetric label="组合估计" value={formatProbability(combo.probabilityEstimate)} />
          <MiniMetric label="风险扣分" value={formatProbability(combo.rho)} />
          <MiniMetric label="排序分" value={formatProbability(combo.score)} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {combo.items.map((item) => (
          <CandidateMiniCard key={item.match.id} candidate={item} />
        ))}
      </div>
    </article>
  );
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const { match } = candidate;
  return (
    <Link
      href={`/match/${match.id}`}
      className="block rounded-lg border border-slate-200/80 bg-white p-5 shadow-panel transition hover:border-field/40 hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-slate-500">{toChineseDisplay(match.competition, "世界杯比赛")}</div>
          <h3 className="mt-1 truncate text-xl font-black text-ink">
            {toChineseDisplay(match.homeTeam.name, "主队")} 对 {toChineseDisplay(match.awayTeam.name, "客队")}
          </h3>
        </div>
        <span
          className={
            candidate.source === "historical_enhanced"
              ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-field ring-1 ring-emerald-200"
              : "rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-200"
          }
        >
          {candidate.source === "historical_enhanced" ? "历史增强" : "基础补足"}
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {candidate.topScores.slice(0, 3).map((score, index) => (
          <ScoreRow key={`${match.id}-${score.score}`} score={score} rank={index + 1} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniMetric label="前三覆盖" value={formatProbability(candidate.p3)} />
        <MiniMetric label="历史画像" value={bucketLabel(candidate.archetype)} />
        <MiniMetric label="风险" value={candidate.riskLevel} />
      </div>

      {candidate.source === "base_model" ? (
        <div className="mt-3 rounded-lg bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">
          增强器未给出三场以上可用候选时，使用基础赛前 Top3 补足；该项排序已降权。
        </div>
      ) : null}
    </Link>
  );
}

function CandidateMiniCard({ candidate }: { candidate: Candidate }) {
  const { match } = candidate;
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs font-bold text-slate-500">{toChineseDisplay(match.competition, "世界杯比赛")}</div>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">
          {candidate.source === "historical_enhanced" ? "增强" : "补足"}
        </span>
      </div>
      <div className="mt-1 text-base font-black text-ink">
        {toChineseDisplay(match.homeTeam.name, "主队")} 对 {toChineseDisplay(match.awayTeam.name, "客队")}
      </div>
      <div className="mt-3 space-y-2">
        {candidate.topScores.slice(0, 3).map((score, index) => (
          <ScoreRow key={`${match.id}-${score.score}`} score={score} rank={index + 1} compact />
        ))}
      </div>
    </div>
  );
}

function RejectedCard({ match }: { match: Match }) {
  const enhancement = match.prediction?.scoreEnhancement;
  const reasons = enhancement?.rejectReasons ?? [];

  return (
    <Link href={`/match/${match.id}`} className="block rounded-lg border border-red-100 bg-red-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-red-500">{toChineseDisplay(match.competition, "世界杯比赛")}</div>
          <div className="mt-1 truncate text-base font-black text-ink">
            {toChineseDisplay(match.homeTeam.name, "主队")} 对 {toChineseDisplay(match.awayTeam.name, "客队")}
          </div>
        </div>
        <FilterX className="shrink-0 text-red-500" size={18} aria-hidden />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(reasons.length > 0 ? reasons : ["过滤条件未通过"]).map((reason) => (
          <span key={reason} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-red-700 ring-1 ring-red-100">
            {reasonLabels[reason] ?? toChineseDisplay(reason, "过滤原因")}
          </span>
        ))}
      </div>
    </Link>
  );
}

function ScoreRow({ score, rank, compact = false }: { score: EnhancedScorePrediction; rank: number; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 font-black text-ink">
          <Target size={16} className="text-field" aria-hidden />
          第{rank}候选 {score.score}
        </span>
        <span className="score-text font-black text-field">{formatProbability(score.probability)}</span>
      </div>
      {!compact ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-field" style={{ width: `${Math.min(score.probability * 100, 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-2xl font-black text-ink">{value}</div>
      <div className="mt-1 text-sm font-semibold text-slate-500">{label}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-100 px-3 py-2">
      <div className="text-sm font-black text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] font-semibold text-slate-500">{label}</div>
    </div>
  );
}

function EmptyState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return (
    <div className={compact ? "rounded-lg border border-dashed border-slate-300 bg-white p-5" : "rounded-lg border border-dashed border-slate-300 bg-white p-8"}>
      <div className="flex items-start gap-3">
        {title.includes("不足") ? (
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={20} aria-hidden />
        ) : title.includes("暂无") ? (
          <ShieldAlert className="mt-0.5 shrink-0 text-slate-400" size={20} aria-hidden />
        ) : (
          <CheckCircle2 className="mt-0.5 shrink-0 text-field" size={20} aria-hidden />
        )}
        <div>
          <h3 className="font-black text-ink">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
    </div>
  );
}

function averagePositiveEdge(topScores: EnhancedScorePrediction[]): number {
  const positiveEdges = topScores
    .map((score) => score.edge ?? 0)
    .filter((edge) => Number.isFinite(edge) && edge > 0);
  return positiveEdges.length > 0 ? positiveEdges.reduce((sum, edge) => sum + edge, 0) / positiveEdges.length : 0;
}

function bucketLabel(value: string): string {
  return toChineseDisplay(value.replace(/_/g, "-"), "历史画像");
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0.01;
  return Math.min(0.95, Math.max(0.01, value));
}
