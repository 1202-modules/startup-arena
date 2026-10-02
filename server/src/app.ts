import { existsSync } from "node:fs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type ErrorRequestHandler, type Response } from "express";
import type { ApiErrorResponse, HealthResponse } from "@startup-game/shared";
import type Database from "better-sqlite3";
import { ApiError } from "./api-errors.js";
import { createNextEvent, EventCreationError, finalizeCurrentEvent, getOrganizerOverview, getPublicEvent, renameCurrentEvent } from "./events/event-store.js";
import {
  abortSession,
  advanceSession,
  completeSession,
  confirmRound,
  createSession,
  getSession,
  updatePortfolio,
} from "./sessions/session-store.js";

function matchesOrganizerPassword(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export function createApp(database: Database.Database, organizerPassword?: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  const organizerTokens = new Map<string, number>();
  const downloadTickets = new Map<string, { type: "ranking.csv" | "backup.sqlite"; expires: number }>();
  function sendExport(type: "ranking.csv" | "backup.sqlite", response: Response): void {
    if (type === "backup.sqlite") {
      const snapshot = database.serialize();
      // SQLite serialization includes WAL pages; a standalone snapshot needs
      // rollback format bytes. See sqlite.org/c3ref/deserialize.html.
      snapshot[18] = 1;
      snapshot[19] = 1;
      response.type("application/octet-stream").attachment("startup-arena-backup.sqlite").send(snapshot);
      return;
    }
    const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    const rows = getPublicEvent(database).leaderboard.map(p => `${p.place},${escape(p.name)},${Math.floor(p.finalCapitalCents / 100)}.${String(p.finalCapitalCents % 100).padStart(2, "0")}`);
    response.type("text/csv; charset=utf-8").attachment("ranking.csv").send("\uFEFFPlace,Name,Capital USD\r\n" + rows.join("\r\n") + "\r\n");
  }
  app.get("/api/downloads/:ticket", (request, response, next) => {
    const ticket = downloadTickets.get(request.params.ticket!);
    downloadTickets.delete(request.params.ticket!);
    if (!ticket || ticket.expires <= Date.now()) { next(new ApiError(401, "ORGANIZER_AUTH_REQUIRED", "Download authorization expired.")); return; }
    sendExport(ticket.type, response);
  });
  function checkPassword(password: unknown): void {
    if (!organizerPassword) throw new ApiError(503, "ORGANIZER_PASSWORD_NOT_CONFIGURED", "Organizer password is not configured.");
    if (typeof password !== "string" || password.length === 0 || password.length > 1024) throw new ApiError(400, "VALIDATION_ERROR", "A valid password is required.");
    if (!matchesOrganizerPassword(password, organizerPassword)) throw new ApiError(401, "INVALID_ORGANIZER_PASSWORD", "Organizer password is incorrect.");
  }
  app.post("/api/organizer/login", (request, response, next) => {
    try {
      checkPassword(request.body?.password);
      for (const [token, expires] of organizerTokens) if (expires <= Date.now()) organizerTokens.delete(token);
      const token = randomBytes(32).toString("hex");
      organizerTokens.set(token, Date.now() + 15 * 60 * 1000);
      response.json({ token, expiresInSeconds: 900 });
    } catch (error) { next(error); }
  });
  app.use("/api/organizer", (request, _response, next) => {
    const token = request.get("authorization")?.replace(/^Bearer /, "");
    if (!token || (organizerTokens.get(token) ?? 0) <= Date.now()) { next(new ApiError(401, "ORGANIZER_AUTH_REQUIRED", "Organizer sign-in is required.")); return; }
    next();
  });
  app.get("/api/organizer", (_request, response) => response.json(getOrganizerOverview(database)));
  app.patch("/api/organizer/event", (request, response, next) => {
    try { renameCurrentEvent(database, request.body?.title); response.json(getOrganizerOverview(database)); } catch (error) { next(error); }
  });
  app.post("/api/organizer/event/new", (request, response, next) => {
    try {
      database.transaction(() => { createNextEvent(database); if (request.body?.title !== undefined) renameCurrentEvent(database, request.body.title); }).immediate();
      response.status(201).json(getOrganizerOverview(database));
    } catch (error) { next(error instanceof EventCreationError ? new ApiError(409, "INVALID_STATE", error.message) : error); }
  });
  app.post("/api/organizer/downloads", (request, response, next) => {
    const type = request.body?.type;
    if (type !== "ranking.csv" && type !== "backup.sqlite") { next(new ApiError(400, "VALIDATION_ERROR", "Unknown export type.")); return; }
    for (const [id, ticket] of downloadTickets) if (ticket.expires <= Date.now()) downloadTickets.delete(id);
    const id = randomBytes(32).toString("hex");
    const token = request.get("authorization")!.replace(/^Bearer /, "");
    downloadTickets.set(id, { type, expires: Math.min(Date.now() + 60000, organizerTokens.get(token)!) });
    response.status(201).json({ path: `/api/downloads/${id}` });
  });
  app.get("/api/organizer/ranking.csv", (_request, response) => sendExport("ranking.csv", response));
  app.get("/api/organizer/backup.sqlite", (_request, response) => sendExport("backup.sqlite", response));

  app.get("/api/health", (_request, response) => {
    const body: HealthResponse = { status: "ok" };
    response.json(body);
  });

  app.get("/api/event", (_request, response) => {
    response.json(getPublicEvent(database));
  });

  app.post("/api/event/finalize", (request, response, next) => {
    try {
      if (!organizerPassword) {
        response.status(503).json({ error: { code: "ORGANIZER_PASSWORD_NOT_CONFIGURED", message: "Organizer password is not configured." } } satisfies ApiErrorResponse);
        return;
      }
      const password: unknown = request.body && typeof request.body === "object" ? request.body.password : undefined;
      if (typeof password !== "string" || password.length === 0 || password.length > 1024) {
        throw new ApiError(400, "VALIDATION_ERROR", "A valid organizer password is required.");
      }
      if (!matchesOrganizerPassword(password, organizerPassword)) {
        throw new ApiError(401, "INVALID_ORGANIZER_PASSWORD", "Organizer password is incorrect.");
      }
      finalizeCurrentEvent(database);
      response.json(getPublicEvent(database));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions", (request, response, next) => {
    try {
      response.status(201).json(createSession(database, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions/:id", (request, response, next) => {
    try {
      response.json(getSession(database, request.params.id!));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/sessions/:id/portfolio", (request, response, next) => {
    try {
      response.json(updatePortfolio(database, request.params.id!, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/rounds/:round/confirm", (request, response, next) => {
    try {
      response.json(confirmRound(database, request.params.id!, request.params.round!));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/next", (request, response, next) => {
    try {
      response.json(advanceSession(database, request.params.id!));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:id/complete", (request, response, next) => {
    try {
      response.json(completeSession(database, request.params.id!));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/sessions/:id", (request, response, next) => {
    try {
      abortSession(database, request.params.id!);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (_request, response) => {
    const body: ApiErrorResponse = {
      error: {
        code: "NOT_FOUND",
        message: "API route not found.",
      },
    };
    response.status(404).json(body);
  });

  const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
  const clientBuildDirectory = resolve(currentDirectory, "../../client/dist");

  if (existsSync(clientBuildDirectory)) {
    app.use(express.static(clientBuildDirectory, { index: false }));
    app.use((request, response, next) => {
      if (request.method !== "GET" || !request.accepts("html")) {
        next();
        return;
      }

      response.sendFile(resolve(clientBuildDirectory, "index.html"));
    });
  }

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    } satisfies ApiErrorResponse);
  });

  const safeErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof ApiError) {
      response.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
        },
      } satisfies ApiErrorResponse);
      return;
    }

    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed") {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body must contain valid JSON.",
        },
      } satisfies ApiErrorResponse);
      return;
    }

    const errorType = error instanceof Error ? error.name : "UnknownError";
    console.error(`[server] request failed (${errorType})`);

    response.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    } satisfies ApiErrorResponse);
  };

  app.use(safeErrorHandler);
  return app;
}
