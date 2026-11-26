import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// No-nonce CSP (keeps the page static). Embeds only from youtube-nocookie; data only from our API.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "media-src https:",
  "font-src 'self'",
  "frame-src https://www.youtube-nocookie.com",
  `connect-src 'self' ${apiUrl}${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // video.twimg.com (X videos) answers 403 to any Referer; the YouTube iframe sets its own policy, since YouTube needs one
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
