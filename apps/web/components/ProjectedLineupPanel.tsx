import clsx from "clsx";
import { CheckCircle2, Clock3, ShieldAlert, Sparkles, Star, UsersRound, XCircle } from "lucide-react";

import { toChineseDisplay } from "@/lib/chineseDisplay";
import { LineupValidationRefreshControl } from "./LineupValidationRefreshControl";
import type {
  LineupPlayerValidation,
  MatchLineupProjection,
  MatchLineupValidation,
  ProjectedPlayer,
  TeamLineupValidation,
  TeamLineupProjection
} from "@/lib/types";

export function ProjectedLineupPanel({
  projection,
  validation
}: {
  projection: MatchLineupProjection;
  validation?: MatchLineupValidation;
}) {
  const hasRealLineup = Boolean(validation && (hasDisplayableActualLineup(validation.home) || hasDisplayableActualLineup(validation.away)));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <UsersRound size={20} className="mt-1 text-field" aria-hidden />
          <div>
            <h2 className="text-base font-semibold text-ink">首发推算与真实校验</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              真实首发接入后优先展示真实名单；推算名单只用于赛前建模和赛后命中校验。
            </p>
          </div>
        </div>
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold",
            hasRealLineup ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          )}
        >
          {hasRealLineup ? <CheckCircle2 size={15} aria-hidden /> : <ShieldAlert size={15} aria-hidden />}
          {hasRealLineup ? "已接入真实首发" : "未拿到真实首发"}
        </span>
      </div>

      <div
        className={clsx(
          "mb-5 rounded-lg border px-4 py-3 text-sm leading-6",
          hasRealLineup ? "border-emerald-100 bg-emerald-50 text-emerald-900" : "border-amber-100 bg-amber-50 text-amber-900"
        )}
      >
        {hasRealLineup
          ? `已接入真实首发来源：${toChineseDisplay(validation?.sourceLabel ?? "真实数据源", "真实数据源")}。下面先展示真实首发，再展示模型推算名单和逐人命中结果。`
          : "系统会按公开赛事数据源、接口足球数据源、体育数据源的优先级尝试接入真实首发；未返回真实首发阵容前，只能显示模型推算首发，不能把推算名单当作真值。"}
      </div>

      {validation ? <LineupValidationSummary validation={validation} /> : null}
      <LineupValidationRefreshControl matchId={projection.matchId} initialValidation={validation} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TeamProjectionCard team={projection.home} validation={validation?.home} />
        <TeamProjectionCard team={projection.away} validation={validation?.away} />
      </div>
    </section>
  );
}

function LineupValidationSummary({ validation }: { validation: MatchLineupValidation }) {
  const rawVerified = validation.status === "verified" || validation.status === "partial";
  const hasDisplayableLineup = hasDisplayableActualLineup(validation.home) || hasDisplayableActualLineup(validation.away);
  const verified = rawVerified && hasDisplayableLineup;
  const missingDisplayNames = rawVerified && !hasDisplayableLineup;
  const unavailable = validation.status === "unavailable" || missingDisplayNames;
  const Icon = verified ? CheckCircle2 : unavailable ? ShieldAlert : Clock3;

  return (
    <div
      className={clsx(
        "mb-5 rounded-lg border px-4 py-3",
        verified ? "border-emerald-200 bg-emerald-50" : unavailable ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-ink">
          <Icon size={17} className={verified ? "text-emerald-700" : unavailable ? "text-red-700" : "text-amber-700"} aria-hidden />
          推算人员校验
        </div>
        <span
          className={clsx(
            "rounded-full px-3 py-1 text-sm font-semibold",
            verified ? "bg-white text-emerald-700" : unavailable ? "bg-white text-red-700" : "bg-white text-amber-700"
          )}
        >
          {validation.overallHitRate === null
            ? unavailable
              ? "缺真实首发"
              : "待真实首发"
            : missingDisplayNames
              ? "中文名缺失"
            : `整体命中 ${formatPercent(validation.overallHitRate)}`}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-700">
        {missingDisplayNames
          ? "真实阵容返回了结构，但缺少可显示的中文球员姓名；本页已隐藏占位名单，不用占位名单计算命中率。"
          : toChineseDisplay(validation.summary, "暂无中文验证摘要")}
      </p>
      <div className="mt-2 text-xs leading-5 text-slate-500">
        来源：{toChineseDisplay(validation.sourceLabel, "数据来源")}
        {validation.verifiedAt ? ` · 验证时间 ${formatTime(validation.verifiedAt)}` : ""}
      </div>
      {validation.learningActions.length ? (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {validation.learningActions.map((action) => (
            <li key={action} className="rounded-lg bg-white/80 px-3 py-2 text-sm leading-6 text-slate-700">
              {toChineseDisplay(action, "暂无中文校准动作")}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TeamProjectionCard({ team, validation }: { team: TeamLineupProjection; validation?: TeamLineupValidation }) {
  const validationByName = new Map(validation?.playerResults.map((result) => [result.name, result]) ?? []);
  const actualStarters = displayableActualNames(validation?.actualStarters);
  const actualSubstitutes = displayableActualNames(validation?.actualSubstitutes);
  const hasActualLineup = isValidatedStatus(validation?.status) && actualStarters.length >= 11;
  const rejectedActualDisplay = isValidatedStatus(validation?.status) && !hasActualLineup && Boolean(validation?.actualStarters.length);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-ink">{toChineseDisplay(team.teamName, "球队")}</h3>
          <div className="mt-1 text-sm text-slate-500">
            阵型 {team.formation} · 置信度 {confidenceLabel(team.confidence)}
          </div>
          {validation ? (
          <div className="mt-1 text-xs text-slate-500">
              验证：{validation.hitRate === null ? validationStatusLabel(validation.status) : `${validation.matchedStarterCount}/${validation.predictedStarterCount} 命中`}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-600">
            {toChineseDisplay(team.sourceLabel, "数据来源")}
          </span>
          {team.calibration ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              赛后校准 · {formatTime(team.calibration.effectiveFrom)} 生效
            </span>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
        <ImpactMetric label="进攻影响" value={team.attackImpact} />
        <ImpactMetric label="创造影响" value={team.creationImpact} />
        <ImpactMetric label="防守影响" value={team.defensiveImpact} />
      </div>

      <p className="mb-4 text-sm leading-6 text-slate-600">{toChineseDisplay(team.summary, "暂无中文阵容摘要")}</p>

      {team.calibration ? (
        <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800">
          校准样本：{team.calibration.learningMatchId}。{toChineseDisplay(team.calibration.reason, "暂无中文校准原因")}
        </div>
      ) : null}

      {hasActualLineup && validation ? (
        <ActualLineupBlock validation={validation} actualStarters={actualStarters} actualSubstitutes={actualSubstitutes} />
      ) : rejectedActualDisplay ? (
        <div className="mb-4 rounded-lg border border-dashed border-amber-200 bg-white p-4 text-sm leading-6 text-amber-700">
          数据源返回了阵容结构，但球员中文名不完整；本页不会显示“未知球员”占位名单，也不会用占位名单验证模型。
        </div>
      ) : validation?.status === "unavailable" ? (
        <div className="mb-4 rounded-lg border border-dashed border-red-200 bg-white p-4 text-sm leading-6 text-red-700">
          没有真实首发返回：{toChineseDisplay(validation.sourceLabel, "数据来源")}。本场不会用推算名单自己验证自己。
        </div>
      ) : null}

      {team.starters.length ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Sparkles size={16} className="text-field" aria-hidden />
            推算首发 11 人（用于校验）
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {team.starters.map((player) => (
              <PlayerRow
                key={`${team.teamId}-${player.name}`}
                player={player}
                validation={validationByName.get(player.name)}
                teamValidationStatus={validation?.status}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-500">
          暂无可验证球员池，阵容特征不会参与本场推算校准。
        </div>
      )}

      {team.keySubstitutes.length ? (
        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold text-ink">关键替补/变招</div>
          <div className="flex flex-wrap gap-2">
            {team.keySubstitutes.map((player) => (
              <span
                key={`${team.teamId}-sub-${player.name}`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                {toChineseDisplay(player.name, "待补中文球员")} · {formatPercent(player.startProbability)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {validation?.reasons.length ? (
        <div className="mt-4 space-y-2">
          {validation.reasons.map((reason) => (
            <div key={reason} className="rounded-lg bg-white px-3 py-2 text-sm leading-6 text-slate-600">
              {toChineseDisplay(reason, "暂无中文原因")}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActualLineupBlock({
  validation,
  actualStarters,
  actualSubstitutes
}: {
  validation: TeamLineupValidation;
  actualStarters: string[];
  actualSubstitutes: string[];
}) {
  return (
    <div className="mb-4 rounded-lg border border-emerald-100 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <CheckCircle2 size={16} className="text-emerald-700" aria-hidden />
          真实首发 {actualStarters.length} 人
        </div>
        {validation.hitRate !== null ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            推算命中 {validation.matchedStarterCount}/{validation.predictedStarterCount}
          </span>
        ) : null}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {actualStarters.map((player) => (
          <div key={`${validation.teamId}-actual-${player}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-ink">
            {player}
          </div>
        ))}
      </div>
      {actualSubstitutes.length ? (
        <div className="mt-3">
          <div className="mb-2 text-xs font-semibold text-slate-500">真实替补/登场</div>
          <div className="flex flex-wrap gap-2">
            {actualSubstitutes.map((player) => (
              <span key={`${validation.teamId}-sub-${player}`} className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600">
                {player}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlayerRow({
  player,
  validation,
  teamValidationStatus
}: {
  player: ProjectedPlayer;
  validation?: LineupPlayerValidation;
  teamValidationStatus?: TeamLineupValidation["status"];
}) {
  const isStar = player.starRating >= 86 || player.goalImpact >= 0.07 || player.assistImpact >= 0.07;
  const badge = validationBadge(validation, teamValidationStatus);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-ink">{toChineseDisplay(player.name, "待补中文球员")}</span>
          {isStar ? <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" aria-hidden /> : null}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {toChineseDisplay(player.position, "位置未返回")} · 预计首发 {formatPercent(player.startProbability)}
        </div>
        <div className={clsx("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", badge.className)}>
          {badge.icon}
          {badge.label}
        </div>
      </div>
      <div className="shrink-0 text-right text-xs text-slate-500">
        <div className="font-semibold text-field">评分 {player.starRating}</div>
        <div>进球+{formatPercent(player.goalImpact)}</div>
      </div>
    </div>
  );
}

function validationBadge(validation?: LineupPlayerValidation, teamValidationStatus?: TeamLineupValidation["status"]) {
  if (!validation || validation.actualStatus === "unknown") {
    if (teamValidationStatus === "unavailable") {
      return {
        label: "无法验证",
        className: "bg-red-50 text-red-700",
        icon: <ShieldAlert size={11} aria-hidden />
      };
    }

    return {
      label: "待验证",
      className: "bg-amber-50 text-amber-700",
      icon: <Clock3 size={11} aria-hidden />
    };
  }

  if (validation.actualStatus === "starter") {
    return {
      label: "命中首发",
      className: "bg-emerald-50 text-emerald-700",
      icon: <CheckCircle2 size={11} aria-hidden />
    };
  }

  if (validation.actualStatus === "substitute") {
    return {
      label: "替补非首发",
      className: "bg-blue-50 text-blue-700",
      icon: <ShieldAlert size={11} aria-hidden />
    };
  }

  return {
    label: "未命中",
    className: "bg-red-50 text-red-700",
    icon: <XCircle size={11} aria-hidden />
  };
}

function validationStatusLabel(status: TeamLineupValidation["status"]): string {
  if (status === "unavailable") return "缺真实首发，无法验证";
  if (status === "pending") return "等待真实首发";
  if (status === "partial") return "部分验证";
  return "已验证";
}

function hasDisplayableActualLineup(validation: TeamLineupValidation): boolean {
  return isValidatedStatus(validation.status) && displayableActualNames(validation.actualStarters).length >= 11;
}

function isValidatedStatus(status: TeamLineupValidation["status"] | undefined): boolean {
  return status === "verified" || status === "partial";
}

function displayableActualNames(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values ?? []) {
    const displayName = toDisplayableActualName(value);
    if (!displayName || seen.has(displayName)) continue;
    seen.add(displayName);
    names.push(displayName);
  }
  return names;
}

function toDisplayableActualName(value: string | undefined): string {
  const translated = toChineseDisplay(value, "待补中文球员").trim();
  if (!isUsableActualDisplayName(translated)) return "";
  return translated;
}

function isUsableActualDisplayName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "-" || normalized === "n/a") return false;
  return ![
    "未知球员",
    "待补中文球员",
    "未接入中文名",
    "unknown",
    "unknown player",
    "tbd",
    "待定球员"
  ].some((placeholder) => normalized.includes(placeholder));
}

function ImpactMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-field">+{formatPercent(value)}</div>
    </div>
  );
}

function confidenceLabel(value: TeamLineupProjection["confidence"]): string {
  if (value === "high") return "高";
  if (value === "medium") return "中";
  return "低";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
