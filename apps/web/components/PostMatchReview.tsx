import clsx from "clsx";
import { BrainCircuit, CheckCircle2, Target, TrendingUp, XCircle } from "lucide-react";

import type { PredictionEvaluation } from "@/lib/types";

export function PostMatchReview({ evaluation }: { evaluation: PredictionEvaluation }) {
  const success = evaluation.status === "success";
  const headline = evaluation.exactScoreHit
    ? "推算成功：第一候选命中"
    : evaluation.top3ScoreHit
      ? `推算成功：前三候选第 ${evaluation.top3Rank} 位命中`
      : "推算失败：比分未命中";

  return (
    <section
      className={clsx(
        "rounded-lg border bg-white p-5 shadow-panel",
        success ? "border-emerald-200" : "border-red-200"
      )}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {success ? (
            <CheckCircle2 size={19} className="text-emerald-600" aria-hidden />
          ) : (
            <XCircle size={19} className="text-red-600" aria-hidden />
          )}
          <h2 className={clsx("text-base font-semibold", success ? "text-emerald-700" : "text-red-700")}>{headline}</h2>
        </div>
        <span className="score-text rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          复盘时间 {formatTime(evaluation.reviewedAt)}
        </span>
      </div>

      <p className="text-sm leading-6 text-slate-600">{evaluation.conclusion}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <ReviewMetric title="赛前首选推算" value={evaluation.predictedScore} detail={`90分钟 · ${Math.round(evaluation.predictedProbability * 100)}%`} />
        <ReviewMetric title="90分钟比分" value={evaluation.actualScore} detail="含伤停补时" />
        <ReviewMetric
          title="比分命中"
          value={evaluation.top3ScoreHit ? "命中" : "未命中"}
         detail={evaluation.top3Rank ? `前三候选第 ${evaluation.top3Rank} 位` : "不在前三候选"}
        />
        <ReviewMetric title="方向判断" value={evaluation.resultHit ? "命中" : "失败"} detail="90分钟胜 / 平 / 负" />
      </div>

      {!success && evaluation.failureReasons.length ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <Target size={16} className="text-red-600" aria-hidden />
            为什么失败
          </div>
          <ul className="space-y-2 text-sm leading-6 text-slate-600">
            {evaluation.failureReasons.map((reason) => (
              <li key={reason} className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <BrainCircuit size={16} className="text-field" aria-hidden />
          模型进化动作
        </div>
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
      </div>
    </section>
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
