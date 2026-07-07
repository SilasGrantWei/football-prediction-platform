import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { config } from "../src/config.js";
import {
  clearOfficialTruthCache,
  getOfficialMatchResponse,
  getOfficialTruthStatus
} from "../src/services/officialTruthService.js";

const originalOfficialMatchesJson = config.officialMatchesJson;

function writeTempOfficialFile(rows: unknown[]): { dir: string; filePath: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "official-truth-"));
  const filePath = path.join(dir, "official_matches.json");
  writeFileSync(filePath, JSON.stringify(rows), "utf8");
  return { dir, filePath };
}

afterEach(() => {
  config.officialMatchesJson = originalOfficialMatchesJson;
  clearOfficialTruthCache();
});

describe("officialTruthService", () => {
  it("loads FIFA official records as highest-confidence truth", () => {
    const { dir, filePath } = writeTempOfficialFile([
      {
        match_id: "fifa-2026-001",
        home_team: "Brazil",
        away_team: "Germany",
        score_90min: "2-1",
        stage: "knockout",
        match_date: "2026-07-01T00:00:00Z",
        is_extra_time: false,
        is_penalty: false,
        source: "fifa"
      }
    ]);

    try {
      config.officialMatchesJson = filePath;
      clearOfficialTruthCache();

      const response = getOfficialMatchResponse("fifa-2026-001");

      expect(response).not.toBeNull();
      expect(response?.sourceUsed).toBe("fifa");
      expect(response?.source_used).toBe("fifa");
      expect(response?.confidence).toBe(1);
      expect(response?.truthLayer).toBe("Official Football Truth Layer");
      expect(response?.truth_layer).toBe("Official Football Truth Layer");
      expect(response?.officialMatchRecord.score90Min).toBe("2-1");
      expect(response?.official_match_record.score_90min).toBe("2-1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses FIFA over UEFA and Kaggle when duplicated match IDs are present", () => {
    const { dir, filePath } = writeTempOfficialFile([
      {
        match_id: "same-match",
        home_team: "Brazil",
        away_team: "Germany",
        score_90min: "0-1",
        stage: "final",
        match_date: "2026-07-01T00:00:00Z",
        source: "kaggle"
      },
      {
        match_id: "same-match",
        home_team: "Brazil",
        away_team: "Germany",
        score_90min: "1-1",
        stage: "final",
        match_date: "2026-07-01T00:00:00Z",
        source: "uefa"
      },
      {
        match_id: "same-match",
        home_team: "Brazil",
        away_team: "Germany",
        score_90min: "2-1",
        stage: "final",
        match_date: "2026-07-01T00:00:00Z",
        source: "fifa"
      }
    ]);

    try {
      config.officialMatchesJson = filePath;
      clearOfficialTruthCache();

      const response = getOfficialMatchResponse("same-match");
      const status = getOfficialTruthStatus();

      expect(response?.source_used).toBe("fifa");
      expect(response?.official_match_record.score_90min).toBe("2-1");
      expect(status.recordCount).toBe(1);
      expect(status.sourceCounts).toEqual({ fifa: 1, uefa: 0, kaggle: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects rows with prediction fields from the official layer", () => {
    const { dir, filePath } = writeTempOfficialFile([
      {
        match_id: "model-leak",
        home_team: "Prediction FC",
        away_team: "Model FC",
        score_90min: "9-9",
        stage: "demo",
        match_date: "2026-01-01",
        source: "fifa",
        predicted_score: "1-0"
      }
    ]);

    try {
      config.officialMatchesJson = filePath;
      clearOfficialTruthCache();

      expect(getOfficialMatchResponse("model-leak")).toBeNull();
      expect(getOfficialTruthStatus().recordCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports source counts from the official match file", () => {
    const { dir, filePath } = writeTempOfficialFile([
      {
        match_id: "fifa-001",
        home_team: "France",
        away_team: "Spain",
        score_90min: "1-1",
        stage: "group",
        match_date: "2026-06-20",
        source: "fifa"
      },
      {
        match_id: "uefa-001",
        home_team: "Italy",
        away_team: "Netherlands",
        score_90min: "0-0",
        stage: "group",
        match_date: "2026-06-21",
        source: "uefa"
      },
      {
        match_id: "kaggle-001",
        home_team: "Argentina",
        away_team: "England",
        score_90min: "2-2",
        stage: "knockout",
        match_date: "2022-12-01",
        source: "kaggle"
      },
      {
        match_id: "bad-source",
        home_team: "Prediction FC",
        away_team: "Model FC",
        score_90min: "9-9",
        stage: "demo",
        match_date: "2026-01-01",
        source: "prediction"
      }
    ]);

    try {
      config.officialMatchesJson = filePath;
      clearOfficialTruthCache();

      const status = getOfficialTruthStatus();

      expect(status.available).toBe(true);
      expect(status.recordCount).toBe(3);
      expect(status.sourceCounts).toEqual({ fifa: 1, uefa: 1, kaggle: 1 });
      expect(getOfficialMatchResponse("bad-source")).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not fabricate official data when no official file exists", () => {
    config.officialMatchesJson = path.join(tmpdir(), "missing-official-matches.json");
    clearOfficialTruthCache();

    expect(getOfficialMatchResponse("missing")).toBeNull();
    expect(getOfficialTruthStatus()).toMatchObject({
      available: false,
      recordCount: 0,
      filePath: null
    });
  });
});
