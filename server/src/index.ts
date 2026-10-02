import { config } from "./config.js";
import { createApp } from "./app.js";
import { openDatabase } from "./db/database.js";
import { ensureCurrentEvent } from "./events/event-store.js";

const database = openDatabase(config.databasePath);
ensureCurrentEvent(database);
const app = createApp(database, config.organizerPassword);

const server = app.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`);
});

let isShuttingDown = false;
const shutdown = (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[server] received ${signal}; closing`);

  if (typeof server.closeIdleConnections === "function") {
    server.closeIdleConnections();
  }

  const forceExitTimer = setTimeout(() => {
    console.error("[server] graceful shutdown timed out, closing database and exiting");
    database.close();
    process.exit(1);
  }, 8000);
  forceExitTimer.unref();

  server.close(() => {
    database.close();
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
