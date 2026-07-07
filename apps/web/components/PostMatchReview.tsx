import clsx from "clsx";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileText,
  ListChecks,
  Target,
  TrendingUp,
  XCircle
} from "lucide-react";

import type { PredictionEvaluation, PredictionFailureBreakdown } from "@/lib/types";

export function PostMatchReview({ evaluation }: { evaluation: PredictionEvaluation }) {
  const success = evaluation.status === "success";
  const headline = evaluation.exactScoreHit
    ? "推算成功：第一候选命中"
    : evaluation.top3ScoreHit
      ? `推算成功：前三候选第 ${evaluation.top3Rank} 位命中`
      : "推算失败：比分未命中";
  const gaps = evaluation.dataGaps ?? [];
  const summary = evaluation.matchSummary ?? [];
  const breakdown = evaluation.failureBreakdown ?? [];

  return (
    <section
      className={clsx(
        "overflow-hidden rounded-xl border bg-white shadow-panel",
        success ? "border-emerald-200" : "border-red-200"
      )}
    >
      <div
        className={clsx(
          "border-b px-5 py-4",
          success ? "border-emerald-100 bg-emerald-50/70" : "border-red-100 bg-red-50/80"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {success ? (
                <CheckCircle2 size={20} className="text-emerald-600" aria-hidden />
              ) : (
                <XCircle size={20} className="text-red-600" aria-hidden />
              )}
              <h2 className={clsx("text-lg font-semibold", success ? "text-emerald-800" : "text-red-800")}>
                {headline}
              </h2>
            </div>
            <p className="max-w-5xl text-sm leading-6 text-slate-700">{evaluation.conclusion}</p>
          </div>
          <span className="score-text rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
            复盘时间 {formatTime(evaluation.reviewedAt)}
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <ReviewMetric
            title="赛前首选推算"
            value={evaluation.predictedScore}
            detail={`九十分钟 · ${Math.round(evaluation.predictedProbability * 100)}%`}
          />
          <ReviewMetric title="九十分钟比分" value={evaluation.actualScore} detail="含伤停补时" />
          <ReviewMetric
            title="比分命中"
            value={evaluation.top3ScoreHit ? "命中" : "未命中"}
            detail={evaluation.top3Rank ? `前三候选第 ${evaluation.top3Rank} 位` : "不在前三候选"}
          />
          <ReviewMetric title="方向判断" value={evaluation.resultHit ? "命中" : "失败"} detail="九十分钟胜平负" />
        </div>

        {summary.length > 0 ? (
          <ReviewSection icon={<FileText size={17} aria-hidden />} title="整场事实摘要">
            <ul className="space-y-2">
              {summary.map((item) => (
                <li key={item} className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                  {item}
                </li>
              ))}
            </ul>
          </ReviewSection>
        ) : null}

        {breakdown.length > 0 ? (
          <ReviewSection icon={<Target size={17} aria-hidden />} title={success ? "命中复盘" : "核心失败原因"}>
            <div className="grid gap-3 lg:grid-cols-2">
              {breakdown.map((item) => (
                <FailureCard key={`${item.title}-${item.detail}`} item={item} danger={!success} />
              ))}
            </div>
          </ReviewSection>
        ) : null}

        {gaps.length > 0 ? (
          <ReviewSection icon={<Database size={17} aria-hidden />} title="数据缺口">
            <div className="grid gap-2 md:grid-cols-2">
              {gaps.map((gap) => (
                <div key={gap} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                  <AlertTriangle size={15} className="mt-1 shrink-0" aria-hidden />
                  <span>{gap}</span>
                </div>
              ))}
            </div>
          </ReviewSection>
        ) : null}

        <ReviewSection icon={<BrainCircuit size={17} aria-hidden />} title="下一轮模型迭代动作">
          <ul className="grid gap-2 md:grid-cols-2">
            {evaluation.learningActions.map((action) => (
              <li key={action} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-900">
                <span className="mr-2 inline-flex align-middle text-field">
                  <TrendingUp size={14} aria-hidden />
                </span>
                {action}
              </li>
            ))}
          </ul>
        </ReviewSection>
      </div>
    </section>
  );
}

function ReviewSection({
  icon,
  title,
  children
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-field">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function FailureCard({ item, danger }: { item: PredictionFailureBreakdown; danger: boolean }) {
  return (
    <article
      className={clsx(
        "rounded-lg border p-4",
        danger ? "border-red-100 bg-red-50/70" : "border-emerald-100 bg-emerald-50/60"
      )}
    >
      <div className="mb-2 flex items-center gap-2 font-semibold text-ink">
        <ListChecks size={16} className={danger ? "text-red-600" : "text-emerald-600"} aria-hidden />
        {item.title}
      </div>
      <p className={clsx("text-sm leading-6", danger ? "text-red-900" : "text-emerald-900")}>{item.detail}</p>
      {item.evidence.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {item.evidence.map((evidence) => (
            <li key={evidence} className="rounded-md bg-white/75 px-3 py-2 text-sm leading-6 text-slate-700">
              {evidence}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function ReviewMetric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-500">{title}</div>
      <div className="score-text mt-1 text-xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
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
