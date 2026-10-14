// End-to-end test against the REAL services configured in .env.local: MongoDB (Atlas) and Cloudinary.
// It creates a small number of clearly named test records and one test image per website, and removes exactly
// those again. It never touches any other article, record or Cloudinary asset.
//
//   npm run test:live                 create, edit, upload, publish, check          (leaves the test records in place)
//   npm run test:live -- --verify     after restarting the CMS: are they still there?
//   npm run test:live -- --cleanup    remove the test articles, media records and Cloudinary images made by this test
//
// What was created is written to data/live-test.json so the later steps act on exactly those ids.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v2 as cloudinary } from "cloudinary";
import { MongoClient } from "mongodb";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const shellUrl = process.env.CMS_PUBLIC_URL; // an address given on the command line wins over .env.local
for (const file of [".env.local", ".env"]) if (existsSync(path.join(root, file))) process.loadEnvFile(path.join(root, file));
const CMS = (shellUrl ?? process.env.CMS_PUBLIC_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const stateFile = path.join(process.env.CMS_DATA_DIR?.trim() || path.join(root, "data"), "live-test.json");
const mode = process.argv.includes("--cleanup") ? "cleanup" : process.argv.includes("--verify") ? "verify" : "run";
const SITES = ["customs-wise", "demo-website"];
const account = { cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(), api_key: process.env.CLOUDINARY_API_KEY?.trim(), api_secret: process.env.CLOUDINARY_API_SECRET?.trim(), secure: true };
const secrets = [process.env.CLOUDINARY_API_SECRET, process.env.CLOUDINARY_API_KEY, process.env.MONGODB_URI, /\/\/[^:]+:([^@]+)@/.exec(process.env.MONGODB_URI ?? "")?.[1]].map((s) => s?.trim()).filter((s) => s && s.length > 5);

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail !== "" ? `  (${String(detail).slice(0, 240)})` : ""}`);
};
const finish = () => {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(failures.length ? 1 : 0);
};
async function call(url, method = "GET", body) {
  const isForm = body instanceof FormData;
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(`${CMS}${url}`, { method, headers: body && !isForm ? { "Content-Type": "application/json" } : {}, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
      break;
    } catch (err) {
      // Retried only when no connection was made at all, so nothing can have been sent twice.
      const code = err?.cause?.code;
      if (attempt >= 4 || !["ETIMEDOUT", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, data, text };
}
const leaks = (text) => secrets.some((s) => text.includes(s));

const health = await call("/api/health").catch(() => null);
if (!health?.ok) {
  console.error(`The CMS is not reachable at ${CMS}, or it cannot read its database.`);
  process.exit(1);
}
console.log(`CMS at ${CMS} reports: store "${health.data.store}", images "${health.data.images}"`);
if (health.data.store !== "mongodb" || health.data.images !== "cloudinary") {
  console.error("This test needs the CMS to be running on MongoDB and Cloudinary. Check .env.local and restart the CMS.");
  process.exit(1);
}

// A direct connection to the same database, to see for ourselves what the application wrote.
const client = new MongoClient(process.env.MONGODB_URI.trim(), { serverSelectionTimeoutMS: 15000, appName: "multi-site-blog-cms-live-test" });
await client.connect();
const db = client.db(process.env.MONGODB_DB.trim());
const isAtlas = await client.db("admin").command({ atlasVersion: 1 }).then(() => true, () => false);
console.log(`Direct database connection: "${db.databaseName}" on ${isAtlas ? "MongoDB Atlas" : "a server that is NOT Atlas"}\n`);

/* ---------------------------------------------------------------- cleanup */
if (mode === "cleanup") {
  if (!existsSync(stateFile)) {
    console.log("Nothing to clean up: no record of a live test (data/live-test.json).");
    await client.close();
    process.exit(0);
  }
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  for (const item of state.items) {
    console.log(item.site);
    await call(`/api/admin/sites/${item.site}/posts/${item.postId}/unpublish`, "POST");
    const del = await call(`/api/admin/sites/${item.site}/posts/${item.postId}`, "DELETE");
    check("the test article is deleted", del.ok || del.status === 404 || /no longer exists/.test(del.data.message ?? ""), `${del.status} ${del.data.message ?? ""}`);
    check("it is gone from the database and the public API", (await db.collection("posts").countDocuments({ _id: item.postId })) === 0 && (await call(`/api/public/v1/sites/${item.site}/posts/${item.slug}`)).status === 404);
    // Only a public ID this test created, and only inside the website's own blog folder.
    if (new RegExp(`^${item.site}/blog/[a-z0-9]+-[a-f0-9]{12}$`).test(item.publicId)) {
      const gone = await cloudinary.uploader.destroy(item.publicId, { ...account, resource_type: "image", invalidate: true }).catch((e) => ({ result: `error http ${e?.http_code ?? "none"}` }));
      check("the test image is deleted from Cloudinary", gone.result === "ok" || gone.result === "not found", gone.result);
    } else check("the test image is deleted from Cloudinary", false, "unexpected public ID; left alone");
    const removed = await db.collection("media").deleteOne({ _id: item.mediaId, publicId: item.publicId });
    check("the test image's record is deleted", removed.deletedCount === 1 || (await db.collection("media").countDocuments({ _id: item.mediaId })) === 0);
  }
  const counts = { posts: await db.collection("posts").countDocuments(), media: await db.collection("media").countDocuments() };
  check("article and media counts are back to what they were before the test", counts.posts === state.before.posts && counts.media === state.before.media, `${JSON.stringify(counts)} vs ${JSON.stringify(state.before)}`);
  rmSync(stateFile, { force: true });
  console.log("\nNote: the activity log keeps its lines about the test articles; the log is never edited.");
  await client.close();
  finish();
}

/* ----------------------------------------------------------------- verify */
if (mode === "verify") {
  if (!existsSync(stateFile)) {
    console.error("No live test has been run (data/live-test.json is missing). Run: npm run test:live");
    process.exit(1);
  }
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  console.log("After restart");
  for (const item of state.items) {
    const pub = await call(`/api/public/v1/sites/${item.site}/posts/${item.slug}`);
    check(`${item.site}: the article is still published with its image`, pub.ok && pub.data.post.title === item.title && pub.data.post.coverImage?.url === item.url, `${pub.status}`);
    const media = await db.collection("media").findOne({ _id: item.mediaId });
    check(`${item.site}: the media record is still in the database`, media?.publicId === item.publicId && media.url === item.url);
    const img = await fetch(item.url);
    check(`${item.site}: the image is still served by Cloudinary`, img.ok && (img.headers.get("content-type") ?? "").startsWith("image/"), `status ${img.status}`);
  }
  await client.close();
  finish();
}

/* -------------------------------------------------------------------- run */
if (existsSync(stateFile)) {
  console.error("An earlier live test has not been cleaned up. Run: npm run test:live -- --cleanup");
  process.exit(1);
}
const sample = path.join(root, "samples", "sample-cover.png");
if (!existsSync(sample)) {
  console.error("Sample files are missing. Run: npm run sample-image");
  process.exit(1);
}
const png = readFileSync(sample);
const stamp = Date.now().toString(36);
const state = { startedAt: new Date().toISOString(), before: { posts: await db.collection("posts").countDocuments(), media: await db.collection("media").countDocuments() }, items: [] };
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 1));

for (const site of SITES) {
  console.log(site);
  const cfg = (await call(`/api/admin/sites/${site}`)).data;
  const slug = `zz-live-test-${stamp}`;
  const title = `ZZ LIVE TEST ${stamp} (${site}) - safe to delete`;

  // 1. Upload through the CMS to the real Cloudinary account.
  const form = new FormData();
  form.append("file", new Blob([png]), "live-test.png");
  const up = await call(`/api/admin/sites/${site}/media`, "POST", form);
  const m = up.data.media;
  check("the image is uploaded through the CMS", up.status === 201 && m?.storage === "cloudinary", `${up.status} ${up.data.message ?? ""}`);
  if (!m) continue;
  const item = { site, mediaId: m.id, publicId: m.publicId, url: m.url, slug, title: `${title} (edited)`, postId: null };
  state.items.push(item);
  save();
  check("its address is HTTPS on this Cloudinary account", m.url.startsWith(`https://res.cloudinary.com/${account.cloud_name}/image/upload/`));
  check("it is in the website's own folder", new RegExp(`^${site}/blog/[a-z0-9]+-[a-f0-9]{12}$`).test(m.publicId), m.publicId);
  check("the upload response contains no secret", !leaks(up.text));
  const img = await fetch(m.url);
  const bytes = (await img.arrayBuffer()).byteLength;
  check("Cloudinary serves the image at that address", img.ok && (img.headers.get("content-type") ?? "").startsWith("image/") && bytes > 1000, `status ${img.status}, ${bytes} bytes`);
  const asset = await cloudinary.api.resource(m.publicId, { ...account, resource_type: "image", context: true, tags: true }).catch((e) => ({ error: e?.error?.http_code ?? e?.http_code }));
  check("Cloudinary's own record matches: size, tags and the link back to the media record", asset.width === 1200 && asset.height === 630 && asset.tags?.includes("blog-cms") && asset.tags.includes(`blog-cms-site-${site}`) && asset.context?.custom?.cms_media_id === m.id, JSON.stringify({ e: asset.error, w: asset.width, t: asset.tags, c: asset.context }));
  if (asset.asset_folder !== undefined) check("it appears in that folder in the Media Library", asset.asset_folder === `${site}/blog`, asset.asset_folder);

  // 2. The media record, read straight from the database.
  const doc = await db.collection("media").findOne({ _id: m.id });
  check("the media record is in the database with the expected details", doc?.siteId === cfg.site.id && doc.publicId === m.publicId && doc.url === m.url && doc.storage === "cloudinary" && doc.mime === "image/png" && doc.width === 1200 && doc.height === 630 && doc.originalName === "live-test.png" && typeof doc.createdAt === "string" && doc.bytes === png.length, JSON.stringify(doc ?? {}).slice(0, 200));
  check("the record holds no image data", JSON.stringify(doc ?? {}).length < 900);

  // 3. Create a draft, edit it, publish it.
  const cover = { mediaId: m.id, url: m.url, alt: "Live test image", caption: "", width: m.width, height: m.height };
  const input = { title, slug, summary: "Created by the automated live test. Safe to delete.", body: [{ type: "h2", text: "Live test" }, { type: "p", text: "Written to MongoDB through the CMS." }], coverImage: cover, categoryId: cfg.categories[0].id, authorId: cfg.authors[0].id, tags: ["live-test"], seo: { title: "", description: "" }, canonicalOverride: "", status: "draft", publishAt: null, hideDate: false, faq: [], sources: [], relatedLinks: [], lastReviewedAt: null, readMinutesOverride: null };
  const draft = await call(`/api/admin/sites/${site}/posts`, "POST", input);
  check("a draft article is created", draft.status === 201 && draft.data.post.status === "draft", `${draft.status} ${JSON.stringify(draft.data.fieldErrors ?? {})}`);
  if (!draft.data.post) continue;
  item.postId = draft.data.post.id;
  save();
  check("the draft is in the database and not public", (await db.collection("posts").findOne({ _id: item.postId }))?.status === "draft" && (await call(`/api/public/v1/sites/${site}/posts/${slug}`)).status === 404);
  const edited = await call(`/api/admin/sites/${site}/posts/${item.postId}`, "PUT", { ...draft.data.post, title: item.title, body: [...draft.data.post.body, { type: "p", text: "Edited." }] });
  check("the article is edited", edited.ok && edited.data.post.title === item.title);
  const published = await call(`/api/admin/sites/${site}/posts/${item.postId}/publish`, "POST");
  check("the article is published", published.ok && published.data.post.status === "published");
  const stored = await db.collection("posts").findOne({ _id: item.postId });
  check("the database holds the edited, published article linked to its image", stored?.title === item.title && stored.status === "published" && stored.siteId === cfg.site.id && stored.coverImage?.mediaId === m.id && stored.coverImage.url === m.url && stored.body.length === 3);
  check("the media record now carries the alt text", (await db.collection("media").findOne({ _id: m.id }))?.alt === "Live test image");

  // 4. Public API and pages.
  const pub = await call(`/api/public/v1/sites/${site}/posts/${slug}`);
  const p = pub.data.post;
  check("the public API returns the article with the hosted image", pub.ok && p.title === item.title && p.coverImage.url === m.url && p.coverImage.alt === "Live test image");
  check("the public article has the expected fields", p && ["id", "slug", "title", "summary", "path", "canonicalUrl", "category", "author", "coverImage", "publishedAt", "html", "jsonLd", "seo"].every((k) => p[k] !== undefined) && p.html.includes("Edited.") && p.jsonLd.some((j) => j.image === m.url) && p.canonicalUrl.startsWith(cfg.site.baseUrl));
  check("the public response contains no database fields or secrets", !pub.text.includes('"_id"') && !pub.text.includes("publicId") && !leaks(pub.text));
  const page = await call(`/sites/${site}${p?.path ?? "/x"}`);
  check("the article page shows the hosted image", page.status === 200 && page.text.includes(m.url) && !leaks(page.text));
  const list = (await call(`/api/public/v1/sites/${site}/posts?limit=50`)).data.posts ?? [];
  check("it is in this website's public list", list.some((x) => x.id === item.postId));
}

if (state.items.length === 2 && state.items.every((i) => i.postId)) {
  console.log("Separation between the two websites");
  const [a, b] = state.items;
  const listA = (await call(`/api/public/v1/sites/${a.site}/posts?limit=50`)).data.posts;
  const listB = (await call(`/api/public/v1/sites/${b.site}/posts?limit=50`)).data.posts;
  check("each website lists only its own test article", !listA.some((x) => x.id === b.postId) && !listB.some((x) => x.id === a.postId));
  check("the same slug is used on both websites, as two separate records", a.slug === b.slug && (await db.collection("posts").countDocuments({ slug: a.slug })) === 2);
  check("an article cannot be reached through the other website", (await call(`/api/admin/sites/${b.site}/posts/${a.postId}`)).status === 404);
  const cfgB = (await call(`/api/admin/sites/${b.site}`)).data;
  const cross = await call(`/api/admin/sites/${b.site}/posts`, "POST", { title: "ZZ cross-site check", slug: `zz-cross-${stamp}`, summary: "", body: [], coverImage: { mediaId: a.mediaId, url: a.url, alt: "x", caption: "", width: 1200, height: 630 }, categoryId: cfgB.categories[0].id, authorId: cfgB.authors[0].id, tags: [], seo: { title: "", description: "" }, canonicalOverride: "", status: "draft", publishAt: null, hideDate: false, faq: [], sources: [], relatedLinks: [], lastReviewedAt: null, readMinutesOverride: null });
  check("one website cannot use the other website's image", cross.status === 400 && !!cross.data.fieldErrors?.coverImage, `${cross.status}`);
  const dup = await call(`/api/admin/sites/${a.site}/posts`, "POST", { title: "ZZ duplicate check", slug: a.slug, summary: "", body: [], coverImage: null, categoryId: null, authorId: null, tags: [], seo: { title: "", description: "" }, canonicalOverride: "", status: "draft", publishAt: null, hideDate: false, faq: [], sources: [], relatedLinks: [], lastReviewedAt: null, readMinutesOverride: null });
  check("a second article with the same slug on one website is refused", dup.status === 409, `${dup.status}`);
}

await client.close();
console.log(`\nThe test articles and images are still in place. Next: restart the CMS, then  npm run test:live -- --verify  and finally  npm run test:live -- --cleanup`);
finish();
