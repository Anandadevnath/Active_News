import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VENV_BIN = path.join(ROOT, ".venv", "bin");
const ENV_FILE = path.join(ROOT, "server", ".env");

// Tests never read it, so they cannot call real APIs with your keys. Real env vars win over the file.
if (!process.env.VITEST && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

/** Prefer the project's Python venv tools; fall back to whatever is on PATH. */
function venvOr(name: string): string {
  const local = path.join(VENV_BIN, name);
  return existsSync(local) ? local : name;
}

function intEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: intEnv("PORT", 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  ytDlpBin: process.env.YTDLP_BIN ?? venvOr("yt-dlp"),
  pythonBin: process.env.PYTHON_BIN ?? venvOr("python"),
  agentReachBin: process.env.AGENT_REACH_BIN ?? "agent-reach",
  quoraScript: path.join(ROOT, "scripts", "quora.py"),
  snapshotFile: path.join(ROOT, "server", ".cache", "pool.json"), // stories kept across restarts (git-ignored)
  /** Optional: a Reddit "script" app (reddit.com/prefs/apps) for the official API. */
  redditClientId: process.env.REDDIT_CLIENT_ID ?? "",
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET ?? "",
  /** Optional: your own Exa key (dashboard.exa.ai) instead of Agent Reach's shared free search. */
  exaApiKey: process.env.EXA_API_KEY ?? "",
} as const;
