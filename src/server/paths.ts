import "server-only";
import path from "node:path";

/** Where local files live: uploaded images, and db.json when the JSON file store is in use. */
export function dataDir(): string {
  return process.env.CMS_DATA_DIR?.trim() || path.join(process.cwd(), "data");
}

export function uploadsDir(): string {
  return path.join(dataDir(), "uploads");
}
