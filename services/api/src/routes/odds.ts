import { Router } from "express";

import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const oddsRouter = Router();

oddsRouter.get(
  "/:matchId",
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT
         match_id,
         provider,
         bookmaker,
         home_odds,
         draw_odds,
         away_odds,
         home_implied_prob,
         draw_implied_prob,
         away_implied_prob,
         overround,
         timestamp
       FROM odds_snapshots
       WHERE match_id = $1
       ORDER BY timestamp DESC, id DESC
       LIMIT 1`,
      [req.params.matchId]
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: { code: "odds_not_found", message: "odds not found" } });
      return;
    }

    res.json({
      data: {
        matchId: row.match_id,
        provider: row.provider,
        bookmaker: row.bookmaker,
        homeOdds: Number(row.home_odds),
        drawOdds: Number(row.draw_odds),
        awayOdds: Number(row.away_odds),
        marketProbabilities: {
          home: Number(row.home_implied_prob),
          draw: Number(row.draw_implied_prob),
          away: Number(row.away_implied_prob)
        },
        overround: Number(row.overround),
        timestamp: new Date(row.timestamp).toISOString()
      }
    });
  })
);
