import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type CheckpointState = {
  requested: number;
  completed: number;
};

export class PredictionRefreshCheckpoint {
  private state: CheckpointState;

  constructor(private readonly path = defaultCheckpointPath()) {
    this.state = loadCheckpoint(path);
  }

  request(): number {
    this.state.requested += 1;
    this.persist();
    return this.state.requested;
  }

  complete(version: number): void {
    this.state.completed = Math.max(this.state.completed, Math.min(version, this.state.requested));
    this.persist();
  }

  hasPending(): boolean {
    return this.state.requested > this.state.completed;
  }

  requestedVersion(): number {
    return this.state.requested;
  }

  private persist(): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }
}

function defaultCheckpointPath(): string | undefined {
  const configured = process.env.BRACKET_PREDICTION_REFRESH_STATE_PATH?.trim();
  if (configured) return resolve(configured);
  if (process.env.NODE_ENV === "test") return undefined;
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../data/runtime/bracket-prediction-refresh.json");
}

function loadCheckpoint(path?: string): CheckpointState {
  if (!path || !existsSync(path)) return { requested: 0, completed: 0 };

  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<CheckpointState>;
    const requested = Number(value.requested);
    const completed = Number(value.completed);
    if (!Number.isInteger(requested) || requested < 0 || !Number.isInteger(completed) || completed < 0) {
      return { requested: 0, completed: 0 };
    }
    return { requested, completed: Math.min(completed, requested) };
  } catch {
    return { requested: 0, completed: 0 };
  }
}
