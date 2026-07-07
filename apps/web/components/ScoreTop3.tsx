import { Target } from "lucide-react";

import type { ScorePrediction } from "@/lib/types";

export function ScoreTop3({ scores }: { scores: ScorePrediction[] }) {
  if (!scores.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">暂无比分候选。</div>;
  }

  return (
    <div className="space-y-2">
      {scores.map((score, index) => (
        <div key={`${score.score}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <Target size={15} aria-hidden className="text-field" />
              第{index + 1}候选 {score.score}
            </span>
            <span className="score-text text-sm font-bold text-field">{formatProbability(score.probability)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-field" style={{ width: `${Math.max(normalizedProbability(score.probability) * 100, 3)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function normalizedProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function formatProbability(value: number): string {
  return `${(Math.round(normalizedProbability(value) * 1000) / 10).toFixed(1)}%`;
}
