import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Database,
  ListChecks,
  ShieldCheck,
  Target,
  XCircle,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import { UpsetBadge } from "@/components/UpsetBadge";
import { getAnalyticsOverview } from "@/lib/api";
import { toChineseDisplay } from "@/lib/chineseDisplay";
import type { ModelQualityGate } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const overview = await getAnalyticsOverview();
  const evaluation = overview.evaluationSummary;
  const review = overview.failureReview;
  const qualityGate = overview.qualityGate;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">模型统计</h1>
          <p className="mt-1 text-sm text-slate-500">
            只用开赛前已冻结的推算快照做回测，赛后结果只能用于复盘和未来权重建议，不能回填修改已结束推算。
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-panel">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Database size={16} aria-hidden />
            样本比赛
          </div>
          <div className="score-text mt-1 text-2xl font-bold text-ink">{overview.totalMatches}</div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <ModelMetric
          icon={Target}
          label="第一候选比分命中"
          value={formatPercent(evaluation.top1HitRate)}
          detail={`${evaluation.top1Hits}/${evaluation.finishedCount} 场因果样本`}
          tone="blue"
        />
        <ModelMetric
          icon={CheckCircle2}
          label="前三候选比分命中"
          value={formatPercent(evaluation.top3HitRate)}
          detail={`${evaluation.top3Hits}/${evaluation.finishedCount} 场因果样本`}
          tone="green"
        />
        <ModelMetric
          icon={BarChart3}
          label="胜平负方向命中"
          value={formatPercent(evaluation.resultHitRate)}
          detail={`${evaluation.resultHits}/${evaluation.finishedCount} 场因果样本`}
          tone="slate"
        />
        <ModelMetric
          icon={XCircle}
          label="需要复盘失败"
          value={String(evaluation.failures)}
          detail={`已拦截未来函数 ${evaluation.leakageBlockedCount ?? 0} 场`}
          tone="red"
        />
      </section>

      <QualityGatePanel qualityGate={qualityGate} />

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          <div className="mb-3 flex items-center gap-2">
            <BrainCircuit size={18} className="text-blue-600" aria-hidden />
            <h2 className="text-base font-semibold text-ink">当前使用的推算模型</h2>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-lg font-bold text-ink">{toChineseDisplay(overview.modelInfo.name, "当前推算模型")}</div>
              <div className="mt-1 text-sm text-slate-500">版本：{toChineseDisplay(overview.modelInfo.version, "当前模型版本")}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-semibold text-ink">{toChineseDisplay(overview.modelInfo.type, "融合推算模型")}</div>
              <p className="mt-1 leading-6">{toChineseDisplay(overview.modelInfo.description, "当前模型说明未返回中文版本。")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {overview.modelInfo.dimensions.map((dimension) => (
                <span key={dimension} className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {toChineseDisplay(dimension, "模型维度")}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks size={18} className="text-emerald-600" aria-hidden />
            <h2 className="text-base font-semibold text-ink">推算失败复盘总结</h2>
          </div>
          <p className="text-sm leading-6 text-slate-600">{toChineseDisplay(review.summary, "暂无复盘总结。")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-red-50 p-3">
              <div className="score-text text-2xl font-bold text-red-700">{review.directionFailures}</div>
              <div className="mt-1 text-xs font-semibold text-red-700">胜平负方向错误</div>
            </div>
            <div className="rounded-md bg-amber-50 p-3">
              <div className="score-text text-2xl font-bold text-amber-700">{review.scoreOnlyFailures}</div>
              <div className="mt-1 text-xs font-semibold text-amber-700">方向命中但比分偏差</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ReviewPanel title="主要失败原因" icon={AlertTriangle}>
          {review.topReasons.length ? (
            <div className="space-y-3">
              {review.topReasons.map((item) => (
                <div key={item.reason} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="text-sm leading-6 text-slate-700">{toChineseDisplay(item.reason, "复盘原因未返回中文版本。")}</div>
                  <div className="mt-1 text-xs font-semibold text-red-600">出现 {item.count} 次</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyText>暂无失败原因样本。</EmptyText>
          )}
        </ReviewPanel>

        <ReviewPanel title="下一轮模型迭代动作" icon={ListChecks}>
          {review.recommendedActions.length ? (
            <div className="space-y-3">
              {review.recommendedActions.map((action) => (
                <div key={action} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                  {toChineseDisplay(action, "迭代动作未返回中文版本。")}
                </div>
              ))}
            </div>
          ) : (
            <EmptyText>暂无调参动作。</EmptyText>
          )}
        </ReviewPanel>
      </section>

      {review.failedMatches.length ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          <div className="mb-4 flex items-center gap-2">
            <XCircle size={18} className="text-red-600" aria-hidden />
            <h2 className="text-base font-semibold text-ink">失败样本明细</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {review.failedMatches.map((match) => (
              <Link key={match.id} href={`/match/${match.id}`} className="block py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink">{toChineseDisplay(match.title, "比赛")}</div>
                    <div className="mt-1 text-sm text-slate-500">{toChineseDisplay(match.competition, "世界杯比赛")}</div>
                  </div>
                  <div className="score-text rounded-md bg-slate-950 px-3 py-1 text-lg font-bold text-white">
                    推算 {match.predictedScore} / 实际 {match.actualScore}
                  </div>
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-600">{toChineseDisplay(match.primaryReason, "失败原因未返回中文版本。")}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <AnalyticsCharts overview={overview} />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-600" aria-hidden />
          <h2 className="text-base font-semibold text-ink">爆冷关注列表</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {overview.topUpsets.map((item) => (
            <Link key={item.id} href={`/match/${item.id}`} className="flex items-center justify-between gap-4 py-3">
              <div>
                <div className="font-semibold text-ink">{toChineseDisplay(item.title, "比赛")}</div>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <BarChart3 size={14} aria-hidden />
                  {toChineseDisplay(item.competition, "世界杯比赛")} · 强队 {toChineseDisplay(item.strongerTeam, "球队")}
                </div>
              </div>
              <UpsetBadge risk={item.upsetRisk} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function QualityGatePanel({ qualityGate }: { qualityGate: ModelQualityGate }) {
  const statusCopy = {
    pass: { label: "通过", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    fail: { label: "未通过", tone: "border-red-200 bg-red-50 text-red-800" },
    insufficient_data: { label: "样本不足", tone: "border-amber-200 bg-amber-50 text-amber-800" }
  }[qualityGate.status];

  return (
    <section className={`rounded-lg border p-5 shadow-panel ${statusCopy.tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} aria-hidden />
            <h2 className="text-base font-semibold">无未来函数质量门槛</h2>
          </div>
          <p className="mt-2 text-sm leading-6">{toChineseDisplay(qualityGate.summary, "质量门槛摘要未返回中文版本。")}</p>
        </div>
        <span className="rounded-full bg-white/75 px-3 py-1 text-sm font-bold">{statusCopy.label}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <GateMetric label="因果样本" value={qualityGate.sampleCount.toString()} />
        <GateMetric label="基础基线" value={formatNullablePercent(qualityGate.baselineAccuracy)} />
        <GateMetric label="模型方向" value={formatNullablePercent(qualityGate.resultAccuracy)} />
        <GateMetric label="布赖尔分数" value={formatNullableNumber(qualityGate.averageBrierScore)} />
        <GateMetric label="对数损失" value={formatNullableNumber(qualityGate.averageLogLoss)} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md bg-white/70 p-3">
          <div className="text-sm font-semibold">未纳入评估的数据</div>
          <div className="mt-2 text-sm leading-6">
            无赛前快照 {qualityGate.excludedNoCausalSnapshot} 场；拦截未来函数 {qualityGate.leakageBlockedCount} 场；
            加时/点球样本 {qualityGate.excludedExtraTimeOrPenalty} 场。
          </div>
        </div>
        <div className="rounded-md bg-white/70 p-3">
          <div className="text-sm font-semibold">下一步动作</div>
          <div className="mt-2 space-y-1 text-sm leading-6">
            {(qualityGate.gateFailures.length ? qualityGate.gateFailures : qualityGate.learningActions.slice(0, 2)).map((item) => (
              <div key={item}>{toChineseDisplay(item, "质量动作未返回中文版本。")}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/75 p-3">
      <div className="text-xs opacity-75">{label}</div>
      <div className="score-text mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function ReviewPanel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} className="text-blue-600" aria-hidden />
        <h2 className="text-base font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{children}</div>;
}

function ModelMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "red" | "slate";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700"
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
      <div className={`mb-3 inline-flex rounded-md p-2 ${tones[tone]}`}>
        <Icon size={17} aria-hidden />
      </div>
      <div className="score-text text-2xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-600">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatNullablePercent(value: number | null): string {
  return value === null ? "暂无" : formatPercent(value);
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "暂无" : value.toFixed(4);
}
