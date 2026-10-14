// End-to-end check of the publishing workflow through the same HTTP API the dashboard uses.
// Nothing is mocked: every step is a real request to the running CMS and a real write to the local store.
//
// Usage (CMS must be running):  npm run test:workflow
//   --keep           leave the test articles in place instead of deleting them at the end
//   --verify <file>  after a restart, check that the articles recorded in <file> are still there (see README)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CMS = (process.env.CMS_PUBLIC_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const verifyFile = args.includes("--verify") ? args[args.indexOf("--verify") + 1] : null;
const CW = "customs-wise";
const DEMO = "demo-website";

let passed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

async function call(url, method = "GET", body, headers = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${CMS}${url}`, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json().catch(() => ({})) : await res.text();
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

const upload = (site, bytes, name) => {
  const form = new FormData();
  form.append("file", new Blob([bytes]), name);
  return call(`/api/admin/sites/${site}/media`, "POST", form);
};

const health = await call("/api/health").catch(() => null);
if (!health?.ok) {
  console.error(`The CMS is not reachable at ${CMS}. Start it first (npm run dev, or npm run build && npm run start).`);
  process.exit(1);
}

/* ---------- Restart check: the articles written by an earlier run must still be there ---------- */
if (verifyFile) {
  console.log("\nPersistence after restart");
  const saved = JSON.parse(readFileSync(verifyFile, "utf8"));
  const admin = await call(`/api/admin/sites/${CW}/posts/${saved.id}`);
  check("the article is still in the store", admin.ok && admin.data.post.title === saved.title, `status ${admin.status}`);
  const pub = await call(`/api/public/v1/sites/${CW}/posts/${saved.slug}`);
  check("it is still published on its website", pub.ok && pub.data.post.title === saved.title, `status ${pub.status}`);
  const img = await fetch(`${CMS}${saved.imageUrl}`);
  const bytes = (await img.arrayBuffer()).byteLength;
  check("its uploaded image is still served, byte for byte the same size", img.ok && bytes === saved.imageBytes, `status ${img.status}, ${bytes} bytes`);
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
}

// This test uploads several images and checks them as local files. Against a real image host it would leave test
// images and records behind, so it refuses to run there.
if (health.data.images === "cloudinary") {
  console.error("This CMS is storing images on Cloudinary. The workflow test only runs with local images, so that it cannot leave test");
  console.error("images on a real account. Use  npm run test:live  to test the real services, or start a CMS with CMS_IMAGES=local.");
  process.exit(1);
}
if (health.data.store === "mongodb") console.log("Note: this CMS is using MongoDB. Test articles are removed at the end; records of the test images and activity-log lines stay.");

const samples = path.join(here, "..", "samples");
if (!existsSync(path.join(samples, "sample-cover.png"))) {
  console.error("Sample files are missing. Run: npm run sample-image");
  process.exit(1);
}
const png = readFileSync(path.join(samples, "sample-cover.png"));
const stamp = Date.now().toString(36);
const slug = `workflow-test-${stamp}`;
const created = []; // [siteKey, postId] to remove at the end

const cw = (await call(`/api/admin/sites/${CW}`)).data;
const demo = (await call(`/api/admin/sites/${DEMO}`)).data;
const base = {
  title: `Workflow test article ${stamp}`,
  slug,
  summary: "A test article created by the automated workflow check.",
  body: [
    { type: "h2", text: "What this checks" },
    { type: "p", text: "A paragraph with **bold text** and [a link](/services)." },
    { type: "ul", items: ["First point", "Second point"] },
  ],
  coverImage: null,
  categoryId: cw.categories[0].id,
  authorId: cw.authors[0].id,
  tags: ["test"],
  seo: { title: "", description: "" },
  canonicalOverride: "",
  status: "draft",
  publishAt: null,
  hideDate: false,
  faq: [{ question: "Is this a real article?", answer: "No, it is test content." }],
  sources: [{ label: "Example source", url: "https://example.com/source" }],
  relatedLinks: [],
  lastReviewedAt: "2026-01-15",
  readMinutesOverride: null,
};

console.log("\nImage upload");
const up = await upload(CW, png, "sample-cover.png");
check("a PNG image is accepted", up.status === 201, `status ${up.status}`);
const media = up.data.media;
check("its real dimensions are recorded", media?.width === 1200 && media?.height === 630);
check("the stored name is generated, not taken from the upload", media && !media.fileName.includes("sample"));
const served = await fetch(`${CMS}${media.url}`);
check("the image is served back", served.ok && served.headers.get("content-type") === "image/png");
const text = await upload(CW, readFileSync(path.join(samples, "not-an-image.txt")), "not-an-image.txt");
check("a text file is refused", text.status === 415, `status ${text.status}`);
const disguised = await upload(CW, Buffer.from("<script>alert(1)</script> not really a picture"), "photo.png");
check("a non-image named .png is refused", disguised.status === 415, `status ${disguised.status}`);
const big = Buffer.alloc(5 * 1024 * 1024 + 4096);
png.copy(big);
const tooBig = await upload(CW, big, "big.png");
check("an image over 5 MB is refused", tooBig.status === 413, `status ${tooBig.status}`);
const empty = await upload(CW, Buffer.alloc(0), "empty.png");
check("an empty file is refused", empty.status === 400, `status ${empty.status}`);
const traversal = await fetch(`${CMS}/media/${CW}/..%2F..%2Fdb.json`);
check("the image address cannot be used to read other files", traversal.status === 404 || traversal.status === 400, `status ${traversal.status}`);

console.log("\nRequired fields");
const noTitle = await call(`/api/admin/sites/${CW}/posts`, "POST", { ...base, title: "", slug: "" });
check("a draft without a title is refused", noTitle.status === 400 && !!noTitle.data.fieldErrors?.title);
const badSlug = await call(`/api/admin/sites/${CW}/posts`, "POST", { ...base, slug: "Not A Slug!" });
check("an invalid slug is refused", badSlug.status === 400 && !!badSlug.data.fieldErrors?.slug);
const thin = await call(`/api/admin/sites/${CW}/posts`, "POST", { ...base, slug: `${slug}-thin`, status: "published", summary: "", body: [], categoryId: null, authorId: null });
const thinErrors = thin.data.fieldErrors ?? {};
check("publishing without summary, content, category and author is refused", thin.status === 400 && ["summary", "body", "categoryId", "authorId"].every((k) => thinErrors[k]), JSON.stringify(thinErrors));
const noAlt = await call(`/api/admin/sites/${CW}/posts`, "POST", { ...base, slug: `${slug}-alt`, status: "published", coverImage: { mediaId: media.id, url: media.url, alt: "", caption: "", width: media.width, height: media.height } });
check("publishing with an image but no alt text is refused", noAlt.status === 400 && !!noAlt.data.fieldErrors?.coverImageAlt);
const foreignCategory = await call(`/api/admin/sites/${CW}/posts`, "POST", { ...base, slug: `${slug}-cat`, categoryId: demo.categories[0].id });
check("another website's category is refused", foreignCategory.status === 400 && !!foreignCategory.data.fieldErrors?.categoryId);
const foreignImage = await call(`/api/admin/sites/${DEMO}/posts`, "POST", { ...base, slug: `${slug}-img`, categoryId: demo.categories[0].id, authorId: demo.authors[0].id, coverImage: { mediaId: media.id, url: media.url, alt: "x", caption: "", width: 1200, height: 630 } });
check("another website's image is refused", foreignImage.status === 400 && !!foreignImage.data.fieldErrors?.coverImage);

console.log("\nDraft, publish, edit, unpublish, republish");
const cover = { mediaId: media.id, url: media.url, alt: "Blue test gradient", caption: "Test image", width: media.width, height: media.height };
const draft = await call(`/api/admin/sites/${CW}/posts`, "POST", { ...base, coverImage: cover });
check("a draft is saved", draft.status === 201 && draft.data.post.status === "draft", `status ${draft.status} ${JSON.stringify(draft.data.fieldErrors ?? {})}`);
const id = draft.data.post.id;
created.push([CW, id]);
const listHas = async (site, s) => (await call(`/api/public/v1/sites/${site}/posts?limit=50`)).data.posts.some((p) => p.slug === s);
check("the draft is not in the public list", !(await listHas(CW, slug)));
check("the draft's public address returns 404", (await call(`/api/public/v1/sites/${CW}/posts/${slug}`)).status === 404);
check("the draft's page returns 404", (await call(`/sites/${CW}/insights/blog/${slug}`)).status === 404);
check("the draft can be previewed in the dashboard", (await call(`/preview/${CW}/${id}`)).status === 200);

const publish = await call(`/api/admin/sites/${CW}/posts/${id}/publish`, "POST");
check("the draft is published", publish.ok && publish.data.post.status === "published" && !!publish.data.post.publishAt);
check("it appears in the public list", await listHas(CW, slug));
const pub = await call(`/api/public/v1/sites/${CW}/posts/${slug}`);
const p = pub.data.post;
check("its public address returns the article", pub.ok && p.title === base.title);
check("the canonical address points at the website's own URL", p?.canonicalUrl === `https://www.customswise.ie/insights/blog/${slug}`, p?.canonicalUrl);
check("the HTML is generated from the blocks", p?.html.includes("<h2") && p.html.includes("<strong>bold text</strong>") && p.html.includes('href="/services"'));
const types = (p?.jsonLd ?? []).map((j) => j["@type"]);
check("structured data includes article, breadcrumb and FAQ", ["BlogPosting", "BreadcrumbList", "FAQPage"].every((t) => types.includes(t)), types.join(","));
const page = await call(`/sites/${CW}/insights/blog/${slug}`);
check("its page is served", page.status === 200 && page.data.includes(base.title));
check("the page has a canonical link and structured data", page.data.includes(`rel="canonical" href="https://www.customswise.ie/insights/blog/${slug}"`) && page.data.includes("application/ld+json"));
check("the listing page shows it", (await call(`/sites/${CW}/blog`)).data.includes(base.title));
check("the sitemap lists it", (await call(`/api/public/v1/sites/${CW}/sitemap`)).data.urls.some((u) => u.path.endsWith(slug)));

const edited = await call(`/api/admin/sites/${CW}/posts/${id}`, "PUT", { ...publish.data.post, title: `${base.title} (edited)`, body: [...publish.data.post.body, { type: "p", text: "<img src=x onerror=alert(1)> stays as text." }] });
check("an edit is saved", edited.ok && edited.data.post.title.endsWith("(edited)"));
const after = (await call(`/api/public/v1/sites/${CW}/posts/${slug}`)).data.post;
check("the public article shows the edit", after.title.endsWith("(edited)"));
check("HTML typed into the content is escaped, not run", after.html.includes("&lt;img") && !after.html.includes("<img src=x"));
const unsafe = await call(`/api/admin/sites/${CW}/posts/${id}`, "PUT", { ...edited.data.post, body: [{ type: "p", text: "[click](javascript:alert(1))" }] });
const unsafeHtml = (await call(`/api/public/v1/sites/${CW}/posts/${slug}`)).data.post.html;
check("a javascript: link is left as plain text, not turned into a link", unsafe.ok && !unsafeHtml.includes("<a") && !unsafeHtml.includes("href"), unsafeHtml);

const unpublish = await call(`/api/admin/sites/${CW}/posts/${id}/unpublish`, "POST");
check("the article is unpublished", unpublish.ok && unpublish.data.post.status === "draft");
check("it leaves the public list", !(await listHas(CW, slug)));
check("its page returns 404 again", (await call(`/sites/${CW}/insights/blog/${slug}`)).status === 404);
const republish = await call(`/api/admin/sites/${CW}/posts/${id}/publish`, "POST");
check("it is republished", republish.ok && (await listHas(CW, slug)));
check("deleting a published article is refused", (await call(`/api/admin/sites/${CW}/posts/${id}`, "DELETE")).status === 409);

const future = new Date(Date.now() + 7 * 86400000).toISOString();
const scheduled = await call(`/api/admin/sites/${CW}/posts`, "POST", { ...base, slug: `${slug}-later`, title: `${base.title} scheduled`, status: "published", publishAt: future });
created.push([CW, scheduled.data.post?.id]);
check("an article with a future publish time is saved", scheduled.status === 201);
check("it is not public before that time", !(await listHas(CW, `${slug}-later`)) && (await call(`/api/public/v1/sites/${CW}/posts/${slug}-later`)).status === 404);

console.log("\nSlugs and isolation between websites");
const duplicate = await call(`/api/admin/sites/${CW}/posts`, "POST", { ...base, title: "Duplicate" });
check("the same slug on the same website is refused", duplicate.status === 409 && !!duplicate.data.fieldErrors?.slug, `status ${duplicate.status}`);
const demoPost = await call(`/api/admin/sites/${DEMO}/posts`, "POST", { ...base, title: `Demo ${stamp}`, status: "published", categoryId: demo.categories[0].id, authorId: demo.authors[0].id });
check("the same slug on the other website is allowed", demoPost.status === 201, `status ${demoPost.status} ${JSON.stringify(demoPost.data.fieldErrors ?? {})}`);
const demoId = demoPost.data.post?.id;
created.push([DEMO, demoId]);
const cwView = (await call(`/api/public/v1/sites/${CW}/posts/${slug}`)).data.post;
const demoView = (await call(`/api/public/v1/sites/${DEMO}/posts/${slug}`)).data.post;
check("each website returns its own article for that slug", cwView.id === id && demoView.id === demoId && cwView.title !== demoView.title);
check("the demo article's canonical uses the demo website", demoView.canonicalUrl === `https://demo-website.example/journal/${slug}`, demoView.canonicalUrl);
const cwAdmin = (await call(`/api/admin/sites/${CW}/posts`)).data.posts;
const demoAdmin = (await call(`/api/admin/sites/${DEMO}/posts`)).data.posts;
check("the Customs Wise dashboard list has no demo articles", cwAdmin.every((x) => x.siteId === cw.site.id) && !cwAdmin.some((x) => x.id === demoId));
check("the demo dashboard list has no Customs Wise articles", demoAdmin.every((x) => x.siteId === demo.site.id) && !demoAdmin.some((x) => x.id === id));
const cwPublic = (await call(`/api/public/v1/sites/${CW}/posts?limit=50`)).data.posts;
const demoPublic = (await call(`/api/public/v1/sites/${DEMO}/posts?limit=50`)).data.posts;
check("the public lists do not overlap", !cwPublic.some((x) => demoPublic.some((y) => y.id === x.id)));
check("an article cannot be read through the other website", (await call(`/api/admin/sites/${DEMO}/posts/${id}`)).status === 404 && (await call(`/api/admin/sites/${CW}/posts/${demoId}`)).status === 404);
check("an article cannot be edited through the other website", (await call(`/api/admin/sites/${DEMO}/posts/${id}`, "PUT", { ...base, title: "Hijacked" })).status === 404);
check("an article cannot be unpublished through the other website", (await call(`/api/admin/sites/${DEMO}/posts/${id}/unpublish`, "POST")).status === 404);
check("an article cannot be previewed through the other website", (await call(`/preview/${DEMO}/${id}`)).status === 404);
check("the demo listing page does not show the Customs Wise article", !(await call(`/sites/${DEMO}/journal`)).data.includes(`${base.title} (edited)`));
check("an unknown website returns 404", (await call(`/api/public/v1/sites/nope/posts`)).status === 404);

console.log("\nCopy to another website");
const copy = await call(`/api/admin/sites/${CW}/posts/${id}/copy`, "POST", { targetSiteKey: DEMO, canonicalToOriginal: true });
const copied = copy.data.post;
created.push([DEMO, copied?.id]);
check("the copy is a new draft on the other website", copy.status === 201 && copied.id !== id && copied.siteId === demo.site.id && copied.status === "draft");
check("the copy gets a free slug on that website", copied?.slug === `${slug}-2`, copied?.slug);
check("the copy's canonical points at the original", copied?.canonicalOverride === `https://www.customswise.ie/insights/blog/${slug}`);
await call(`/api/admin/sites/${DEMO}/posts/${copied.id}`, "PUT", { ...copied, title: "Changed copy" });
check("changing the copy leaves the original untouched", (await call(`/api/admin/sites/${CW}/posts/${id}`)).data.post.title !== "Changed copy");

console.log("\nRequests from other websites");
const cross = await call(`/api/admin/sites/${CW}/posts/${id}/unpublish`, "POST", undefined, { Origin: "https://evil.example" });
check("a change sent from another origin is refused", cross.status === 403, `status ${cross.status}`);
check("the public API has no way to write", [404, 405].includes((await call(`/api/public/v1/sites/${CW}/posts`, "POST", base)).status));

if (keep) {
  const out = path.join(here, "..", "data", "workflow-test.json");
  writeFileSync(out, JSON.stringify({ id, slug, title: `${base.title} (edited)`, imageUrl: media.url, imageBytes: png.length }));
  console.log(`\nTest articles kept. After restarting the CMS run:  node scripts/test-workflow.mjs --verify "${out}"`);
} else {
  for (const [site, postId] of created.filter(([, x]) => x)) {
    await call(`/api/admin/sites/${site}/posts/${postId}/unpublish`, "POST");
    await call(`/api/admin/sites/${site}/posts/${postId}`, "DELETE");
  }
  check("the test articles are removed again", !(await listHas(CW, slug)) && !(await listHas(DEMO, slug)));
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log(failures.map((f) => `  - ${f}`).join("\n"));
process.exit(failures.length ? 1 : 0);
