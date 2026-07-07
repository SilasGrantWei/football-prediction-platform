import clsx from "clsx";

import type { UpsetRisk } from "@/lib/types";

const labels: Record<UpsetRisk, string> = {
  low: "冷门低",
  medium: "冷门中",
  high: "冷门高"
};

export function UpsetBadge({ risk }: { risk: UpsetRisk }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
        risk === "high" && "bg-red-600 text-white",
        risk === "medium" && "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
        risk === "low" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      )}
    >
      {labels[risk]}
    </span>
  );
}
