import { createServer, request } from "node:http";

import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config } from "../src/config.js";
import { syncRouter } from "../src/routes/sync.js";
import { predictionService } from "../src/services/predictionService.js";

const originalDemoMode = config.demoMode;

afterEach(() => {
  config.demoMode = originalDemoMode;
  vi.restoreAllMocks();
});

describe("manual sync route", () => {
  it("delegates demo prediction refresh to the tournament sync without a duplicate call", async () => {
    config.demoMode = true;
    const refreshSpy = vi.spyOn(predictionService, "refreshUpcomingPredictions").mockResolvedValue({
      generatedAt: "2026-07-11T00:00:00.000Z",
      considered: 1,
      recalculated: 1,
      failed: 0,
      skipped: { alreadyStarted: 0, finishedLocked: 0, invalidKickoff: 0 },
      matches: [],
      failures: []
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [
            {
              id: "quarter-final-unit-test",
              date: "2026-07-11T21:00:00.000Z",
              status: { type: { state: "post", completed: true, description: "Final" } },
              competitions: [
                {
                  competitors: [
                    { homeAway: "home", score: "1", winner: false, team: { displayName: "Norway" } },
                    { homeAway: "away", score: "2", winner: true, team: { displayName: "England" } }
                  ]
                }
              ]
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const app = express();
    app.use("/sync", syncRouter);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("test server did not expose a TCP port");
      const response = await post(`http://127.0.0.1:${address.port}/sync/manual`);

      expect(response.status).toBe(200);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});

function post(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { method: "POST", agent: false }, (incoming) => {
      let body = "";
      incoming.setEncoding("utf8");
      incoming.on("data", (chunk) => {
        body += chunk;
      });
      incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, body }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}
