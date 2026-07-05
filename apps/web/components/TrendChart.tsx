"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendPoint } from "@/lib/types";

export function TrendChart({
  data,
  homeTeam,
  awayTeam
}: {
  data: TrendPoint[];
  homeTeam: string;
  awayTeam: string;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: 0, right: 12, top: 12, bottom: 4 }}>
          <XAxis dataKey="minute" tickFormatter={(value) => `${value}'`} stroke="#64748b" />
          <YAxis domain={[0, 100]} stroke="#64748b" width={34} />
          <Tooltip
            formatter={(value, name) => [`${value}`, name === "homeMomentum" ? homeTeam : awayTeam]}
            labelFormatter={(label) => `第 ${label} 分钟`}
          />
          <Line type="monotone" dataKey="homeMomentum" stroke="#2563eb" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="awayMomentum" stroke="#1e7a46" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

