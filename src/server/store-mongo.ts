import "server-only";
import { type AnyBulkWriteOperation, type Db, MongoClient } from "mongodb";
import { seedDatabase } from "./seed";
import type { Database } from "./store";
import { StoreConflictError, StoreUnavailableError } from "./store-errors";

/**
 * MongoDB store (MongoDB Atlas in production use; any MongoDB server for testing).
 *
 * One collection per record type. A record's `id` is stored as the document's `_id`, so ids are the same in the JSON
 * file, in MongoDB and in the API, and importing the same record twice cannot create a duplicate.
 *
 * Rules the database itself enforces (see INDEXES): an article slug is unique within a website, a category slug is
 * unique within a website, and a website key is unique. The application checks these first to give a helpful
 * message; the indexes are the guarantee when two saves race or more than one copy of the app is running.
 *
 * The connection string and database name come from MONGODB_URI and MONGODB_DB on the server only. Neither is ever
 * logged, returned by an API or sent to the browser.
 */

type Doc = { _id: string } & Record<string, unknown>;
export type Snapshot = Record<RecordCollection, Map<string, string>>;

/** Written in this order: articles first, so a refused slug stops the save before anything else is written. */
const RECORD_COLLECTIONS = ["posts", "sites", "categories", "authors", "media"] as const;
type RecordCollection = (typeof RECORD_COLLECTIONS)[number];
const AUDIT_KEPT_IN_MEMORY = 500;

const INDEXES: { collection: string; keys: Record<string, 1 | -1>; unique?: boolean; name: string; onlyWhere?: Record<string, unknown> }[] = [
  { collection: "posts", keys: { siteId: 1, slug: 1 }, unique: true, name: "site_slug_unique" },
  { collection: "posts", keys: { siteId: 1, status: 1, publishAt: -1 }, name: "site_status_publishAt" },
  { collection: "categories", keys: { siteId: 1, slug: 1 }, unique: true, name: "site_slug_unique" },
  { collection: "sites", keys: { key: 1 }, unique: true, name: "key_unique" },
  { collection: "media", keys: { siteId: 1 }, name: "site" },
  // One record per hosted image. Local images have no publicId and are not covered by this rule.
  { collection: "media", keys: { publicId: 1 }, unique: true, name: "public_id_unique", onlyWhere: { publicId: { $type: "string" } } },
  { collection: "audit", keys: { at: -1 }, name: "at_desc" },
];

function config(): { uri: string; name: string } {
  const uri = process.env.MONGODB_URI?.trim() ?? "";
  const name = process.env.MONGODB_DB?.trim() ?? "";
  if (!/^mongodb(\+srv)?:\/\/\S+$/.test(uri)) throw new StoreUnavailableError("MONGODB_URI is not set to a MongoDB connection string.");
  if (!/^[A-Za-z0-9_-]{1,38}$/.test(name)) throw new StoreUnavailableError("MONGODB_DB must be a database name of letters, numbers, hyphens or underscores.");
  return { uri, name };
}

/** Logs what kind of failure happened and nothing else: driver messages can contain host names. */
function unavailable(err: unknown, during: string): StoreUnavailableError {
  if (err instanceof StoreUnavailableError) return err;
  const e = err as { name?: unknown; code?: unknown; codeName?: unknown };
  console.error(`[store] MongoDB ${during} failed: ${String(e?.name ?? "Error")}${e?.code !== undefined ? ` code=${String(e.code)}` : ""}${e?.codeName ? ` (${String(e.codeName)})` : ""}`);
  return new StoreUnavailableError();
}

const isDuplicateKey = (err: unknown) => (err as { code?: unknown })?.code === 11000;

// One client per process, kept on globalThis so development reloads and every request reuse the same connection pool.
const KEY = Symbol.for("cms.store.mongodb");
const g = globalThis as typeof globalThis & { [KEY]?: Promise<Db> };

async function open(): Promise<Db> {
  const { uri, name } = config();
  const client = new MongoClient(uri, { appName: "multi-site-blog-cms", maxPoolSize: 10, serverSelectionTimeoutMS: 8000, ignoreUndefined: true });
  try {
    await client.connect();
    const db = client.db(name);
    for (const index of INDEXES) await db.collection(index.collection).createIndex(index.keys, { unique: index.unique ?? false, name: index.name, ...(index.onlyWhere ? { partialFilterExpression: index.onlyWhere } : {}) });
    await seedIfEmpty(db);
    return db;
  } catch (err) {
    await client.close().catch(() => undefined);
    throw unavailable(err, "connection");
  }
}

function database(): Promise<Db> {
  if (!g[KEY]) {
    const attempt = open();
    g[KEY] = attempt;
    // A failed attempt is forgotten so the next request tries again instead of failing for ever.
    attempt.catch(() => {
      if (g[KEY] === attempt) g[KEY] = undefined;
    });
  }
  return g[KEY];
}

/** A brand-new database gets the two test website configurations. Existing data is never touched. */
async function seedIfEmpty(db: Db) {
  if ((await db.collection("sites").countDocuments({}, { limit: 1 })) > 0) return;
  const seed = seedDatabase();
  for (const name of RECORD_COLLECTIONS) {
    const ops = seed[name].map(({ id, ...rest }): AnyBulkWriteOperation<Doc> => ({ updateOne: { filter: { _id: id }, update: { $setOnInsert: rest }, upsert: true } }));
    if (ops.length) await db.collection<Doc>(name).bulkWrite(ops, { ordered: false });
  }
}

const fromDocs = <T>(docs: Doc[]) => docs.map(({ _id, ...rest }) => ({ id: _id, ...rest }) as T);

export async function loadMongo(): Promise<Database> {
  const db = await database();
  try {
    const all = (name: string) => db.collection<Doc>(name).find().toArray();
    const [sites, categories, authors, posts, media, auditLog] = await Promise.all([
      all("sites"),
      all("categories"),
      all("authors"),
      all("posts"),
      all("media"),
      db.collection<Doc>("audit").find().sort({ at: -1 }).limit(AUDIT_KEPT_IN_MEMORY).toArray(),
    ]);
    return { version: 1, sites: fromDocs(sites), categories: fromDocs(categories), authors: fromDocs(authors), posts: fromDocs(posts), media: fromDocs(media), audit: fromDocs(auditLog) };
  } catch (err) {
    throw unavailable(err, "read");
  }
}

/** What each record looked like before a change, so only the records that really changed are written. */
export function snapshot(db: Database): Snapshot & { audit: Set<string> } {
  const of = (items: { id: string }[]) => new Map(items.map((item) => [item.id, JSON.stringify(item)]));
  return { posts: of(db.posts), sites: of(db.sites), categories: of(db.categories), authors: of(db.authors), media: of(db.media), audit: new Set(db.audit.map((a) => a.id)) };
}

export async function saveMongo(after: Database, before: ReturnType<typeof snapshot>): Promise<void> {
  const db = await database();
  for (const name of RECORD_COLLECTIONS) {
    const ops: AnyBulkWriteOperation<Doc>[] = [];
    const seen = new Set<string>();
    for (const item of after[name] as ({ id: string } & Record<string, unknown>)[]) {
      seen.add(item.id);
      if (before[name].get(item.id) === JSON.stringify(item)) continue;
      const { id, ...rest } = item;
      ops.push({ replaceOne: { filter: { _id: id }, replacement: rest, upsert: true } });
    }
    for (const id of before[name].keys()) if (!seen.has(id)) ops.push({ deleteOne: { filter: { _id: id } } });
    if (ops.length === 0) continue;
    try {
      await db.collection<Doc>(name).bulkWrite(ops, { ordered: true });
    } catch (err) {
      if (isDuplicateKey(err)) throw new StoreConflictError(name);
      throw unavailable(err, "write");
    }
  }
  // The activity log only grows. Older entries stay in the database even when they are no longer loaded.
  const added = after.audit.filter((a) => !before.audit.has(a.id)).map(({ id, ...rest }) => ({ _id: id, ...rest }) as Doc);
  if (added.length) {
    try {
      await db.collection<Doc>("audit").insertMany(added, { ordered: false });
    } catch (err) {
      // The change itself is saved. A missing log line must not turn a successful save into an error.
      unavailable(err, "activity log write");
    }
  }
}
