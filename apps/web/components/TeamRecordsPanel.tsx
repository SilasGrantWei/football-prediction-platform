"use client";

import { BarChart3, CalendarDays, ChevronRight, Goal, Loader2, ShieldCheck, Swords, UsersRound, X } from "lucide-react";
import { useState } from "react";

import { toChineseDisplay } from "@/lib/chineseDisplay";
import type {
  MatchEvent,
  MatchResult,
  TeamRecordComparison,
  TeamRecordDataIntegrity,
  TeamRecordLineup,
  TeamRecordMatch,
  TeamRecordMatchDetail,
  TeamRecordPlayerAppearance,
  TeamRecordSummary,
  TeamRecordTeamStats
} from "@/lib/types";

interface ApiEnvelope<T> {
  data: T;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";

const resultLabels: Record<MatchResult, string> = {
  win: "胜",
  draw: "平",
  loss: "负"
};

const resultClassNames: Record<MatchResult, string> = {
  win: "bg-emerald-50 text-emerald-700",
  draw: "bg-amber-50 text-amber-700",
  loss: "bg-red-50 text-red-700"
};

const eventLabels: Record<MatchEvent["type"], string> = {
  goal: "进球",
  penalty: "点球",
  yellow_card: "黄牌",
  red_card: "红牌",
  substitution: "换人",
  foul: "犯规",
  offside: "越位",
  corner: "角球",
  shot_on_target: "射正",
  shot_off_target: "射偏",
  shot_blocked: "封堵",
  var_review: "视频助理裁判",
  free_kick: "任意球",
  kickoff: "开场",
  halftime: "半场"
};

export function TeamRecordsPanel({ records }: { records: TeamRecordComparison }) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamRecordMatchDetail | null>(null);
  const [loadingMatchId, setLoadingMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openMatchDetail(match: TeamRecordMatch) {
    setSelectedMatchId(match.matchId);
    setLoadingMatchId(match.matchId);
    setError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/matches/${encodeURIComponent(records.matchId)}/team-records/${encodeURIComponent(match.matchId)}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const payload = (await response.json()) as ApiEnvelope<TeamRecordMatchDetail>;
      setDetail(payload.data);
    } catch {
      setDetail(null);
      setError("暂时无法读取这场比赛详情。该比赛可能不在真实赛果库中，或后端接口未运行。");
    } finally {
      setLoadingMatchId(null);
    }
  }

  function closeMatchDetail() {
    setSelectedMatchId(null);
    setDetail(null);
    setError(null);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-field" aria-hidden />
            <h2 className="text-base font-semibold text-ink">{records.seasonYear}年赛前战绩对比</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">{toChineseDisplay(records.note, "暂无中文说明")}</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          截至 {formatDateTime(records.cutoffTime)}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TeamRecordCard
          record={records.home}
          selectedMatchId={selectedMatchId}
          loadingMatchId={loadingMatchId}
          onSelectMatch={openMatchDetail}
        />
        <TeamRecordCard
          record={records.away}
          selectedMatchId={selectedMatchId}
          loadingMatchId={loadingMatchId}
          onSelectMatch={openMatchDetail}
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
      ) : null}

      {detail ? <MatchDetailPanel detail={detail} onClose={closeMatchDetail} /> : null}

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Swords size={17} className="text-field" aria-hidden />
          <h3 className="text-sm font-semibold text-ink">今年直接交锋</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-[0.7fr_1.3fr]">
          <div className="grid grid-cols-4 gap-2 text-center">
            <MiniStat label="场次" value={records.headToHead.played} />
            <MiniStat label="主队胜" value={records.headToHead.homeWins} />
            <MiniStat label="平局" value={records.headToHead.draws} />
            <MiniStat label="客队胜" value={records.headToHead.awayWins} />
          </div>
          <div className="space-y-2">
            {records.headToHead.matches.length ? (
              records.headToHead.matches.map((match) => (
                <MatchRow
                  key={match.matchId}
                  match={match}
                  selected={selectedMatchId === match.matchId}
                  loading={loadingMatchId === match.matchId}
                  onSelect={openMatchDetail}
                />
              ))
            ) : (
              <EmptyDataCard message="今年开赛前暂无双方直接交锋记录。" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamRecordCard({
  record,
  selectedMatchId,
  loadingMatchId,
  onSelectMatch
}: {
  record: TeamRecordSummary;
  selectedMatchId: string | null;
  loadingMatchId: string | null;
  onSelectMatch: (match: TeamRecordMatch) => void;
}) {
  const recentCount = record.recentMatches.length;
  const recentTitle = `最近${recentCount}场（最多5场）`;

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-ink">{toChineseDisplay(record.teamName, "球队")}</h3>
          <div className="mt-1 text-sm text-slate-500">
            {record.played}场 {record.wins}胜 {record.draws}平 {record.losses}负
          </div>
        </div>
        <div className="score-text text-right">
          <div className="text-2xl font-black text-field">{Math.round(record.winRate * 100)}%</div>
          <div className="text-xs font-medium text-slate-500">胜率</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="进球" value={record.goalsFor} />
        <MiniStat label="失球" value={record.goalsAgainst} />
        <MiniStat label="净胜" value={signed(record.goalDifference)} />
        <MiniStat label="零封" value={record.cleanSheets} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniStat label="场均进球" value={record.avgGoalsFor.toFixed(2)} />
        <MiniStat label="场均失球" value={record.avgGoalsAgainst.toFixed(2)} />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck size={15} className="text-field" aria-hidden />
          {recentTitle}
        </div>
        {record.recentMatches.length ? (
          <div className="space-y-2">
            {record.recentMatches.map((match) => (
              <MatchRow
                key={match.matchId}
                match={match}
                selected={selectedMatchId === match.matchId}
                loading={loadingMatchId === match.matchId}
                onSelect={onSelectMatch}
              />
            ))}
          </div>
        ) : (
          <EmptyDataCard message="今年开赛前暂无已结束比赛。" />
        )}
      </div>
    </div>
  );
}

function MatchRow({
  match,
  selected,
  loading,
  onSelect
}: {
  match: TeamRecordMatch;
  selected: boolean;
  loading: boolean;
  onSelect: (match: TeamRecordMatch) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(match)}
      className={`grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
        selected ? "border-field bg-emerald-50/50" : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      <span className={`rounded px-2 py-1 text-xs font-bold ${resultClassNames[match.result]}`}>{resultLabels[match.result]}</span>
      <div className="min-w-0">
        <div className="truncate font-semibold text-ink">
          {match.venue === "home" ? "主" : "客"} 对 {toChineseDisplay(match.opponent, "对手")}
        </div>
        <div className="truncate text-xs text-slate-500">
          {formatDate(match.date)} · {toChineseDisplay(match.competition, "赛事")}
        </div>
      </div>
      <span className="score-text font-bold text-ink">{match.score}</span>
      <span className="flex items-center gap-1 text-xs text-slate-400">
        {loading ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        {match.venue === "home" ? "主场" : "客场"}
      </span>
    </button>
  );
}

function MatchDetailPanel({ detail, onClose }: { detail: TeamRecordMatchDetail; onClose: () => void }) {
  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wide text-slate-500">{toChineseDisplay(detail.competition, "世界杯比赛")}</div>
          <h3 className="mt-1 text-lg font-bold text-ink">
            {toChineseDisplay(detail.homeTeam.name, "主队")} {detail.homeScore}-{detail.awayScore} {toChineseDisplay(detail.awayTeam.name, "客队")}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{formatDateTime(detail.startTime)}</span>
            {detail.sourceUrl ? (
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white px-2 py-1 font-semibold text-blue-700 hover:text-blue-900"
              >
                {toChineseDisplay(detail.sourceLabel, "数据来源")}
              </a>
            ) : (
              <span className="rounded-full bg-white px-2 py-1 font-semibold text-slate-600">{toChineseDisplay(detail.sourceLabel, "数据来源")}</span>
            )}
            <DataBadge available={Boolean(detail.stats)} label={detail.stats ? "真实技术统计" : "未接入技术统计"} />
            <DataBadge available={Boolean(detail.lineups)} label={detail.lineups ? "真实阵容" : "未接入真实阵容"} />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white p-2 text-slate-500 shadow-sm hover:text-ink"
          aria-label="关闭比赛详情"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <p className="rounded-lg bg-white px-3 py-3 text-sm leading-6 text-slate-600">{toChineseDisplay(detail.summary, "暂无中文比赛摘要")}</p>
      <BasicFactsPanel detail={detail} />
      <DataGapPanel reasons={detail.missingDataReasons} />

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 size={16} className="text-field" aria-hidden />
              <h4 className="text-sm font-semibold text-ink">对局技术统计</h4>
            </div>
            {detail.stats ? (
              <StatsComparison
                homeName={detail.homeTeam.name}
                awayName={detail.awayTeam.name}
                home={detail.stats.home}
                away={detail.stats.away}
              />
            ) : (
              <EmptyDataCard message="暂无真实技术统计。未接入官方技术数据源时，不展示估算射门、预期进球、控球率。" />
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Goal size={16} className="text-field" aria-hidden />
              <h4 className="text-sm font-semibold text-ink">关键事件</h4>
            </div>
            <DetailEvents events={detail.events} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <UsersRound size={16} className="text-field" aria-hidden />
            <h4 className="text-sm font-semibold text-ink">上场队员</h4>
          </div>
          {detail.lineups ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <LineupBlock lineup={detail.lineups.home} />
              <LineupBlock lineup={detail.lineups.away} />
            </div>
          ) : (
            <EmptyDataCard message="暂无真实上场队员数据。请接入官方阵容、首发或比赛报告数据源后显示。" />
          )}
        </div>
      </div>
    </div>
  );
}

function DataBadge({ available, label }: { available: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 font-semibold ${
        available ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {label}
    </span>
  );
}

const dataIntegrityLabels: Record<TeamRecordDataIntegrity, string> = {
  score_only: "仅有基础赛果",
  partial_external: "部分真实详情",
  complete_external: "完整真实详情"
};

const dataIntegrityClassNames: Record<TeamRecordDataIntegrity, string> = {
  score_only: "bg-amber-50 text-amber-700",
  partial_external: "bg-blue-50 text-blue-700",
  complete_external: "bg-emerald-50 text-emerald-700"
};

function BasicFactsPanel({ detail }: { detail: TeamRecordMatchDetail }) {
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-4">
      <FactCard label="90分钟比分" value={detail.basicFacts.fullTimeScore} strong />
      <FactCard label="赛果" value={detail.basicFacts.resultText} />
      <FactCard label="开球时间" value={formatDateTime(detail.basicFacts.kickoffTime)} />
      <div className={`rounded-md px-3 py-2 ${dataIntegrityClassNames[detail.basicFacts.dataIntegrity]}`}>
        <div className="text-xs font-medium opacity-80">数据状态</div>
        <div className="mt-1 text-sm font-bold">{dataIntegrityLabels[detail.basicFacts.dataIntegrity]}</div>
      </div>
    </div>
  );
}

function FactCard({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-white px-3 py-2">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 truncate ${strong ? "score-text text-lg font-black text-ink" : "text-sm font-bold text-ink"}`}>
        {toChineseDisplay(value, "暂无中文内容")}
      </div>
    </div>
  );
}

function DataGapPanel({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;

  return (
    <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-3">
      <div className="mb-2 text-sm font-semibold text-amber-800">为什么这里没有更多数据</div>
      <div className="grid gap-2 md:grid-cols-2">
        {reasons.map((reason) => (
          <div key={reason} className="rounded-md bg-white/80 px-3 py-2 text-xs leading-5 text-amber-900">
            {toChineseDisplay(reason, "暂无中文缺失原因")}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsComparison({
  homeName,
  awayName,
  home,
  away
}: {
  homeName: string;
  awayName: string;
  home: TeamRecordTeamStats;
  away: TeamRecordTeamStats;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-xs font-semibold text-slate-500">
        <span className="truncate">{toChineseDisplay(homeName, "主队")}</span>
        <span>维度</span>
        <span className="truncate text-right">{toChineseDisplay(awayName, "客队")}</span>
      </div>
      <StatRow label="控球率" home={`${home.possession}%`} away={`${away.possession}%`} />
      <StatRow label="射门" home={home.shots} away={away.shots} />
      <StatRow label="射正" home={home.shotsOnTarget} away={away.shotsOnTarget} />
      <StatRow label="预期进球" home={home.xg === null ? "-" : home.xg.toFixed(2)} away={away.xg === null ? "-" : away.xg.toFixed(2)} />
      <StatRow label="角球" home={home.corners} away={away.corners} />
      <StatRow label="犯规" home={home.fouls} away={away.fouls} />
      <StatRow label="黄/红牌" home={`${home.yellowCards}/${home.redCards}`} away={`${away.yellowCards}/${away.redCards}`} />
    </div>
  );
}

function StatRow({ label, home, away }: { label: string; home: number | string; away: number | string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
      <span className="score-text font-bold text-ink">{home}</span>
      <span className="text-xs text-slate-500">{label}</span>
      <span className="score-text text-right font-bold text-ink">{away}</span>
    </div>
  );
}

function DetailEvents({ events }: { events: MatchEvent[] }) {
  if (!events.length) {
    return <EmptyDataCard message="暂无真实事件记录。" />;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={`${event.id}-${event.minute}-${event.type}-${event.player}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            <span className="score-text w-10 font-bold text-ink">{formatEventMinute(event.minute)}</span>
            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{eventLabels[event.type]}</span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{toChineseDisplay(event.team, "球队")}</div>
              <div className="truncate text-xs text-slate-500">{displayEventPlayer(event)}</div>
            </div>
          </div>
          <div className="mt-2 rounded bg-white px-3 py-2 text-xs leading-5 text-slate-600">
            {toChineseDisplay(event.description?.trim() || fallbackEventDescription(event), "暂无中文事件说明")}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatEventMinute(minute: number): string {
  return minute <= 0 ? "开场" : `${minute}分`;
}

function displayEventPlayer(event: MatchEvent): string {
  return event.player && !genericEventPlayers.has(event.player) ? toChineseDisplay(event.player, "待补中文球员") : "数据源未返回具体球员";
}

function fallbackEventDescription(event: MatchEvent): string {
  const player = displayEventPlayer(event);
  if (event.type === "corner") return `${player}。数据源未返回主罚者、造成者或前序射门/解围原因。`;
  if (event.type === "offside") return `${player}。数据源未返回传球来源、越位位置或视频助理裁判过程。`;
  if (event.type === "foul") return `${player}。数据源未返回具体犯规动作和被犯规球员。`;
  if (event.type === "free_kick") return `${player}。数据源未返回犯规原因或任意球主罚者。`;
  if (event.type === "var_review") return `${player}。数据源未返回完整视频助理裁判复核结论。`;
  return `${player}。数据源未返回更完整的事件说明。`;
}

const genericEventPlayers = new Set(["角球", "犯规", "越位", "射正", "射偏", "射门被封堵", "点球", "视频助理裁判", "任意球"]);

function LineupBlock({ lineup }: { lineup: TeamRecordLineup }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-ink">{toChineseDisplay(lineup.teamName, "球队")}</div>
          <div className="text-xs text-slate-500">阵型 {lineup.formation}</div>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-500">首发 11</span>
      </div>

      <div className="space-y-1">
        {lineup.starters.map((player) => (
          <PlayerRow key={`${lineup.teamId}-${player.number}`} player={player} />
        ))}
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="mb-2 text-xs font-semibold text-slate-500">替补/登场名单</div>
        <div className="grid gap-1 sm:grid-cols-2">
          {lineup.substitutes.map((player) => (
            <PlayerRow key={`${lineup.teamId}-${player.number}`} player={player} compact />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlayerRow({ player, compact = false }: { player: TeamRecordPlayerAppearance; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md bg-white px-2 ${compact ? "py-1.5" : "py-2"}`}>
      <span className="score-text w-7 rounded bg-slate-100 py-1 text-center text-xs font-bold text-slate-600">{player.number}</span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{toChineseDisplay(player.name, "待补中文球员")}</div>
        <div className="text-xs text-slate-500">{toChineseDisplay(player.position, "位置未返回")}</div>
      </div>
      <span className="score-text text-xs font-semibold text-slate-500">{player.minutesPlayed === null ? "-" : `${player.minutesPlayed}'`}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="score-text text-base font-bold text-ink">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function EmptyDataCard({ message }: { message: string }) {
  return <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">{message}</div>;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
