import "dotenv/config";
import pino from "pino";

import { db } from "./db";
import { projects } from "./schema";

const logger = pino({
  transport: { target: "pino-pretty", options: { colorize: true } },
});

// One-off maintenance script: remove all projects so the expanded
// seed-content can repopulate the full 12-concept set. Safe to re-run.
const clearProjects = async (): Promise<void> => {
  logger.info("Deleting all existing projects...");
  await db.delete(projects);
  logger.info("All projects deleted. Run db:seed-content next.");
};

clearProjects().catch((err: unknown) => {
  const error = err as Error;
  logger.error("Clearing projects failed:", error);
  process.exit(1);
});
