import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./paths";
import { seedDatabase } from "./seed";
import type { Database } from "./store";

/**
 * JSON file store (data/db.json). Used only when no MongoDB connection is configured, so the prototype still runs
 * with nothing to set up. Limits: one process, one machine, whole file rewritten per change.
 */

const dbFile = () => path.join(dataDir(), "db.json");

/** Written to a temporary file first, then renamed, so a crash mid-write cannot leave a half-written database. */
export function saveJson(db: Database) {
  const file = dbFile();
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 1));
  renameSync(tmp, file);
}

export function loadJson(): Database {
  const file = dbFile();
  if (!existsSync(file)) {
    mkdirSync(dataDir(), { recursive: true });
    const seeded = seedDatabase();
    saveJson(seeded);
    return seeded;
  }
  return JSON.parse(readFileSync(file, "utf8")) as Database;
}
