import {
  BadgeAlert,
  CircleDot,
  CornerDownRight,
  Flag,
  Footprints,
  Goal,
  Repeat2,
  ShieldAlert,
  Target,
  Timer,
  Video
} from "lucide-react";

import { toChineseDisplay } from "@/lib/chineseDisplay";
import type { EventType, MatchEvent } from "@/lib/types";
import type { MatchStatus } from "@/lib/types";

const eventLabels: Record<EventType, string> = {
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

export function EventTimeline({ events, matchStatus }: { events: MatchEvent[]; matchStatus: MatchStatus }) {
  if (!events.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm leading-6 text-slate-500">
        {emptyMessage(matchStatus)}
      </div>
    );
  }

  return (
    <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
      {events.map((event) => {
        const Icon = eventIcon(event.type);
        const style = eventStyle(event.type);
        const detail = eventDetail(event);

        return (
          <article
            key={`${event.id}-${event.minute}-${event.type}-${event.team}-${event.player}`}
            className="grid grid-cols-[56px_auto_1fr] gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3"
          >
            <span className="score-text text-sm font-bold text-ink">{formatMinute(event.minute)}</span>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${style.iconBg}`}>
              <Icon size={17} className={style.iconText} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1 text-sm font-semibold text-ink">
                <span className={style.labelText}>{eventLabels[event.type]}</span>
                <span className="text-slate-300">·</span>
                <span>{toChineseDisplay(event.team, "球队")}</span>
              </div>
              <div className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-500">关联球员：</span>
                {displayPlayer(event)}
              </div>
              <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
                <span className="font-semibold text-ink">事件详情：</span>
                {detail}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function emptyMessage(status: MatchStatus): string {
  if (status === "finished") {
    return "比赛已结束，但当前真实数据源没有返回进球、点球、犯规、越位、黄红牌、角球、射门和换人时间线。这里不会补造事件；接入官方事件源后会自动显示真实明细。";
  }
  if (status === "scheduled") return "比赛尚未开始，开赛后真实事件会在这里显示。";
  return "当前还没有真实比赛事件返回。数据源同步后会显示进球、点球、犯规、越位、黄红牌、角球、射门和换人时间。";
}

function formatMinute(minute: number): string {
  return minute <= 0 ? "开场" : `${minute}分`;
}

function displayPlayer(event: MatchEvent): string {
  if (!event.player || genericPlayerLabels.has(event.player)) return "数据源未返回具体球员";
  return toChineseDisplay(event.player, "待补中文球员");
}

function eventDetail(event: MatchEvent): string {
  const description = event.description?.trim();
  if (description && description !== event.player) return toChineseDisplay(description, "暂无中文事件说明");

  const player = displayPlayer(event);
  if (event.type === "corner") return `${player}。数据源只返回角球事件，未返回主罚者、造成者或前序射门/解围原因。`;
  if (event.type === "offside") return `${player}。数据源只返回越位事件，未返回传球队友、视频助理裁判过程或越位位置细节。`;
  if (event.type === "foul") return `${player}。数据源只返回犯规事件，未返回犯规动作、被犯规球员或判罚原因。`;
  if (event.type === "free_kick") return `${player}。数据源只返回任意球事件，未返回犯规原因或主罚者。`;
  if (event.type === "var_review") return `${player}。数据源只返回视频助理裁判事件，未返回完整裁判复核结论。`;
  if (event.type === "shot_on_target") return `${player}。数据源只返回射正事件，未返回射门区域、脚法或扑救细节。`;
  if (event.type === "shot_off_target") return `${player}。数据源只返回射偏事件，未返回射门区域、脚法或偏出方向。`;
  if (event.type === "shot_blocked") return `${player}。数据源只返回封堵事件，未返回封堵球员或射门路线。`;
  if (event.type === "substitution") return `${player}。数据源只返回换人事件，未返回战术原因。`;
  if (event.type === "yellow_card" || event.type === "red_card") return `${player}。数据源只返回牌类事件，未返回具体犯规动作。`;
  return `${player}。数据源未返回更完整的事件说明。`;
}

function eventIcon(type: EventType) {
  if (type === "goal") return Goal;
  if (type === "penalty") return Target;
  if (type === "red_card") return ShieldAlert;
  if (type === "yellow_card") return BadgeAlert;
  if (type === "substitution") return Repeat2;
  if (type === "foul") return Footprints;
  if (type === "offside") return Flag;
  if (type === "corner") return CornerDownRight;
  if (type === "var_review") return Video;
  if (type === "shot_on_target" || type === "shot_off_target" || type === "shot_blocked" || type === "free_kick") return Target;
  if (type === "kickoff" || type === "halftime") return Timer;
  return CircleDot;
}

function eventStyle(type: EventType): { iconBg: string; iconText: string; labelText: string } {
  if (type === "goal" || type === "penalty") {
    return { iconBg: "bg-emerald-50", iconText: "text-field", labelText: "text-field" };
  }
  if (type === "red_card") return { iconBg: "bg-red-50", iconText: "text-red-600", labelText: "text-red-700" };
  if (type === "yellow_card") return { iconBg: "bg-amber-50", iconText: "text-amber-600", labelText: "text-amber-700" };
  if (type === "foul") return { iconBg: "bg-orange-50", iconText: "text-orange-600", labelText: "text-orange-700" };
  if (type === "offside") return { iconBg: "bg-violet-50", iconText: "text-violet-600", labelText: "text-violet-700" };
  if (type === "substitution") return { iconBg: "bg-blue-50", iconText: "text-blue-600", labelText: "text-blue-700" };
  if (type === "var_review") return { iconBg: "bg-purple-50", iconText: "text-purple-600", labelText: "text-purple-700" };
  if (type === "corner" || type === "free_kick") return { iconBg: "bg-sky-50", iconText: "text-sky-600", labelText: "text-sky-700" };
  return { iconBg: "bg-slate-100", iconText: "text-slate-600", labelText: "text-ink" };
}

const genericPlayerLabels = new Set(["角球", "犯规", "越位", "射正", "射偏", "射门被封堵", "点球", "视频助理裁判", "任意球", "开场", "半场结束"]);
