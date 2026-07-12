# Light Broadcast Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把世界杯仪表盘改成浅色体育转播台，使比分、比赛状态和开赛时间成为第一视觉层级。

**Architecture:** 保留现有 Next.js 服务端数据加载和 API 类型，只增加一个纯展示策略模块来决定比赛卡片的比分牌内容与状态色。页面结构、导航和卡片分别在现有组件内调整，视觉令牌集中在 `globals.css`，不引入新的 UI 运行时依赖。

**Tech Stack:** Next.js 16、React 18、TypeScript、Tailwind CSS 3、Lucide React、Vitest 4。

## Global Constraints

- 页面保持浅色，主底色为 `#f3f6f2`，主文字为 `#0a1a2b`。
- 比分与状态是比赛卡片的最高视觉层级。
- 未开始比赛显示开赛时间，不把 `0-0` 表现为真实比分。
- 不修改比赛数据、北京时间分组、模型概率、预测快照或赛后校准逻辑。
- 不增加新的视觉组件库、图片依赖或字体下载。
- 现有父仓库没有基线提交；执行期间不得创建只包含本功能的初始 Git 提交，使用测试结果作为任务检查点。

---

## File Map

- Create `apps/web/lib/matchCardPresentation.ts`: 纯函数，决定比分牌文案和状态视觉语义。
- Create `apps/web/lib/matchCardPresentation.test.ts`: 防止未开始比赛再次显示假 `0-0`。
- Modify `apps/web/package.json`: 增加 Web Vitest 命令和显式测试依赖。
- Modify `package-lock.json`: 记录 Web 工作区的 Vitest 开发依赖。
- Modify `apps/web/app/globals.css`: 浅色转播台令牌、表面、状态轨和动效。
- Modify `apps/web/components/AppShell.tsx`: 紧凑吸顶导航和清晰激活态。
- Modify `apps/web/app/dashboard/page.tsx`: 紧凑赛事控制台与首屏层级。
- Modify `apps/web/components/MatchCard.tsx`: 重构比分、状态、球队和预测信息层级。
- Modify `apps/web/components/StatusBadge.tsx`: 增强状态点和实时可读性。

---

### Task 1: Match Card Presentation Policy

**Files:**
- Create: `apps/web/lib/matchCardPresentation.ts`
- Create: `apps/web/lib/matchCardPresentation.test.ts`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `MatchStatus` from `apps/web/lib/types.ts` and the existing Beijing kickoff label.
- Produces: `getMatchCardPresentation(input): MatchCardPresentation`, consumed by `MatchCard.tsx`.

- [ ] **Step 1: Add the Web test command and Vitest dependency**

Add to `apps/web/package.json`:

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.1.9"
  }
}
```

Run:

```powershell
npm install --package-lock-only
```

Expected: exit code `0`, with `package-lock.json` updated for the Web workspace.

- [ ] **Step 2: Write the failing presentation tests**

Create `apps/web/lib/matchCardPresentation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getMatchCardPresentation } from "./matchCardPresentation.js";

describe("getMatchCardPresentation", () => {
  it("shows Beijing kickoff time instead of a fake 0-0 for scheduled matches", () => {
    expect(
      getMatchCardPresentation({
        status: "scheduled",
        kickoffLabel: "07/11 03:00 北京时间",
        homeScore: 0,
        awayScore: 0,
        minute: 0
      })
    ).toMatchObject({
      primary: "03:00",
      secondary: "07/11 · 北京时间",
      showRealScore: false,
      tone: "scheduled"
    });
  });

  it("shows the real score and 90-minute label for finished matches", () => {
    expect(
      getMatchCardPresentation({
        status: "finished",
        kickoffLabel: "07/10 04:00 北京时间",
        homeScore: 2,
        awayScore: 0,
        minute: 90
      })
    ).toMatchObject({
      primary: "2-0",
      secondary: "90 分钟",
      showRealScore: true,
      tone: "finished"
    });
  });
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
npm run test -w apps/web -- matchCardPresentation.test.ts
```

Expected: FAIL because `matchCardPresentation.ts` does not exist.

- [ ] **Step 4: Implement the pure presentation policy**

Create `apps/web/lib/matchCardPresentation.ts`:

```ts
import type { MatchStatus } from "./types";

export type MatchCardTone = "scheduled" | "live" | "halftime" | "finished";

export interface MatchCardPresentation {
  primary: string;
  secondary: string;
  showRealScore: boolean;
  tone: MatchCardTone;
}

interface MatchCardPresentationInput {
  status: MatchStatus;
  kickoffLabel: string;
  homeScore: number;
  awayScore: number;
  minute: number;
}

export function getMatchCardPresentation(input: MatchCardPresentationInput): MatchCardPresentation {
  if (input.status === "scheduled") {
    const normalized = input.kickoffLabel.replace("北京时间", "").trim();
    const [date = "--/--", time = "--:--"] = normalized.split(/\s+/);
    return {
      primary: time,
      secondary: `${date} · 北京时间`,
      showRealScore: false,
      tone: "scheduled"
    };
  }

  return {
    primary: `${input.homeScore}-${input.awayScore}`,
    secondary:
      input.status === "finished"
        ? "90 分钟"
        : input.status === "halftime"
          ? "中场"
          : `${input.minute}'`,
    showRealScore: true,
    tone: input.status
  };
}
```

- [ ] **Step 5: Run the tests and verify GREEN**

Run:

```powershell
npm run test -w apps/web -- matchCardPresentation.test.ts
```

Expected: `2 passed`.

---

### Task 2: Light Broadcast Tokens and Navigation

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/components/AppShell.tsx`

**Interfaces:**
- Consumes: existing Tailwind utilities and `navItems`.
- Produces: reusable CSS classes `broadcast-surface`, `broadcast-scoreboard`, and status-rail classes.

- [ ] **Step 1: Add the broadcast design tokens and stable motion rules**

Update the `:root`, `body`, and card styles in `globals.css` with these exact values:

```css
:root {
  color-scheme: light;
  --broadcast-canvas: #f3f6f2;
  --broadcast-surface: #ffffff;
  --broadcast-ink: #0a1a2b;
  --broadcast-muted: #617083;
  --broadcast-field: #11875d;
  --broadcast-blue: #2563eb;
  --broadcast-live: #dc3345;
  --broadcast-amber: #d98b16;
  background: var(--broadcast-canvas);
  color: var(--broadcast-ink);
}

body {
  min-height: 100vh;
  background:
    radial-gradient(circle at 12% 0%, rgba(17, 135, 93, 0.09), transparent 27rem),
    radial-gradient(circle at 88% 8%, rgba(37, 99, 235, 0.08), transparent 30rem),
    linear-gradient(180deg, #f8faf7 0, var(--broadcast-canvas) 32rem, #edf2ef 100%);
  color: var(--broadcast-ink);
}

.broadcast-surface {
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 16px 38px rgba(10, 26, 43, 0.08);
}

.broadcast-scoreboard {
  background: linear-gradient(145deg, #0a1a2b, #102a43);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.08), 0 12px 24px rgba(10, 26, 43, 0.18);
}

.status-rail-scheduled { background: var(--broadcast-blue); }
.status-rail-live { background: var(--broadcast-live); }
.status-rail-halftime { background: var(--broadcast-amber); }
.status-rail-finished { background: var(--broadcast-field); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 2: Tighten the shell header and active navigation**

In `AppShell.tsx`, use a 64-pixel header, a smaller brand mark, and a dark active navigation item:

```tsx
<header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl">
  <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
    <Link href="/dashboard" className="group flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0a1a2b] text-white shadow-md transition group-hover:bg-field">
        <Trophy size={19} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black tracking-tight text-ink sm:text-base">世界杯智能推算</span>
        <span className="hidden truncate text-[11px] font-semibold text-slate-500 sm:block">赛程 · 比分 · 模型复盘</span>
      </span>
    </Link>
    <nav className="relative z-40 flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/90 p-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`top-nav-${item.label}`}
            className={clsx(
              "inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg px-3 text-sm font-bold transition",
              active ? "bg-[#0a1a2b] text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-ink"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={16} aria-hidden />
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  </div>
</header>
```

- [ ] **Step 3: Verify shell compilation**

Run:

```powershell
npm run lint -w apps/web
npm run build -w apps/web
```

Expected: both commands exit `0`.

---

### Task 3: Compact Broadcast Desk and Dashboard Hierarchy

**Files:**
- Modify: `apps/web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: existing match collections and `apiUnavailable`.
- Produces: `BroadcastDesk`, `BroadcastMetric`, and the existing `MatchSection` sequence with today first.

- [ ] **Step 1: Replace the oversized hero and duplicate summary bands**

Replace the current hero, `InfoPill` grid, six-card metric grid, and three `SummaryBand` cards with:

```tsx
<BroadcastDesk
  apiUnavailable={apiUnavailable}
  todayCount={todayMatches.length}
  tomorrowCount={tomorrowMatches.length}
  liveCount={liveMatches.length}
  finishedCount={knockoutFinishedMatches.length}
  confidence={predictionConfidence}
/>
```

- [ ] **Step 2: Add the complete BroadcastDesk component**

Add below `safeLoadMatches`:

```tsx
function BroadcastDesk({
  apiUnavailable,
  todayCount,
  tomorrowCount,
  liveCount,
  finishedCount,
  confidence
}: {
  apiUnavailable: boolean;
  todayCount: number;
  tomorrowCount: number;
  liveCount: number;
  finishedCount: number;
  confidence: number | undefined;
}) {
  const beijingNow = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());

  return (
    <section className="broadcast-surface overflow-hidden rounded-3xl">
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto] lg:items-center lg:p-7">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-field">
            <Trophy size={15} aria-hidden />
            2026 世界杯赛事中心
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-ink sm:text-4xl">今日赛程与比分</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-slate-600">
            <span>{beijingNow} · 北京时间</span>
            <span className="inline-flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${apiUnavailable ? "bg-amber-500" : "bg-emerald-500"}`} />
              {apiUnavailable ? "数据服务异常" : "数据已同步"}
            </span>
            <span>90 分钟口径，不含加时与点球</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <BroadcastMetric label="今日" value={todayCount} />
          <BroadcastMetric label="明日" value={tomorrowCount} />
          <BroadcastMetric label="进行中" value={liveCount} alert={liveCount > 0} />
          <BroadcastMetric label="已结束" value={finishedCount} />
          <BroadcastMetric label="强信号" value={formatPercent(confidence)} accent />
        </div>
      </div>
    </section>
  );
}

function BroadcastMetric({
  label,
  value,
  alert = false,
  accent = false
}: {
  label: string;
  value: string | number;
  alert?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="min-w-[6.25rem] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className={`score-text text-2xl font-black ${alert ? "text-red-600" : accent ? "text-blue-700" : "text-ink"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] font-bold text-slate-500">{label}</div>
    </div>
  );
}
```

- [ ] **Step 3: Keep today first and reduce section spacing**

Set the page root to `space-y-7`, keep “今日世界杯比赛（北京时间）” immediately after `BroadcastDesk`, and move “进行中” before tomorrow only when `liveMatches.length > 0`:

```tsx
{liveMatches.length > 0 ? (
  <MatchSection title="进行中" subtitle="实时比分与比赛分钟" icon={Radio} matches={liveMatches} />
) : null}
<MatchSection title="今日世界杯比赛（北京时间）" subtitle="今日已结束比赛也保留在这里" icon={Activity} matches={todayMatches} />
<MatchSection title="明日世界杯比赛" subtitle="提前查看赛前推算与冷门风险" icon={CalendarClock} matches={tomorrowMatches} />
```

Remove unused `Metric`, `InfoPill`, and `SummaryBand` functions and unused icon imports.

- [ ] **Step 4: Verify dashboard compilation**

Run:

```powershell
npm run lint -w apps/web
npm run build -w apps/web
```

Expected: both commands exit `0`; no unused imports remain.

---

### Task 4: Score-First Match Cards and Status Badges

**Files:**
- Modify: `apps/web/components/MatchCard.tsx`
- Modify: `apps/web/components/StatusBadge.tsx`

**Interfaces:**
- Consumes: `getMatchCardPresentation`, `formatOfficialKickoffTime`, existing prediction and evaluation types.
- Produces: a score-first card that preserves the `/match/{id}` link and current probability data.

- [ ] **Step 1: Wire the presentation policy into MatchCard**

Add:

```ts
import { getMatchCardPresentation } from "@/lib/matchCardPresentation";
```

Inside `MatchCard`, compute:

```ts
const presentation = getMatchCardPresentation({
  status: match.status,
  kickoffLabel: formatOfficialKickoffTime(match),
  homeScore: match.homeScore,
  awayScore: match.awayScore,
  minute: match.minute
});
```

- [ ] **Step 2: Replace the card shell and central scoreboard**

Use this complete structural hierarchy inside the existing `Link`:

```tsx
<span className={`absolute inset-y-0 left-0 w-1 status-rail-${presentation.tone}`} aria-hidden />
<div className="p-4 pl-5 sm:p-5 sm:pl-6">
  <div className="flex min-h-8 items-start justify-between gap-3">
    <div className="min-w-0 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
      {toChineseDisplay(match.competition, "世界杯比赛")}
    </div>
    <StatusBadge status={match.status} />
  </div>

  <div className="mt-5 grid grid-cols-[minmax(0,1fr)_7.25rem_minmax(0,1fr)] items-center gap-3">
    <TeamName role="主队" name={match.homeTeam.name} active={strongerTeam === match.homeTeam.name} align="left" />
    <div className="broadcast-scoreboard rounded-2xl px-3 py-3 text-center text-white">
      <div className={presentation.showRealScore ? "score-text text-5xl font-black tracking-[-0.06em]" : "score-text text-2xl font-black"}>
        {presentation.primary}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">{presentation.secondary}</div>
    </div>
    <TeamName role="客队" name={match.awayTeam.name} active={strongerTeam === match.awayTeam.name} align="right" />
  </div>

  {topScore && !evaluation ? (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-2 font-black text-blue-800"><Target size={15} aria-hidden />首选比分 {topScore.score}</span>
      <span className="score-text font-black text-blue-700">{formatProbability(topScore.probability)}</span>
    </div>
  ) : null}

  {evaluation ? (
    <div
      className={clsx(
        "mt-4 rounded-xl border px-3 py-2.5",
        evaluation.status === "success" ? "border-emerald-200 bg-emerald-50/80" : "border-red-200 bg-red-50/80"
      )}
    >
      <PredictionOutcomeBadge evaluation={evaluation} />
      {evaluation.status === "failed" ? (
        <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-red-700">主要原因：{failureHeadline(evaluation)}</p>
      ) : null}
    </div>
  ) : null}

  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
    <ProbabilityStrip match={match} />
    {match.prediction ? <UpsetBadge risk={match.prediction.upsetRisk} /> : null}
  </div>
</div>
```

Set the outer `Link` classes to:

```tsx
className={clsx(
  "broadcast-surface perf-card group relative block overflow-hidden rounded-2xl transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(10,26,43,0.13)]",
  "match-card",
  isInPlay && "match-card-live"
)}
```

- [ ] **Step 3: Allow long team names to wrap**

Replace `truncate` in `TeamName` with:

```tsx
<span className={clsx("block min-h-12 text-lg font-black leading-6", active ? "text-blue-700" : "text-ink")}>
  {toChineseDisplay(name, role)}
</span>
```

- [ ] **Step 4: Strengthen StatusBadge without changing its public API**

Render a status dot before the label:

```tsx
<span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
{labels[status]}
```

Use `shrink-0`, `ring-1`, and state-specific backgrounds on the wrapper. Add `animate-pulse` only for `live`.

- [ ] **Step 5: Run focused and full Web verification**

Run:

```powershell
npm run test -w apps/web -- matchCardPresentation.test.ts
npm run lint -w apps/web
npm run build -w apps/web
```

Expected: `2 passed`, lint exit `0`, build exit `0`.

---

### Task 5: Browser Acceptance and Regression Check

**Files:**
- Verify only; fix the files from Tasks 2-4 if an acceptance check fails.

**Interfaces:**
- Consumes: running Web at `http://127.0.0.1:3000/dashboard` and API at `http://127.0.0.1:4000/health`.
- Produces: validated desktop and mobile dashboard behavior.

- [ ] **Step 1: Restart the Web service with the production build**

Use the existing `scripts/start-local.ps1 -Service web` path after stopping only the verified Web listener on port `3000`.

Expected: `/dashboard` returns HTTP `200`.

- [ ] **Step 2: Verify desktop layout at 1440 × 900**

Check in the browser:

```text
- Header is compact and remains readable.
- Broadcast desk fits above the first match row.
- Today section is visible in the first viewport.
- Score/time block is the most visually prominent item on every card.
- Scheduled cards show kickoff time, not 0-0.
- Live, scheduled, and finished states have distinct rails and badges.
```

- [ ] **Step 3: Verify mobile layout at 390 × 844**

Check in the browser:

```text
- No horizontal scrolling.
- Navigation icons remain reachable.
- Team names wrap without overlapping the scoreboard.
- Scoreboard remains centered and at least 38px for real scores.
- Status badge remains fixed at the upper right of each card.
```

- [ ] **Step 4: Verify navigation and detail click path**

Open one scheduled card and one finished card.

Expected: both navigate to `/match/{id}` without backend-disconnected errors.

- [ ] **Step 5: Run final repository checks**

Run:

```powershell
npm run test -w apps/web
npm run test:api
npm run lint
npm run build
```

Expected: all commands exit `0`; API tests remain at or above the current 107 passing tests.
