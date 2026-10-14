// Starts a real MongoDB server on this computer for TESTING the MongoDB store without an Atlas account.
// It is not Atlas and proves nothing about Atlas access, network rules or credentials.
//
//   npm run mongo:local            (leave it running; Ctrl+C stops it)
//
// The server program is downloaded once into this project's node_modules/.cache. Its data is kept in
// data/mongo-local so it survives restarts. It listens on 127.0.0.1 only and has no password.
// To use it, put these two lines in .env.local:
//   MONGODB_URI=mongodb://127.0.0.1:27018
//   MONGODB_DB=blog_cms_local_test
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(process.env.CMS_DATA_DIR?.trim() || path.join(root, "data"), "mongo-local");
mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1", port: 27018, dbPath, storageEngine: "wiredTiger" }, binary: { downloadDir: path.join(root, "node_modules", ".cache", "mongodb-memory-server") } });
console.log(`Local test MongoDB is running at ${server.getUri().replace(/\/$/, "")}   (data: ${dbPath})`);
console.log("Press Ctrl+C to stop it.");

const stop = async () => {
  await server.stop({ doCleanup: false }).catch(() => undefined);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => undefined, 1 << 30);
