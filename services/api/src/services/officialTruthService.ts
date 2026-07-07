import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../config.js";
import type {
  OfficialMatchRecord,
  OfficialMatchResponse,
  OfficialMatchSource,
  OfficialTruthStatus
} from "../models.js";

interface RawOfficialMatchRecord {
  [key: string]: unknown;
  match_id?: string;
  matchId?: string;
  home_team?: string;
  homeTeam?: string;
  away_team?: string;
  awayTeam?: string;
  score_90min?: string;
  score90Min?: string;
  stage?: string;
  match_date?: string;
  matchDate?: string;
  is_extra_time?: boolean;
  isExtraTime?: boolean;
  is_penalty?: boolean;
  isPenalty?: boolean;
  source?: string;
  confidence?: number;
}

interface CachedOfficialMatchRecord extends OfficialMatchRecord {
  confidence: number;
}

const SOURCE_PRIORITY: Record<OfficialMatchSource, number> = {
  fifa: 3,
  uefa: 2,
  kaggle: 1
};

const SOURCE_CONFIDENCE: Record<OfficialMatchSource, number> = {
  fifa: 1,
  uefa: 0.92,
  kaggle: 0.8
};

const PREDICTION_FIELD_HINTS = ["prediction", "predicted", "model_", "prob", "xg_model", "score_bonus"];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedPath: string | null = null;
let cachedMtimeMs = -1;
let cachedRecords: CachedOfficialMatchRecord[] = [];

function candidateOfficialFiles(): string[] {
  const configuredPath = config.officialMatchesJson?.trim();
  if (configuredPath) {
    return [path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath)];
  }

  const candidates = [
    path.resolve(process.cwd(), "data/official/official_matches.json"),
    path.resolve(__dirname, "../../../../data/official/official_matches.json")
  ];

  return candidates.filter((candidate): candidate is string => Boolean(candidate)).map((candidate) =>
    path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate)
  );
}

function asSource(value: string | undefined): OfficialMatchSource | null {
  if (value === "fifa" || value === "uefa" || value === "kaggle") {
    return value;
  }
  return null;
}

function asBoolean(value: boolean | undefined): boolean {
  return Boolean(value);
}

function hasForbiddenPredictionField(raw: RawOfficialMatchRecord): boolean {
  return Object.keys(raw).some((key) => PREDICTION_FIELD_HINTS.some((hint) => key.toLowerCase().includes(hint)));
}

function mapOfficialRecord(raw: RawOfficialMatchRecord): CachedOfficialMatchRecord | null {
  if (hasForbiddenPredictionField(raw)) return null;

  const source = asSource(raw.source);
  const matchId = raw.match_id ?? raw.matchId;
  const homeTeam = raw.home_team ?? raw.homeTeam;
  const awayTeam = raw.away_team ?? raw.awayTeam;
  const score90Min = raw.score_90min ?? raw.score90Min;
  const stage = raw.stage;
  const matchDate = raw.match_date ?? raw.matchDate;

  if (!source || !matchId || !homeTeam || !awayTeam || !score90Min || !stage || !matchDate) {
    return null;
  }

  return {
    matchId,
    homeTeam,
    awayTeam,
    score90Min,
    stage,
    matchDate,
    isExtraTime: asBoolean(raw.is_extra_time ?? raw.isExtraTime),
    isPenalty: asBoolean(raw.is_penalty ?? raw.isPenalty),
    source,
    confidence:
      typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
        ? raw.confidence
        : SOURCE_CONFIDENCE[source]
  };
}

function normalizeOfficialRecords(rows: unknown[]): CachedOfficialMatchRecord[] {
  const candidates = rows
    .map((item) => mapOfficialRecord(item as RawOfficialMatchRecord))
    .filter((item): item is CachedOfficialMatchRecord => item !== null)
    .sort((left, right) => {
      const priorityDelta = SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source];
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(right.matchDate).getTime() - new Date(left.matchDate).getTime();
    });

  const byMatchId = new Map<string, CachedOfficialMatchRecord>();
  for (const record of candidates) {
    if (!byMatchId.has(record.matchId)) {
      byMatchId.set(record.matchId, record);
    }
  }

  return [...byMatchId.values()];
}

function loadOfficialMatches(): { filePath: string | null; records: CachedOfficialMatchRecord[] } {
  const filePath = candidateOfficialFiles().find((candidate) => existsSync(candidate)) ?? null;
  if (!filePath) {
    cachedPath = null;
    cachedMtimeMs = -1;
    cachedRecords = [];
    return { filePath: null, records: [] };
  }

  const mtimeMs = statSync(filePath).mtimeMs;
  if (cachedPath === filePath && cachedMtimeMs === mtimeMs) {
    return { filePath, records: cachedRecords };
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  const rows = Array.isArray(raw) ? raw : [];
  cachedRecords = normalizeOfficialRecords(rows);
  cachedPath = filePath;
  cachedMtimeMs = mtimeMs;

  return { filePath, records: cachedRecords };
}

export function clearOfficialTruthCache(): void {
  cachedPath = null;
  cachedMtimeMs = -1;
  cachedRecords = [];
}

export function getOfficialMatchResponse(matchId: string): OfficialMatchResponse | null {
  const { records } = loadOfficialMatches();
  const record = records.find((item) => item.matchId === matchId);
  if (!record) {
    return null;
  }

  const { confidence, ...officialMatchRecord } = record;
  const officialMatchRecordWire = {
    match_id: officialMatchRecord.matchId,
    home_team: officialMatchRecord.homeTeam,
    away_team: officialMatchRecord.awayTeam,
    score_90min: officialMatchRecord.score90Min,
    stage: officialMatchRecord.stage,
    match_date: officialMatchRecord.matchDate,
    is_extra_time: officialMatchRecord.isExtraTime,
    is_penalty: officialMatchRecord.isPenalty,
    source: officialMatchRecord.source
  };

  return {
    officialMatchRecord,
    official_match_record: officialMatchRecordWire,
    sourceUsed: officialMatchRecord.source,
    source_used: officialMatchRecord.source,
    confidence,
    truthLayer: "Official Football Truth Layer",
    truth_layer: "Official Football Truth Layer"
  };
}

export function getOfficialTruthStatus(): OfficialTruthStatus {
  const { filePath, records } = loadOfficialMatches();
  const sourceCounts: Record<OfficialMatchSource, number> = {
    fifa: 0,
    uefa: 0,
    kaggle: 0
  };

  for (const record of records) {
    sourceCounts[record.source] += 1;
  }

  return {
    available: records.length > 0,
    recordCount: records.length,
    sourceCounts,
    filePath,
    truthLayer: "Official Football Truth Layer"
  };
}
