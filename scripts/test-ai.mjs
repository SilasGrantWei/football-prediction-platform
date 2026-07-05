import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const aiDir = path.join(root, "services", "ai");
const localPython =
  process.platform === "win32"
    ? path.join(aiDir, ".venv", "Scripts", "python.exe")
    : path.join(aiDir, ".venv", "bin", "python");
const python = existsSync(localPython) ? localPython : process.platform === "win32" ? "python" : "python3";

const result = spawnSync(python, ["-m", "pytest"], {
  cwd: aiDir,
  stdio: "inherit"
});

process.exit(result.status ?? 1);

