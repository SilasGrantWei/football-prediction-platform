import type { ReactNode } from "react";
import { CheckCircle2, History, ListChecks, ShieldCheck, Target, XCircle } from "lucide-react";

import type { EnhancedScorePrediction, WorldCupScoreEnhancement } from "@/lib/types";

interface WorldCupScoreEnhancementPanelProps {
  enhancement: WorldCupScoreEnhancement;
}

const bucketLabels: Record<string, string> = {
  group: "小组赛",
  knockout: "淘汰赛",
  balanced: "均势型",
  mid_gap: "中等差距",
  strong_gap: "强弱分明",
  host_involved: "东道主参与",
  no_host: "无东道主"
};

const rejectReasonLabels: Record<string, string> = {
  mass3_below_reject: "前三候选合计概率低于剔除阈值，比分分布过散。",
  scenario_span_eq_reject: "前三候选同时覆盖主胜、平局和客胜，方向不稳定。",
  high_xg_low_p1: "高预期进球场景下第一候选概率不够集中，比分波动风险高。",
  extreme_tail: "前三候选中包含历史低频且奖金偏高的长尾比分。",
  mass3_below_keep: "前三候选集中度不足，暂不建议进入三串一。",
  p1_below_keep: "第一候选比分概率不足，首选信号不够强。",
  entropy_above_keep: "前三候选熵值偏高，候选之间差距不明显。",
  scenario_span_above_keep: "比分方向跨度过大，胜平负路径不够一致。"
};

export function WorldCupScoreEnhancementPanel({ enhancement }: WorldCupScoreEnhancementPanelProps) {
  const bucketLabel = enhancement.histBucket
    .split("|")
    .map((part) => bucketLabels[part] ?? part)
    .join(" / ");

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History size={18} className="text-field" aria-hidden />
            <h2 className="text-base font-semibold text-ink">世界杯历史比分增强</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            这是比分模型的后处理层，只使用90分钟历史比分分布、市场隐含概率和模型原始概率校准候选比分，不替代基础模型。
          </p>
        </div>
        <span
          className={
            enhancement.keep
              ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
              : "rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
          }
        >
          {enhancement.keep ? "建议进入三串一候选" : "不建议进入三串一"}
        </span>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Metric label="历史画像" value={bucketLabel} />
        <Metric label="历史前三集中度" value={formatPercent(enhancement.histTop3Mass)} />
        <Metric label="增强前三集中度" value={formatPercent(enhancement.mass3)} />
        <Metric label="方向跨度" value={`${enhancement.scenarioSpan} 类`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ScoreList icon={<History size={17} aria-hidden />} title="历史 Top3 基线" scores={enhancement.histTop3} tone="slate" />
        <ScoreList icon={<Target size={17} aria-hidden />} title="当前模型 Top3" scores={enhancement.rawTop3} tone="blue" />
        <ScoreList icon={<ShieldCheck size={17} aria-hidden />} title="增强后 Top3" scores={enhancement.adjustedTop3} tone="green" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ListChecks size={16} className="text-field" aria-hidden />
            校准指标
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <span className="rounded-md bg-white px-3 py-2 text-slate-600">熵值 {enhancement.entropy3.toFixed(3)}</span>
            <span className="rounded-md bg-white px-3 py-2 text-slate-600">匹配分 {enhancement.matchScore.toFixed(3)}</span>
            <span className="rounded-md bg-white px-3 py-2 text-slate-600">
              赛后命中 {enhancement.calibratedTop3Hit === null ? "待验证" : enhancement.calibratedTop3Hit ? "命中" : "未命中"}
            </span>
          </div>
        </div>

        <div className={enhancement.rejectReasons.length ? "rounded-lg bg-rose-50 p-4" : "rounded-lg bg-emerald-50 p-4"}>
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            {enhancement.rejectReasons.length ? (
              <XCircle size={16} className="text-rose-600" aria-hidden />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-600" aria-hidden />
            )}
            过滤结论
          </div>
          {enhancement.rejectReasons.length ? (
            <ul className="mt-3 space-y-2 text-sm text-rose-800">
              {enhancement.rejectReasons.map((reason) => (
                <li key={reason} className="rounded-md bg-white/70 px-3 py-2">
                  {rejectReasonLabels[reason] ?? reason}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-sm text-emerald-800">
              通过集中度、熵值、方向跨度和长尾风险过滤。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ScoreList({
  icon,
  title,
  scores,
  tone
}: {
  icon: ReactNode;
  title: string;
  scores: EnhancedScorePrediction[];
  tone: "slate" | "blue" | "green";
}) {
  const toneClass =
    tone === "blue"
      ? "border-blue-100 bg-blue-50/40 text-blue-700"
      : tone === "green"
        ? "border-emerald-100 bg-emerald-50/50 text-emerald-700"
        : "border-slate-100 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="mb-3 flex items-center gap-2 font-semibold text-ink">
        {icon}
        {title}
      </div>
      <div className="space-y-2">
        {scores.length ? (
          scores.map((item, index) => (
            <div key={`${title}-${item.score}`} className="rounded-md bg-white px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3 font-semibold text-ink">
                <span>
                  第{index + 1}候选 {item.score}
                </span>
                <span className="text-field">{formatPercent(item.probability)}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-field" style={{ width: `${Math.min(100, percentageValue(item.probability))}%` }} />
              </div>
              {typeof item.historicalProbability === "number" || typeof item.impliedProbability === "number" ? (
                <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                  {typeof item.historicalProbability === "number" ? <span>历史 {formatPercent(item.historicalProbability)}</span> : null}
                  {typeof item.impliedProbability === "number" ? <span>市场隐含 {formatPercent(item.impliedProbability)}</span> : null}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-md bg-white px-3 py-2 text-sm text-slate-500">暂无可用比分分布。</div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function formatPercent(value: number | undefined) {
  const safe = Number.isFinite(value ?? Number.NaN) ? Number(value) : 0;
  const percent = safe > 1 ? safe : safe * 100;
  return `${percent.toFixed(percent >= 10 ? 1 : 2)}%`;
}

function percentageValue(value: number | undefined) {
  const safe = Number.isFinite(value ?? Number.NaN) ? Number(value) : 0;
  return safe > 1 ? safe : safe * 100;
}
