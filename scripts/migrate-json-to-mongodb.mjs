// Copies the records in data/db.json into MongoDB.
//
//   npm run migrate:mongodb -- --dry-run     show what would be copied, write nothing
//   npm run migrate:mongodb                  copy
//
// Safe by design:
// - data/db.json is only read. It is never changed, moved or deleted, and its checksum is compared before and after.
// - A record is inserted only if no record with the same id exists yet. Records already in MongoDB are never
//   overwritten, so running this again adds nothing and cannot undo edits made since.
// - Uploaded image files are not moved: they stay in data/uploads. Only their records are copied.
// - The connection string is read from MONGODB_URI and is never printed.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  const full = path.join(root, file);
  if (existsSync(full)) process.loadEnvFile(full); // variables already set are kept
}

const dryRun = process.argv.includes("--dry-run");
const uri = process.env.MONGODB_URI?.trim() ?? "";
const dbName = process.env.MONGODB_DB?.trim() ?? "";
const source = path.join(process.env.CMS_DATA_DIR?.trim() || path.join(root, "data"), "db.json");

const stop = (message) => {
  console.error(message);
  process.exit(1);
};
if (!/^mongodb(\+srv)?:\/\/\S+$/.test(uri)) stop("MONGODB_URI is not set to a MongoDB connection string. Put it in .env.local (see .env.example).");
if (!/^[A-Za-z0-9_-]{1,38}$/.test(dbName)) stop("MONGODB_DB is not set to a valid database name. Put it in .env.local (see .env.example).");
if (!existsSync(source)) stop(`Nothing to migrate: ${source} does not exist.`);

const checksum = () => createHash("sha256").update(readFileSync(source)).digest("hex");
const before = checksum();
const data = JSON.parse(readFileSync(source, "utf8"));

// Keep in step with INDEXES in src/server/store-mongo.ts.
const INDEXES = [
  ["posts", { siteId: 1, slug: 1 }, { unique: true, name: "site_slug_unique" }],
  ["posts", { siteId: 1, status: 1, publishAt: -1 }, { name: "site_status_publishAt" }],
  ["categories", { siteId: 1, slug: 1 }, { unique: true, name: "site_slug_unique" }],
  ["sites", { key: 1 }, { unique: true, name: "key_unique" }],
  ["media", { siteId: 1 }, { name: "site" }],
  ["media", { publicId: 1 }, { unique: true, name: "public_id_unique", partialFilterExpression: { publicId: { $type: "string" } } }],
  ["audit", { at: -1 }, { name: "at_desc" }],
];
// Websites first, then what belongs to them.
const COLLECTIONS = ["sites", "categories", "authors", "media", "posts", "audit"];
const label = (name, doc) => (name === "posts" || name === "categories" ? `${doc.siteId} / ${doc.slug}` : name === "sites" ? doc.key : doc.id);

console.log(`Source: ${source}`);
console.log(`Target: MongoDB database "${dbName}"${dryRun ? "   (DRY RUN: nothing will be written)" : ""}\n`);

const client = new MongoClient(uri, { appName: "multi-site-blog-cms-migration", serverSelectionTimeoutMS: 10000, ignoreUndefined: true });
let failed = false;
try {
  await client.connect();
  const db = client.db(dbName);
  if (!dryRun) for (const [name, keys, options] of INDEXES) await db.collection(name).createIndex(keys, options);

  for (const name of COLLECTIONS) {
    const records = data[name] ?? [];
    const collection = db.collection(name);
    const present = new Set((await collection.find({ _id: { $in: records.map((r) => r.id) } }, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
    let inserted = 0;
    const conflicts = [];
    for (const { id, ...rest } of records) {
      if (present.has(id)) continue;
      if (dryRun) {
        inserted++;
        continue;
      }
      try {
        const result = await collection.updateOne({ _id: id }, { $setOnInsert: rest }, { upsert: true });
        if (result.upsertedCount) inserted++;
      } catch (err) {
        if (err?.code !== 11000) throw err;
        // A different record already uses this website + slug (or website key). It is left alone.
        conflicts.push(label(name, { id, ...rest }));
      }
    }
    const total = dryRun ? null : await collection.countDocuments();
    console.log(`${name.padEnd(11)} in file: ${String(records.length).padStart(4)}   ${dryRun ? "would copy" : "copied now"}: ${String(inserted).padStart(4)}   already there: ${String(present.size).padStart(4)}   refused: ${conflicts.length}${total === null ? "" : `   now in database: ${total}`}`);
    for (const c of conflicts) console.log(`   refused (a different record already uses it): ${c}`);
    if (conflicts.length) failed = true;
  }

  if (!dryRun) {
    // Every article in the file must now be in the database under the same id, website and slug.
    const stored = new Map((await db.collection("posts").find({ _id: { $in: data.posts.map((p) => p.id) } }, { projection: { siteId: 1, slug: 1, status: 1, title: 1 } }).toArray()).map((d) => [d._id, d]));
    const missing = data.posts.filter((p) => !stored.has(p.id));
    const changed = data.posts.filter((p) => stored.has(p.id) && (stored.get(p.id).title !== p.title || stored.get(p.id).status !== p.status || stored.get(p.id).slug !== p.slug));
    console.log(`\nCheck: ${data.posts.length - missing.length} of ${data.posts.length} articles from the file are in the database.`);
    if (changed.length) console.log(`Note: ${changed.length} of them differ from the file because they were edited in the database since. They were left as they are.`);
    if (missing.length) failed = true;
  }
} catch (err) {
  // Only the kind of error is shown: driver messages can include server addresses.
  console.error(`\nMigration stopped: ${err?.name ?? "Error"}${err?.code !== undefined ? ` (code ${err.code})` : ""}. Check MONGODB_URI, the database user's permissions and the Atlas network access list.`);
  failed = true;
} finally {
  await client.close().catch(() => undefined);
}

console.log(checksum() === before ? "Source file unchanged (checksum identical before and after)." : "WARNING: the source file changed while this ran. Was the CMS running on the JSON store at the same time?");
process.exit(failed ? 1 : 0);
