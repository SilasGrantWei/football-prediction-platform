import clsx from "clsx";

import type { MatchStatus } from "@/lib/types";

const labels: Record<MatchStatus, string> = {
  scheduled: "未开始",
  live: "进行中",
  halftime: "中场",
  finished: "已结束"
};

export function StatusBadge({ status }: { status: MatchStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
        status === "live" && "bg-red-50 text-red-700 ring-1 ring-red-200",
        status === "halftime" && "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
        status === "scheduled" && "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
        status === "finished" && "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      )}
    >
      {labels[status]}
    </span>
  );
}
