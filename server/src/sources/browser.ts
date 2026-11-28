import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { config } from "../config.js";

const execFileAsync = promisify(execFile);
const STATUS_TIMEOUT_MS = 20_000;
const ENV_TTL_MS = 4 * 60_000;

interface BrowserStatus {
  ok: boolean;
  result?: { running?: boolean; opencli_context?: string | null };
}

let cachedEnv: { at: number; env: Record<string, string> } | null = null;

/**
 * The Agent Reach dedicated browser's OpenCLI binding, so direct `opencli <site>` reads run in the
 * same logged-in session Agent Reach uses (X/Twitter's, Instagram's, ...). The context id changes
 * when the browser restarts, so the binding is re-read from `agent-reach browser status` every few
 * minutes. The browser stays warm: the X/Twitter source refreshes through Agent Reach on its own.
 */
async function reachBrowserEnv(): Promise<Record<string, string>> {
  if (cachedEnv && Date.now() - cachedEnv.at < ENV_TTL_MS) return cachedEnv.env;
  const { stdout } = await execFileAsync(config.agentReachBin, ["browser", "status"], {
    timeout: STATUS_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  const status = JSON.parse(stdout) as BrowserStatus;
  const context = status.result?.opencli_context;
  if (!status.ok || !status.result?.running || !context)
    throw new Error("Agent Reach browser is not running; it opens when an Agent Reach platform refreshes");
  const env = {
    OPENCLI_PROFILE: context,
    OPENCLI_WINDOW: "background",
    OPENCLI_CDP_ENDPOINT: "",
    OPENCLI_CDP_TARGET: "",
  };
  cachedEnv = { at: Date.now(), env };
  return env;
}

/** One row of `opencli <site> <action> -f json` output: whatever columns the site adapter maps. */
export interface OpenCliRow {
  [key: string]: unknown;
}

/** Run one read-only `opencli <site>` command inside the shared Agent Reach browser; returns its JSON rows. */
export async function runOpenCli(site: string, args: readonly string[], timeoutMs: number): Promise<OpenCliRow[]> {
  const env = await reachBrowserEnv();
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(config.opencliBin, [site, ...args, "-f", "json"], {
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, ...env },
    }));
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean };
    if (e.code === "ENOENT") throw new Error("opencli not found; see README setup");
    // opencli prints its error block to stderr, unlike agent-reach which uses stdout.
    const detail = (e.stdout?.trim() || e.stderr?.trim() || e.message || "").slice(0, 300);
    // Site adapters say "make sure you are logged in" — surface it like Agent Reach's NEED_LOGIN.
    if (/logged in/i.test(detail)) throw new Error(`NEED_LOGIN: ${detail}`);
    if (e.killed) throw new Error(`opencli ${site} timed out after ${timeoutMs / 1000}s`);
    throw new Error(`opencli ${site} failed: ${detail || "unknown error"}`);
  }
  const rows = JSON.parse(stdout) as OpenCliRow[] | { rows?: OpenCliRow[] };
  return Array.isArray(rows) ? rows : (rows.rows ?? []);
}
