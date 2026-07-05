"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { AnalyticsOverview } from "@/lib/types";

const statusLabels: Record<string, string> = {
  scheduled: "未开始",
  live: "进行中",
  halftime: "中场",
  finished: "已结束",
  defensive: "防守型",
  balanced: "平衡",
  open: "开放型",
  low: "低",
  medium: "中",
  high: "高"
};

const palette = ["#2563eb", "#1e7a46", "#dc2626", "#f59e0b", "#64748b"];

export function AnalyticsCharts({ overview }: { overview: AnalyticsOverview }) {
  const probabilityData = [
    { name: "主胜", value: Math.round(overview.probabilityAverages.homeWin * 100) },
    { name: "平局", value: Math.round(overview.probabilityAverages.draw * 100) },
    { name: "客胜", value: Math.round(overview.probabilityAverages.awayWin * 100) }
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ChartPanel title="比赛状态">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={overview.statusCounts}>
            <XAxis dataKey="name" tickFormatter={(value) => statusLabels[String(value)] ?? String(value)} />
            <YAxis allowDecimals={false} />
            <Tooltip labelFormatter={(value) => statusLabels[String(value)] ?? String(value)} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="平均胜平负概率">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={probabilityData}>
            <XAxis dataKey="name" />
            <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
            <Tooltip formatter={(value) => [`${value}%`, "概率"]} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#1e7a46" />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="比赛风格">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={overview.styleCounts} dataKey="value" nameKey="name" outerRadius={90} label>
              {overview.styleCounts.map((item, index) => (
                <Cell key={item.name} fill={palette[index % palette.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [value, statusLabels[String(name)] ?? name]} />
          </PieChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="爆冷风险">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={overview.upsetCounts}>
            <XAxis dataKey="name" tickFormatter={(value) => statusLabels[String(value)] ?? String(value)} />
            <YAxis allowDecimals={false} />
            <Tooltip labelFormatter={(value) => statusLabels[String(value)] ?? String(value)} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#dc2626" />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="mb-4 text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
