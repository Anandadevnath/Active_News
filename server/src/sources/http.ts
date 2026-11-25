import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HTTP_TIMEOUT_MS = 20_000;
const MAX_CLI_OUTPUT = 32 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

export async function fetchText(url: string, timeoutMs = HTTP_TIMEOUT_MS): Promise<string> {
  const resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${new URL(url).hostname}`);
  return resp.text();
}

export async function fetchJson<T>(url: string, timeoutMs = HTTP_TIMEOUT_MS): Promise<T> {
  return JSON.parse(await fetchText(url, timeoutMs)) as T;
}

/** Run a CLI without a shell (args are passed as-is, no injection) and return stdout. */
export async function runCli(bin: string, args: readonly string[], timeoutMs: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync(bin, [...args], { timeout: timeoutMs, maxBuffer: MAX_CLI_OUTPUT });
    return stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean };
    if (e.stdout?.trim()) return e.stdout; // agent-reach exits non-zero but still prints its JSON error
    if (e.code === "ENOENT") throw new Error(`${bin} not found; see README setup`);
    if (e.killed) throw new Error(`${bin} timed out after ${timeoutMs / 1000}s`);
    throw new Error(`${bin} failed: ${(e.stderr ?? e.message).trim().slice(0, 200)}`);
  }
}
