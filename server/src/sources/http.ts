import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HTTP_TIMEOUT_MS = 20_000;
const MAX_CLI_OUTPUT = 32 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const PRIVATE_RANGES = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16]] as const)
  PRIVATE_RANGES.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 127], ["fc00::", 7], ["fe80::", 10]] as const) PRIVATE_RANGES.addSubnet(net, bits, "ipv6");
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** `maxBytes`: read at most this much and drop the rest (a link from a feed can point at a huge file). */
export async function fetchText(url: string, timeoutMs = HTTP_TIMEOUT_MS, maxBytes = Infinity): Promise<string> {
  const resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${new URL(url).hostname}`);
  return readCapped(resp, maxBytes);
}

async function readCapped(resp: Response, maxBytes: number): Promise<string> {
  if (maxBytes === Infinity || !resp.body) return resp.text();
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, maxBytes));
}

/** True for loopback, private, link-local, unique-local and unspecified addresses (incl. IPv4-mapped IPv6). */
export function isPrivateIp(ip: string): boolean {
  const mapped = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(ip);
  if (mapped) {
    const v4 = mapped[1] ?? [parseInt(mapped[2]!, 16), parseInt(mapped[3]!, 16)].flatMap((n) => [n >> 8, n & 255]).join(".");
    return PRIVATE_RANGES.check(v4, "ipv4");
  }
  const family = isIP(ip);
  if (!family) return true; // not an address we understand: refuse
  return PRIVATE_RANGES.check(ip, family === 4 ? "ipv4" : "ipv6");
}

async function assertPublicHttps(url: URL): Promise<void> {
  if (url.protocol !== "https:") throw new Error(`refused non-https URL ${url.protocol}`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(`refused private address for ${host}`);
}

/** Like fetchText, for URLs from untrusted posts: https only, public addresses only, every redirect hop re-checked.
 * shortcut: fetch re-resolves DNS after our check (rebinding window); pin the IP via an undici dispatcher if that matters. */
export async function fetchPublicText(url: string, timeoutMs = HTTP_TIMEOUT_MS, maxBytes = Infinity): Promise<string> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttps(current);
    const resp = await fetch(current, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
      signal,
      redirect: "manual",
    });
    const location = resp.headers.get("location");
    if (resp.status >= 300 && resp.status < 400 && location) {
      await resp.body?.cancel().catch(() => undefined);
      current = new URL(location, current);
      continue;
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${current.hostname}`);
    return readCapped(resp, maxBytes);
  }
  throw new Error(`too many redirects from ${new URL(url).hostname}`);
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
