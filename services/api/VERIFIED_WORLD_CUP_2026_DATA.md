# 2026 World Cup Verified Data Snapshot

Snapshot date: 2026-07-02 Asia/Shanghai.

Sources used:

- FIFA official match schedule PDF v22:
  https://digitalhub.fifa.com/m/1be9ce37eb98fcc5/original/FWC26-Match-Schedule_English.pdf
- ESPN fixtures and results tracker:
  https://www.espn.com/soccer/story/_/id/48939282/2026-fifa-world-cup-fixtures-results-match-schedule-group-stage-knockout-rounds-bracket
- Guardian live report for Belgium 3-2 Senegal:
  https://www.theguardian.com/football/live/2026/jul/01/belgium-v-senegal-world-cup-last-32-live

Notes:

- Demo data in `src/demoStore.ts` now contains 72 completed group-stage fixtures, 16 round-of-32 fixtures, all 8 round-of-16 fixtures, 4 quarterfinals, 2 semifinals, the third-place match, and the final.
- Future knockout fixtures whose participants are not fully known are materialized with bracket placeholders such as `胜者M83（葡萄牙/克罗地亚）`, so the website never shows a missing knockout bracket.
- Match times are stored as UTC ISO strings and rendered by the browser/user locale.
- Prediction, backtest, and post-match evaluation use the 90-minute score only, including referee-added stoppage time. Extra time and penalty shootout outcomes must be stored only as separate notes until the data model has dedicated fields for them.
