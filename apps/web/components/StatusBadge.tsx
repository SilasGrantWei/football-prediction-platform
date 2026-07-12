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
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-black ring-1 ring-inset",
        status === "live" && "bg-red-50 text-red-700 ring-red-200",
        status === "halftime" && "bg-amber-50 text-amber-700 ring-amber-200",
        status === "scheduled" && "bg-blue-50 text-blue-700 ring-blue-200",
        status === "finished" && "bg-emerald-50 text-emerald-700 ring-emerald-200"
      )}
    >
      <span className={clsx("mr-1.5 h-1.5 w-1.5 rounded-full bg-current", status === "live" && "animate-pulse")} aria-hidden />
      {labels[status]}
    </span>
  );
}
