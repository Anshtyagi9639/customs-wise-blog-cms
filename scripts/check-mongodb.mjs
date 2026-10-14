// Checks the MongoDB connection the CMS will use, without printing the connection string.
//
//   npm run check:mongodb
//
// It confirms: the server can be reached, the database user can read and write, the indexes exist, and the database
// itself refuses a duplicate slug on one website while allowing the same slug on another.
// The uniqueness test uses three temporary records under made-up website ids and removes them again.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  const full = path.join(root, file);
  if (existsSync(full)) process.loadEnvFile(full);
}
const uri = process.env.MONGODB_URI?.trim() ?? "";
const dbName = process.env.MONGODB_DB?.trim() ?? "";
if (!/^mongodb(\+srv)?:\/\/\S+$/.test(uri) || !/^[A-Za-z0-9_-]{1,38}$/.test(dbName)) {
  console.error("MONGODB_URI and MONGODB_DB must be set in .env.local (see .env.example).");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
};

const client = new MongoClient(uri, { appName: "multi-site-blog-cms-check", serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db(dbName);
  await db.command({ ping: 1 });
  check("the server answers", true);
  // Atlas servers answer the "atlasVersion" command; other MongoDB servers do not have it.
  const atlas = await client.db("admin").command({ atlasVersion: 1 }).then(
    () => true,
    () => false,
  );
  const local = /\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(uri);
  console.log(`        database "${dbName}" on ${atlas ? "MongoDB Atlas (the server identifies itself as Atlas)" : local ? "a MongoDB server on THIS COMPUTER (not Atlas)" : "a MongoDB server that does not identify itself as Atlas"}`);
  const roles = await client.db("admin").command({ connectionStatus: 1 }).then(
    (r) => r.authInfo?.authenticatedUserRoles ?? [],
    () => [],
  );
  if (roles.some((r) => /admin|root|AnyDatabase/i.test(r.role))) console.log(`        note: this database user has a broad role (${roles.map((r) => r.role).join(", ")}). A user with only "readWrite" on "${dbName}" is safer.`);

  const counts = {};
  for (const name of ["sites", "categories", "authors", "posts", "media", "audit"]) counts[name] = await db.collection(name).countDocuments();
  console.log(`        records: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);

  const posts = db.collection("posts");
  const indexes = await posts.indexes().catch(() => []);
  const slugIndex = indexes.find((i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ siteId: 1, slug: 1 }));
  check("articles have a unique index on website + slug", !!slugIndex, "start the CMS or run the migration once to create it");
  const catIndexes = await db.collection("categories").indexes().catch(() => []);
  check("categories have a unique index on website + slug", catIndexes.some((i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ siteId: 1, slug: 1 })));
  const siteIndexes = await db.collection("sites").indexes().catch(() => []);
  check("websites have a unique index on key", siteIndexes.some((i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ key: 1 })));

  if (slugIndex) {
    const tag = `check_${Date.now().toString(36)}`;
    const ids = [`${tag}_a`, `${tag}_b`, `${tag}_c`];
    try {
      await posts.insertOne({ _id: ids[0], siteId: `${tag}_site_one`, slug: "same-slug", status: "draft", title: "temporary check record" });
      check("the database user can write", true);
      const duplicate = await posts.insertOne({ _id: ids[1], siteId: `${tag}_site_one`, slug: "same-slug", status: "draft", title: "temporary check record" }).then(
        () => "accepted",
        (err) => (err?.code === 11000 ? "refused" : `error ${err?.name}`),
      );
      check("the database refuses the same slug twice on one website", duplicate === "refused", duplicate);
      const other = await posts.insertOne({ _id: ids[2], siteId: `${tag}_site_two`, slug: "same-slug", status: "draft", title: "temporary check record" }).then(
        () => "accepted",
        (err) => `error ${err?.name}`,
      );
      check("the database allows the same slug on a different website", other === "accepted", other);
    } finally {
      const removed = await posts.deleteMany({ _id: { $in: ids } });
      check("the temporary check records were removed", (await posts.countDocuments({ _id: { $in: ids } })) === 0, `${removed.deletedCount} removed`);
    }
  }
} catch (err) {
  check("the server answers", false, `${err?.name ?? "Error"}${err?.code !== undefined ? ` code ${err.code}` : ""}`);
  console.log("        Check the connection string, the database user's password and permissions, and the Atlas network access list.");
} finally {
  await client.close().catch(() => undefined);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
