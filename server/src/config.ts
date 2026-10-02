import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: resolve(projectRoot, ".env") });

export function readHost(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "0.0.0.0";
}

function readPort(value: string | undefined): number {
  if (!value) return 3001;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

export const config = {
  host: readHost(process.env.HOST),
  port: readPort(process.env.PORT),
  databasePath: resolve(projectRoot, process.env.DATABASE_PATH ?? "./data/game.sqlite"),
  organizerPassword: process.env.ORGANIZER_PASSWORD || undefined,
};
