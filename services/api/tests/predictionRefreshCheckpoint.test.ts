import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PredictionRefreshCheckpoint } from "../src/services/predictionRefreshCheckpoint.js";

let tempDirectory: string | undefined;

afterEach(() => {
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  tempDirectory = undefined;
});

describe("PredictionRefreshCheckpoint", () => {
  it("keeps a failed refresh pending across a process restart", () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "football-bracket-refresh-"));
    const path = join(tempDirectory, "checkpoint.json");
    const firstProcess = new PredictionRefreshCheckpoint(path);

    const requestedVersion = firstProcess.request();
    const restartedProcess = new PredictionRefreshCheckpoint(path);

    expect(restartedProcess.hasPending()).toBe(true);
    expect(restartedProcess.requestedVersion()).toBe(requestedVersion);

    restartedProcess.complete(requestedVersion);
    expect(new PredictionRefreshCheckpoint(path).hasPending()).toBe(false);
  });
});
