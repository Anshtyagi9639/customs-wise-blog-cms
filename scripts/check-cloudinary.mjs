// Checks the real Cloudinary account the CMS is configured to use. Never prints the API key or secret.
//
//   npm run check:cloudinary                     are the three settings present, and does Cloudinary accept them?
//   npm run check:cloudinary -- --upload-test    also upload one small test image to cms-connection-test/ and delete it
//   npm run check:cloudinary -- --orphans        list CMS uploads on Cloudinary that have no record (read-only)
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v2 as cloudinary } from "cloudinary";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  const full = path.join(root, file);
  if (existsSync(full)) process.loadEnvFile(full);
}
const NAMES = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
const [cloudName, apiKey, apiSecret] = NAMES.map((n) => process.env[n]?.trim() ?? "");

console.log("Settings in .env.local:");
for (const name of NAMES) console.log(`  ${name.padEnd(24)} ${process.env[name]?.trim() ? "set" : "MISSING"}`);
if (!cloudName || !apiKey || !apiSecret) {
  console.log("\nAdd the missing values to .env.local yourself (see docs/CLOUDINARY.md). Do not paste them anywhere else.");
  process.exit(1);
}
if (/upload_prefix=http:/i.test(process.env.CLOUDINARY_URL ?? "")) console.log("  Note: CLOUDINARY_URL sends uploads to a non-HTTPS address. That is only for the automated mock test; remove it for real use.");

const account = { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true };
const kind = (err) => `http ${err?.http_code ?? err?.error?.http_code ?? "none"}${err?.code ? `, ${err.code}` : ""}`;
let failed = false;

try {
  await cloudinary.api.ping(account);
  console.log("\nok    Cloudinary accepted the account details.");
} catch (err) {
  const http = err?.http_code ?? err?.error?.http_code;
  console.log(`\nFAIL  Cloudinary did not accept the request (${kind(err)}).`);
  console.log(http === 401 || http === 403 ? "      The cloud name, API key or API secret is wrong, or the key has been disabled." : http === 404 ? "      The cloud name was not recognised." : "      Cloudinary could not be reached. Check the internet connection.");
  process.exit(1);
}

if (process.argv.includes("--upload-test")) {
  const sample = path.join(root, "samples", "sample-cover.png");
  if (!existsSync(sample)) console.log("skip  upload test: run `npm run sample-image` first.");
  else {
    const publicId = `cms-connection-test/check-${Date.now().toString(36)}`;
    try {
      const up = await cloudinary.uploader.upload(sample, { ...account, public_id: publicId, asset_folder: "cms-connection-test", resource_type: "image", overwrite: false, tags: ["blog-cms-connection-test"] });
      console.log(`ok    Test image uploaded: ${up.public_id} (${up.width}x${up.height}), address starts with ${String(up.secure_url).slice(0, 27)}…`);
      if (!String(up.secure_url).startsWith("https://")) failed = true;
      const gone = await cloudinary.uploader.destroy(up.public_id, { ...account, resource_type: "image", invalidate: true });
      console.log(gone.result === "ok" ? "ok    Test image deleted again." : `FAIL  The test image could not be deleted (${gone.result}). Remove ${up.public_id} in the Cloudinary Media Library.`);
      if (gone.result !== "ok") failed = true;
    } catch (err) {
      console.log(`FAIL  Upload test failed (${kind(err)}). The API key may not have permission to upload.`);
      failed = true;
    }
  }
}

if (process.argv.includes("--orphans")) {
  // Every CMS upload carries the tag "blog-cms". Anything with that tag and no record is an orphan.
  const recorded = new Set();
  if (process.env.MONGODB_URI?.trim() && process.env.CMS_STORE?.trim().toLowerCase() !== "json") {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(process.env.MONGODB_URI.trim(), { serverSelectionTimeoutMS: 10000 });
    try {
      await client.connect();
      for (const m of await client.db(process.env.MONGODB_DB?.trim()).collection("media").find({ publicId: { $type: "string" } }, { projection: { publicId: 1 } }).toArray()) recorded.add(m.publicId);
    } catch (err) {
      console.log(`FAIL  The media records could not be read from MongoDB (${err?.name ?? "Error"}).`);
      process.exit(1);
    } finally {
      await client.close().catch(() => undefined);
    }
  } else {
    const file = path.join(process.env.CMS_DATA_DIR?.trim() || path.join(root, "data"), "db.json");
    for (const m of existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).media : []) if (m.publicId) recorded.add(m.publicId);
  }
  const onCloudinary = [];
  let cursor;
  do {
    const page = await cloudinary.api.resources_by_tag("blog-cms", { ...account, resource_type: "image", max_results: 500, next_cursor: cursor });
    onCloudinary.push(...page.resources.map((r) => r.public_id));
    cursor = page.next_cursor;
  } while (cursor);
  const orphans = onCloudinary.filter((id) => !recorded.has(id));
  const missing = [...recorded].filter((id) => !onCloudinary.includes(id));
  console.log(`\nCMS uploads on Cloudinary: ${onCloudinary.length}. Records pointing at Cloudinary: ${recorded.size}.`);
  console.log(orphans.length ? `Assets with no record (${orphans.length}). Nothing was deleted; remove them in the Media Library if they are not needed:\n${orphans.map((o) => `  ${o}`).join("\n")}` : "No orphaned assets.");
  if (missing.length) console.log(`Records whose asset is missing on Cloudinary (${missing.length}):\n${missing.map((o) => `  ${o}`).join("\n")}`);
}
process.exit(failed ? 1 : 0);
