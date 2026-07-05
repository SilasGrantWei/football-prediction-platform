import { AlertTriangle, Gauge, Medal, TrendingUp } from "lucide-react";

import { getBacktest, getWorldCupSimulation } from "@/lib/api";
import type { BacktestResult, SimulationTeamProbability, WorldCupSimulation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SimulationPage() {
  const [simulation, backtest] = await Promise.all([
    safeLoad(() => getWorldCupSimulation(10_000)),
    safeLoad(() => getBacktest())
  ]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink">世界杯模拟中心</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            基于实时赛程、等级分模型、泊松比分模型、赔率市场和当前模型概率运行蒙特卡洛模拟，用来评估冠军、四强、黑马和爆冷风险。
          </p>
        </div>
        <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
          10,000 次模拟 · 实时数据驱动
        </div>
      </section>

      {!simulation ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-800">
          模拟服务未连接。请先启动本地实时网关服务。
        </section>
      ) : (
        <>
          <MetricGrid simulation={simulation} backtest={backtest} />

          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <ProbabilityPanel
              title="冠军概率"
              subtitle="模拟最终夺冠次数占比"
              teams={simulation.champion_probability.slice(0, 10)}
              accent="bg-blue-600"
            />
            <ProbabilityPanel
              title="四强概率"
              subtitle="进入半决赛或决赛路径的累计概率"
              teams={simulation.semifinal_probability.slice(0, 10)}
              accent="bg-emerald-600"
            />
          </section>

          <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <ProbabilityPanel
              title="黑马概率"
              subtitle="综合实力评分低于 80 的球队夺冠概率"
              teams={simulation.dark_horse_probability.slice(0, 8)}
              accent="bg-rose-600"
              emptyText="当前模拟中没有明显黑马进入夺冠高概率区间。"
            />
            <BacktestPanel backtest={backtest} />
          </section>
        </>
      )}
    </div>
  );
}

function MetricGrid({ simulation, backtest }: { simulation: WorldCupSimulation; backtest: BacktestResult | null }) {
  const roi = normalizeRoi(backtest);
  const metrics = [
    { label: "模拟次数", value: simulation.iterations.toLocaleString("zh-CN"), icon: Gauge },
    { label: "平均爆冷概率", value: formatPercent(simulation.upset_probability), icon: AlertTriangle },
    { label: "回测对数损失", value: formatNullable(backtest?.log_loss), icon: TrendingUp },
    { label: "价值策略收益率", value: roi === null ? "暂无" : formatPercent(roi), icon: Medal }
  ];

  return (
    <section className="grid gap-4 md:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-field">
              <Icon size={18} aria-hidden />
            </div>
            <div className="score-text text-3xl font-bold text-ink">{metric.value}</div>
            <div className="mt-1 text-sm text-slate-500">{metric.label}</div>
          </div>
        );
      })}
    </section>
  );
}

function ProbabilityPanel({
  title,
  subtitle,
  teams,
  accent,
  emptyText = "暂无模拟结果。"
}: {
  title: string;
  subtitle: string;
  teams: SimulationTeamProbability[];
  accent: string;
  emptyText?: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {teams.length === 0 ? (
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{emptyText}</div>
      ) : (
        <div className="space-y-3">
          {teams.map((team, index) => (
            <div key={`${title}-${team.team}`} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="mr-2 text-slate-400">#{index + 1}</span>
                  <span className="font-semibold text-ink">{team.team}</span>
                  <span className="ml-2 text-xs text-slate-500">实力 {Math.round(team.team_rating)}</span>
                </div>
                <span className="score-text font-bold text-ink">{formatPercent(team.probability)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div className={`${accent} h-2.5 rounded-full`} style={{ width: `${Math.max(team.probability * 100, 2)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BacktestPanel({ backtest }: { backtest: BacktestResult | null }) {
  if (!backtest) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-panel">
        暂无回测结果。等待已结束比赛入库后，系统会自动计算推算质量。
      </section>
    );
  }

  const roi = normalizeRoi(backtest);
  const profit = typeof backtest.roi === "object" ? backtest.roi.profit_units : null;
  const bets = typeof backtest.roi === "object" ? backtest.roi.bets : null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="text-base font-semibold text-ink">历史回测与模型迭代</h2>
      <p className="mt-1 text-sm text-slate-500">用已结束比赛检查概率校准、比分方向和价值策略表现。</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <BacktestMetric label="回测比赛" value={backtest.matches.toString()} />
        <BacktestMetric label="布赖尔分数" value={formatNullable(backtest.brier_score)} />
        <BacktestMetric label="对数损失" value={formatNullable(backtest.log_loss)} />
        <BacktestMetric label="价值策略收益率" value={roi === null ? "暂无" : formatPercent(roi)} />
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        {bets === null
          ? "当前回测未返回价值投注明细。"
          : `价值信号触发 ${bets} 次，累计盈亏 ${profit?.toFixed(2)} 单位。失败样本会继续进入特征复盘，用于后续训练迭代。`}
      </div>
    </section>
  );
}

function BacktestMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="score-text mt-1 text-xl font-bold text-ink">{value}</div>
    </div>
  );
}

async function safeLoad<T>(loader: () => Promise<T>): Promise<T | null> {
  try {
    return await loader();
  } catch {
    return null;
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatNullable(value: number | null | undefined): string {
  return value === null || value === undefined ? "暂无" : value.toFixed(4);
}

function normalizeRoi(backtest: BacktestResult | null): number | null {
  if (!backtest) return null;
  return typeof backtest.roi === "number" ? backtest.roi : backtest.roi.roi;
}
