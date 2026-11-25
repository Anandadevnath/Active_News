"""Quora topic page -> JSON on stdout, for the Express server (Scrapling is Python-only).

Prints {"items": [{"title", "url"}, ...]} or {"error": "..."}. Always exits 0 so the
caller reads the JSON instead of a traceback.

shortcut: generic parser (question links = quora.com paths whose text ends in '?'), written
without a live page because Quora returned 403; tune it once the page loads from your network.
"""

import json
import sys
from urllib.parse import urljoin, urlparse

TOPIC_URL = "https://www.quora.com/topic/World-News"
LIMIT = 15
SKIP_PREFIXES = ("/topic/", "/profile/", "/about", "/careers", "/contact", "/press", "/q/", "/spaces")


def parse_quora(html, base=TOPIC_URL):
    from scrapling.parser import Selector

    seen, items = set(), []
    for link in Selector(html).css("a[href]"):
        url = urljoin(base, link.attrib["href"]).split("?")[0]
        parsed = urlparse(url)
        title = " ".join(link.get_all_text().split())[:200]
        if parsed.hostname != "www.quora.com" or parsed.path.startswith(SKIP_PREFIXES):
            continue
        if not title.endswith("?") or url in seen:
            continue
        seen.add(url)
        items.append({"title": title, "url": url})
    return items[:LIMIT]


def main():
    try:
        from scrapling.fetchers import StealthyFetcher

        page = StealthyFetcher.fetch(TOPIC_URL, headless=True, network_idle=True)
        if page.status != 200:
            return {"error": f"HTTP {page.status} from Quora (blocked or login required)"}
        items = parse_quora(page.body)
        return {"items": items} if items else {"error": "Quora loaded but no questions found (layout changed or login wall)"}
    except Exception as exc:  # report to the caller as JSON, never a traceback
        return {"error": f"{type(exc).__name__}: {exc}"}


if __name__ == "__main__":
    sys.stdout.write(json.dumps(main()))
