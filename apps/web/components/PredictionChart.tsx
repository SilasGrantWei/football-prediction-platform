"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PredictionChart({
  probabilities
}: {
  probabilities: { home: number; draw: number; away: number };
}) {
  const data = [
    { name: "主胜", value: Math.round(probabilities.home * 100) },
    { name: "平局", value: Math.round(probabilities.draw * 100) },
    { name: "客胜", value: Math.round(probabilities.away * 100) }
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <XAxis dataKey="name" />
        <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
        <Tooltip formatter={(value) => [`${value}%`, "概率"]} />
        <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
