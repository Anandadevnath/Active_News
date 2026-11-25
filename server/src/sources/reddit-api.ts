import { config } from "../config.js";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";
const TIMEOUT_MS = 20_000;
const EXPIRY_MARGIN_MS = 60_000;
// Reddit's API rules ask for a unique, descriptive User-Agent.
const USER_AGENT = "linux:active-news:0.1 (personal news reader)";

let token: { value: string; expiresAt: number } | null = null;

export function hasRedditApi(): boolean {
  return Boolean(config.redditClientId && config.redditClientSecret);
}

/** App-only OAuth (client credentials): read-only access to public listings, no user login. */
async function accessToken(now = Date.now()): Promise<string> {
  if (token && token.expiresAt > now) return token.value;
  const basic = Buffer.from(`${config.redditClientId}:${config.redditClientSecret}`).toString("base64");
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Reddit token HTTP ${resp.status}${resp.status === 401 ? " (check REDDIT_CLIENT_ID/SECRET)" : ""}`);
  const data = (await resp.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!data.access_token) throw new Error(`Reddit token: ${data.error ?? "no access_token"}`);
  token = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS };
  return token.value;
}

/** GET an official API path such as `/r/news/hot?limit=50`. */
export async function redditApiGet<T>(pathAndQuery: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${await accessToken()}`, "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (resp.status === 401) token = null; // expired early: next call fetches a new token
  if (!resp.ok) throw new Error(`Reddit API HTTP ${resp.status}`);
  return (await resp.json()) as T;
}
