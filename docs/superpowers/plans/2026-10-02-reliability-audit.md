# Startup Arena Reliability Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the complete application, fix confirmed reliability defects, remove only code proven unused, verify the game, deploy the reviewed revision, and push it to GitHub.

**Architecture:** Keep the existing React/TypeScript, Express, and SQLite design. Trace client requests through API handlers, session/event stores, migrations, and tests; preserve v1 event compatibility and existing server protections. Deploy the exact verified commit after a SQLite backup.

**Tech Stack:** Node.js 22.23.2, React 19, TypeScript, Vite, Express 5, better-sqlite3, Docker Compose, Nginx, SSH, GitHub.

**Spec:** `AGENTS.md`, `DECISIONS.md`, `PRODUCT_SPEC.md`, `GAME_RULES.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `MATHEMATICAL_MODEL.md`, and `TESTING.md`.

## Global Constraints

- Every new participant starts with 100000 cents and plays exactly three rounds.
- New events use six startups and one hidden event scenario; saved v1 events retain their four-startup model and results.
- The server remains authoritative for money, transitions, and event finalization; monetary values remain integer cents.
- RU/EN behavior and future-data privacy remain intact.
- Several independent player sessions may be active in one event; finalization waits until all are completed or aborted.
- Preserve SSH login settings explicitly restored at the user's request, Fail2ban, Nginx limits, HTTPS on port 3443, and loopback-only app port 3001.
- Do not expose passwords, participant names, or production database contents in reports or test artifacts.

## Review Focus

- A failed or ambiguous abort request must not discard the only local session handle while the server may still have an active session.
- Parallel session writes and event finalization must preserve the database transaction invariants.
- Legacy v1 scenarios and migrations must remain available for saved events; delete no compatibility code without proving no stored event depends on it.
- Public projections and client assets must not expose future market outcomes or private participant portfolios.
- A failed deployment or restart must leave the production SQLite volume and other host services intact.

---

### Task 1: Audit, repair, and legacy-code review

**Files:**
- Create: `docs/implementation/19-reliability-audit.md` before code changes.
- Modify if confirmed by audit: `client/src/App.tsx`, `client/src/i18n.ts`, `client/src/api.ts`, `server/src/app.ts`, `server/src/sessions/session-store.ts`, `server/src/events/event-store.ts`, `server/src/db/migrations.ts`, `server/src/scenarios/*`, `shared/src/index.ts`, related tests, and only provably unused assets/styles.
- Modify: `IMPLEMENTATION_PLAN.md` after all stage 19 criteria pass.

**Interfaces:**
- Preserve existing API contracts and public response types unless an audited defect requires a documented correction.
- Client abort failures retain a recoverable session state; only a confirmed abort or confirmed missing session clears its stored ID.

- [x] Trace all production entry points and callers across client, shared contracts, server routes, stores, migrations, and deployment configuration; record each finding and whether it is a defect, required compatibility code, or unused code.
- [x] Add a browser regression check for failed/ambiguous session abort, demonstrate the current failure, then implement the smallest root-cause fix in the shared client flow.
- [x] Remove only files or code paths with no runtime, compatibility, build, or documentation consumer; preserve legacy v1 code used by persisted events.
- [x] Record files, behavior, deviations, and evidence in the stage 19 report.

### Task 2: Verify complete user flows and production deployment

**Files:**
- Modify: `docs/implementation/19-reliability-audit.md` with actual results.
- Modify: `IMPLEMENTATION_PLAN.md` with the verified stage 19 status.

**Interfaces:**
- Release the exact Git commit verified locally; no changes to production database schema or event data unless a concrete defect requires a separately documented migration.
- Production check uses the existing HTTPS endpoint on port 3443 and verifies that the service still listens on loopback port 3001.

- [x] Run `npm test`, `npm run typecheck`, and production build under Node.js 22.23.2; resolve failures before release.
- [x] Run the affected player abort/recovery path and the normal RU/EN game paths in a real browser; inspect screenshots for changed UI and check browser console/network errors.
- [x] Review `git diff --check`, verify only intended files changed, create a production SQLite backup, deploy the exact verified commit, and verify health plus the affected flow without adding production test participants.
- [x] Commit the completed changes and push `main` to `origin`; verify GitHub `main` contains the deployed application revision and final release report.
