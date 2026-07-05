import { CheckCircle2, RefreshCw } from "lucide-react";

interface RecalculatePredictionButtonProps {
  matchId: string;
  disabled: boolean;
  disabledReason: string;
  succeeded?: boolean;
}

export function RecalculatePredictionButton({
  matchId,
  disabled,
  disabledReason,
  succeeded = false
}: RecalculatePredictionButtonProps) {
  return (
    <form action={`/match/${matchId}/recalculate`} method="post" className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={disabled}
        title={disabled ? disabledReason : "重新计算本场赛前推算"}
        className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
      >
        {succeeded ? <CheckCircle2 size={14} aria-hidden /> : <RefreshCw size={14} aria-hidden />}
        {succeeded ? "推算成功" : "手动重新推算"}
      </button>
      {disabled ? <div className="max-w-80 text-right text-xs text-slate-500">{disabledReason}</div> : null}
    </form>
  );
}
