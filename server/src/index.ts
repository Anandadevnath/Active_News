import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createApp } from "./app.js";
import { config } from "./config.js";
import { Searcher } from "./search.js";
import { SOURCES } from "./sources/index.js";
import { NewsStore } from "./store.js";

const store = new NewsStore(SOURCES);
store.on("status", (s) => {
  if (!s.refreshing) console.log(`[${s.platform}] ${s.error ? `FAILED: ${s.error}` : `${s.count} stories`}`);
});
store.on("new", ({ platform, added }) => console.log(`[${platform}] +${added} new`));

const SNAPSHOT_EVERY_MS = 2 * 60_000;
try {
  store.restore(JSON.parse(readFileSync(config.snapshotFile, "utf8")));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.error(`[snapshot] not restored: ${err instanceof Error ? err.message : err}`);
}
const saveSnapshot = () => {
  try {
    mkdirSync(path.dirname(config.snapshotFile), { recursive: true });
    writeFileSync(`${config.snapshotFile}.tmp`, JSON.stringify(store.snapshot()));
    renameSync(`${config.snapshotFile}.tmp`, config.snapshotFile); // never leave a half-written file
  } catch (err) {
    console.error(`[snapshot] not saved: ${err instanceof Error ? err.message : err}`);
  }
};
setInterval(saveSnapshot, SNAPSHOT_EVERY_MS).unref();

const server = createApp(store, new Searcher(store, SOURCES), config.webOrigin).listen(config.port, config.host, () => {
  console.log(`Active News API on http://${config.host}:${config.port} (web origin ${config.webOrigin})`);
  store.start();
});

const shutdown = () => {
  store.stop();
  saveSnapshot();
  server.close(() => process.exit(0));
  server.closeAllConnections(); // SSE streams never end on their own
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
