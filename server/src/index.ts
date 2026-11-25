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

const server = createApp(store, new Searcher(store, SOURCES), config.webOrigin).listen(config.port, config.host, () => {
  console.log(`Active News API on http://${config.host}:${config.port} (web origin ${config.webOrigin})`);
  store.start();
});

const shutdown = () => {
  store.stop();
  server.close(() => process.exit(0));
  server.closeAllConnections(); // SSE streams never end on their own
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
