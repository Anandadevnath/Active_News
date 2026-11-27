import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";

import "./globals.css";

const sans = Geist({ variable: "--font-geist", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Active News",
  description: "Everything being posted right now on YouTube, Reddit, Hacker News, 4chan, X, Bluesky, Mastodon, Lemmy and news sites, on every interest, in one feed.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} scheme-dark [scrollbar-color:rgb(255_255_255/0.2)_transparent]`}>
      <body className="min-h-dvh bg-ink font-sans text-[15px] leading-normal text-zinc-100 antialiased selection:bg-sky-400/30 selection:text-white">{children}</body>
    </html>
  );
}
