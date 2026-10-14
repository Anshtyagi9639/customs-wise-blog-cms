// Tests the Cloudinary upload path with MOCKED Cloudinary responses. No real account is used and nothing leaves
// this computer. It proves the CMS's own behaviour; it does not prove that a real Cloudinary account works.
//
// Start the CMS with the made-up test settings (one line). The last variable is the Cloudinary SDK's own way of
// sending uploads to another address, here the mock on this computer:
//   CLOUDINARY_CLOUD_NAME=cms-mock-not-real CLOUDINARY_API_KEY=123456789012345 \
//   CLOUDINARY_API_SECRET=mock-secret-for-tests-only-0000 \
//   "CLOUDINARY_URL=cloudinary://123456789012345:mock-secret-for-tests-only-0000@cms-mock-not-real?upload_prefix=http://127.0.0.1:3199" \
//   npm run start
// then:  npm run test:cloudinary-mock
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK, startMockCloudinary } from "./mock-cloudinary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CMS = (process.env.CMS_PUBLIC_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const CW = "customs-wise";
const DEMO = "demo-website";

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail !== "" ? `  (${String(detail).slice(0, 300)})` : ""}`);
};
async function call(url, method = "GET", body) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${CMS}${url}`, { method, headers: body && !isForm ? { "Content-Type": "application/json" } : {}, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, data, text };
}
const upload = (site, bytes, name) => {
  const form = new FormData();
  form.append("file", new Blob([bytes]), name);
  return call(`/api/admin/sites/${site}/media`, "POST", form);
};
const mediaCount = async () => (await call("/api/health")).data.media;
// The key or secret VALUES, the cloud name, or any of Cloudinary's own wording. (Variable names such as CLOUDINARY_API_KEY are fine.)
const leaks = (text) => text.includes(MOCK.apiSecret) || text.includes(MOCK.apiKey) || text.includes(MOCK.cloudName) || /signature|string to sign|general error/i.test(text) || /api_key /.test(text);

const health = await call("/api/health").catch(() => null);
if (!health?.ok) {
  console.error(`The CMS is not reachable at ${CMS}.`);
  process.exit(1);
}
if (health.data.images !== "cloudinary") {
  console.error("The CMS is not running with the mock Cloudinary settings. See the top of this file for how to start it.");
  process.exit(1);
}
const png = readFileSync(path.join(here, "..", "samples", "sample-cover.png"));
if (!existsSync(path.join(here, "..", "samples", "not-an-image.txt"))) {
  console.error("Sample files are missing. Run: npm run sample-image");
  process.exit(1);
}
const mock = await startMockCloudinary();
const created = [];

try {
  console.log(`\nStore: ${health.data.store}. Cloudinary: MOCKED.\n\nSuccessful upload`);
  const before = await mediaCount();
  const up = await upload(CW, png, "My Holiday Photo (final).PNG");
  const m = up.data.media;
  if (up.status === 201 && mock.state.uploads.length === 0) {
    console.error("STOPPED: the upload did not go to the mock server. This CMS is using a REAL Cloudinary account.");
    console.error(`One test image was uploaded to it: ${m?.publicId} (media record ${m?.id}). Remove it in the Cloudinary Media Library.`);
    console.error("Start the CMS with the settings shown at the top of this file before running this test.");
    process.exit(1);
  }
  const sent = mock.state.uploads.at(-1) ?? { fields: {} };
  check("a valid image is accepted", up.status === 201, `status ${up.status} ${up.data.message ?? ""}`);
  check("the record says it is stored on Cloudinary", m?.storage === "cloudinary");
  check("the image address uses HTTPS on Cloudinary", /^https:\/\/res\.cloudinary\.com\/cms-mock-not-real\/image\/upload\//.test(m?.url ?? ""), m?.url);
  check("it went to the website's own folder", /^customs-wise\/blog\/[a-z0-9]+-[a-f0-9]{12}$/.test(m?.publicId ?? "") && sent.fields.asset_folder === "customs-wise/blog", `${m?.publicId} / ${sent.fields.asset_folder}`);
  check("the public ID is generated, not taken from the file name", !/holiday|photo|final/i.test(m?.publicId ?? "x") && sent.fields.public_id === m?.publicId);
  check("the upload asks Cloudinary not to overwrite", ["false", "0"].includes(String(sent.fields.overwrite)), sent.fields.overwrite);
  check("the upload is signed, and the API secret itself is not sent", !!sent.fields.signature && !!sent.fields.timestamp && sent.rawContainsSecret === false);
  check("the asset is tagged so it can be matched to its record", /blog-cms/.test(sent.fields.tags ?? "") && (sent.fields.context ?? "").includes(m?.id ?? "?"), `${sent.fields.tags} | ${sent.fields.context}`);
  check("the record has the expected details", m?.siteId && m.mime === "image/png" && m.width === 1200 && m.height === 630 && m.originalName === "My Holiday Photo final.PNG" && m.alt === "" && !!m.createdAt && m.bytes === png.length, JSON.stringify(m));
  check("the record holds no image data", JSON.stringify(m ?? {}).length < 800);
  check("the response contains no API key or secret", !up.text.includes(MOCK.apiSecret) && !up.text.includes(MOCK.apiKey));
  check("exactly one record was added", (await mediaCount()) === before + 1);

  const second = await upload(CW, png, "sample-cover.png");
  check("a second upload gets a different public ID", second.status === 201 && second.data.media.publicId !== m.publicId);
  const demoUp = await upload(DEMO, png, "sample-cover.png");
  check("the other website's uploads go to its own folder", /^demo-website\/blog\//.test(demoUp.data.media?.publicId ?? ""), demoUp.data.media?.publicId);

  console.log("\nRefused before reaching Cloudinary");
  const sentBefore = mock.state.uploads.length;
  const countBefore = await mediaCount();
  check("a text file is refused", (await upload(CW, readFileSync(path.join(here, "..", "samples", "not-an-image.txt")), "notes.txt")).status === 415);
  check("a non-image named .png is refused", (await upload(CW, Buffer.from("<script>alert(1)</script> not really a picture"), "photo.png")).status === 415);
  const big = Buffer.alloc(5 * 1024 * 1024 + 4096);
  png.copy(big);
  check("an image over 5 MB is refused", (await upload(CW, big, "big.png")).status === 413);
  check("none of them was sent to Cloudinary or recorded", mock.state.uploads.length === sentBefore && (await mediaCount()) === countBefore);

  console.log("\nCloudinary failures");
  for (const [mode, label, expectText] of [
    ["401", "wrong account details", /account details/],
    ["500", "a Cloudinary server error", /problem at the moment/],
    ["429", "a rate limit", /limiting uploads/],
    ["existing", "a public ID that already exists", /already exists/],
    ["no-https", "an answer without an HTTPS address", /usable image address/],
  ]) {
    mock.state.mode = mode;
    const count = await mediaCount();
    const res = await upload(CW, png, "sample-cover.png");
    check(`${label}: the editor gets a useful message`, [502, 503].includes(res.status) && expectText.test(res.data.message ?? ""), `status ${res.status}: ${res.data.message}`);
    check(`${label}: no account details in the response`, !leaks(res.text), res.text);
    check(`${label}: no record is created`, (await mediaCount()) === count);
  }
  check("an unusable upload is removed from Cloudinary again", mock.state.destroyed.length === 1 && /^customs-wise\/blog\//.test(mock.state.destroyed[0] ?? ""), mock.state.destroyed.join(","));

  // The upload succeeds but the record cannot be saved (here: the database refuses a second record with the same
  // public ID). The CMS must take the upload down again and must not leave a record.
  if (health.data.store === "mongodb") {
    mock.state.mode = "same-id";
    const first = await upload(CW, png, "sample-cover.png");
    const destroyedBefore = mock.state.destroyed.length;
    const countMid = await mediaCount();
    const clash = await upload(CW, png, "sample-cover.png");
    check("record cannot be saved after upload: the editor is told the image was not kept", first.status === 201 && clash.status === 503 && /not kept/.test(clash.data.message ?? ""), `${first.status} / ${clash.status}: ${clash.data.message}`);
    check("record cannot be saved after upload: the upload is removed from Cloudinary", mock.state.destroyed.length === destroyedBefore + 1 && mock.state.destroyed.at(-1) === first.data.media?.publicId, mock.state.destroyed.at(-1));
    check("record cannot be saved after upload: no record is left behind", (await mediaCount()) === countMid);
  } else console.log("  note  the 'record cannot be saved after upload' case needs the MongoDB store and was skipped");

  mock.state.mode = "ok";
  await mock.stop();
  const countDown = await mediaCount();
  const down = await upload(CW, png, "sample-cover.png");
  check("Cloudinary unreachable: the editor gets a useful message", down.status === 502 && /could not be reached/.test(down.data.message ?? ""), `status ${down.status}: ${down.data.message}`);
  check("Cloudinary unreachable: no record is created", (await mediaCount()) === countDown);

  console.log("\nArticles using a hosted image");
  const cw = (await call(`/api/admin/sites/${CW}`)).data;
  const demo = (await call(`/api/admin/sites/${DEMO}`)).data;
  const slug = `cloudinary-test-${Date.now().toString(36)}`;
  const ref = (media, alt) => ({ mediaId: media.id, url: media.url, alt, caption: "", width: media.width, height: media.height });
  const base = { title: `Cloudinary test ${slug}`, slug, summary: "Test article with a hosted image.", body: [{ type: "p", text: "Text." }, { type: "image", image: ref(second.data.media, "Second test image") }], coverImage: ref(m, "Hosted test image"), categoryId: cw.categories[0].id, authorId: cw.authors[0].id, tags: [], seo: { title: "", description: "" }, canonicalOverride: "", status: "published", publishAt: null, hideDate: false, faq: [], sources: [], relatedLinks: [], lastReviewedAt: null, readMinutesOverride: null };
  const post = await call(`/api/admin/sites/${CW}/posts`, "POST", base);
  created.push([CW, post.data.post?.id]);
  check("an article with hosted images is published", post.status === 201, `${post.status} ${JSON.stringify(post.data.fieldErrors ?? {})}`);
  const pub = (await call(`/api/public/v1/sites/${CW}/posts/${slug}`)).data.post;
  check("the public API returns the HTTPS image address unchanged", pub?.coverImage.url === m.url);
  check("the article HTML and structured data use the hosted address, with nothing put in front of it", pub?.html.includes(`src="${second.data.media.url}"`) && pub.jsonLd.some((j) => j.image === m.url), pub?.html);
  const page = await call(`/sites/${CW}/insights/blog/${slug}`);
  check("the article page shows the hosted image", page.status === 200 && page.text.includes(m.url));
  check("the listing page shows the hosted image", (await call(`/sites/${CW}/blog`)).text.includes(m.url));
  const foreign = await call(`/api/admin/sites/${DEMO}/posts`, "POST", { ...base, slug: `${slug}-x`, body: [{ type: "p", text: "Text." }], categoryId: demo.categories[0].id, authorId: demo.authors[0].id });
  check("another website's hosted image is refused", foreign.status === 400 && !!foreign.data.fieldErrors?.coverImage);
  const forged = await call(`/api/admin/sites/${CW}/posts`, "POST", { ...base, slug: `${slug}-y`, body: [{ type: "p", text: "Text." }], coverImage: { ...ref(m, "x"), url: "https://res.cloudinary.com/someone-else/image/upload/v1/other.png" } });
  check("an image address that was not uploaded through the CMS is refused", forged.status === 400 && !!forged.data.fieldErrors?.coverImage);
  const outside = await call(`/api/admin/sites/${CW}/posts`, "POST", { ...base, slug: `${slug}-z`, body: [{ type: "p", text: "Text." }], coverImage: { ...ref(m, "x"), url: "https://example.com/tracker.png" } });
  check("an image address on another host is refused", outside.status === 400);

  console.log("\nExisting local images");
  const all = (await call(`/api/admin/sites/${CW}/posts`)).data.posts;
  const local = all.find((p) => p.coverImage?.url.startsWith("/media/"));
  if (!local) console.log("  note  no article with a locally stored image exists in this store, so this part was skipped");
  else {
    const img = await fetch(`${CMS}${local.coverImage.url}`);
    check("an image stored locally earlier is still served", img.ok && (img.headers.get("content-type") ?? "").startsWith("image/"), `status ${img.status}`);
    const saved = await call(`/api/admin/sites/${CW}/posts/${local.id}`, "PUT", local);
    check("an article with a local image can still be saved", saved.ok, `${saved.status} ${JSON.stringify(saved.data.fieldErrors ?? {})}`);
  }
} finally {
  for (const [site, id] of created.filter(([, x]) => x)) {
    await call(`/api/admin/sites/${site}/posts/${id}/unpublish`, "POST");
    await call(`/api/admin/sites/${site}/posts/${id}`, "DELETE");
  }
  await mock.stop().catch(() => undefined);
}

console.log(`\n${passed} passed, ${failures.length} failed   (Cloudinary was MOCKED: a live upload is not tested by this script)`);
if (failures.length) console.log(failures.map((f) => `  - ${f}`).join("\n"));
process.exit(failures.length ? 1 : 0);
