import type { Prediction } from "@/lib/types";

const rows = [
  { key: "homeWinProb", label: "主胜", color: "bg-blue-600" },
  { key: "drawProb", label: "平局", color: "bg-slate-500" },
  { key: "awayWinProb", label: "客胜", color: "bg-field" }
] as const;

export function ProbabilityBars({ prediction }: { prediction: Prediction }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const value = prediction[row.key];
        return (
          <div key={row.key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{row.label}</span>
              <span className="score-text font-semibold text-ink">{Math.round(value * 100)}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100">
              <div className={`${row.color} h-2.5 rounded-full`} style={{ width: `${Math.max(value * 100, 3)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

