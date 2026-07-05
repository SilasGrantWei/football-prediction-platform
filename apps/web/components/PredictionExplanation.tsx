import clsx from "clsx";

import { toChineseDisplay } from "@/lib/chineseDisplay";
import type { Match, PredictionExplanation as PredictionExplanationType } from "@/lib/types";

export function PredictionExplanation({
  explanation,
  match
}: {
  explanation: PredictionExplanationType;
  match: Match;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="mb-4 text-base font-semibold text-ink">为什么这样推算</h2>
      <div className="space-y-5">
        <p className="text-sm leading-6 text-slate-600">{toChineseDisplay(explanation.summary, "暂无中文推算摘要")}</p>

        <div className="grid gap-3 md:grid-cols-2">
          <InfoBlock title="历史交锋/样本权重" text={explanation.h2hSummary} />
          <InfoBlock title="本届状态" text={explanation.recentFormSummary} />
          <InfoBlock title="关键球员/伤停" text={explanation.playerSummary} />
          <InfoBlock title="战术与赛程" text={explanation.tacticalSummary} />
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">多维度对比</h3>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[1.15fr_1fr_1fr] bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
              <span>维度</span>
              <span>主队：{toChineseDisplay(match.homeTeam.name, "主队")}</span>
              <span>客队：{toChineseDisplay(match.awayTeam.name, "客队")}</span>
            </div>
            {explanation.factors.map((factor) => (
              <div
                key={factor.name}
                className="grid grid-cols-[1.15fr_1fr_1fr] gap-2 border-t border-slate-100 px-3 py-3 text-sm"
              >
                <div>
                  <div className="font-semibold text-ink">{toChineseDisplay(factor.name, "对比维度")}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{toChineseDisplay(factor.explanation, "暂无中文解释")}</div>
                </div>
                <MetricValue active={factor.edge === "home"}>{toChineseDisplay(factor.homeValue, "待补中文值")}</MetricValue>
                <MetricValue active={factor.edge === "away"}>{toChineseDisplay(factor.awayValue, "待补中文值")}</MetricValue>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">比分理由</h3>
          <div className="space-y-3">
            {explanation.scoreRationales.map((item) => (
              <div key={item.score} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="score-text text-lg font-bold text-ink">{item.score}</span>
                  <span className="score-text text-sm font-semibold text-field">{formatProbability(item.probability)}</span>
                </div>
                <ul className="space-y-1 text-sm leading-6 text-slate-600">
                  {item.reasons.map((reason) => (
                    <li key={reason}>{toChineseDisplay(reason, "暂无中文原因")}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">数据来源</h3>
          <div className="flex flex-wrap gap-2">
            {explanation.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:text-field"
              >
                {toChineseDisplay(source.label, "数据来源")}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatProbability(value: number): string {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}

function InfoBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-1 text-sm font-semibold text-ink">{title}</div>
      <p className="text-sm leading-6 text-slate-600">{toChineseDisplay(text, "暂无中文说明")}</p>
    </div>
  );
}

function MetricValue({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        "score-text flex min-h-10 items-center rounded-md px-2 py-1 font-semibold",
        active ? "bg-blue-50 text-blue-700" : "text-slate-700"
      )}
    >
      {children}
    </div>
  );
}
