// One-off import of the existing Customs Wise blog posts into the LOCAL CMS, so the preview is realistic.
//
// It only READS the website repository (posts file and image files) and talks to the local CMS through its admin
// API, exactly as the dashboard does. The website repository is not changed.
//
// Usage (CMS must be running):  npm run import:customs-wise -- "<path to the website repository>"
// Default path: ../customs-wise        Safe to run twice: posts whose slug already exists are skipped.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] ?? path.join(here, "..", "..", "customs-wise"));
const CMS = (process.env.CMS_PUBLIC_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const SITE = "customs-wise";

const source = path.join(repo, "lib", "content", "blog-posts.ts");
if (!existsSync(source)) {
  console.error(`Could not find ${source}. Pass the path to the website repository.`);
  process.exit(1);
}

// The posts file is an array of plain object literals with quoted keys, plus "// Source:" comment lines.
const text = readFileSync(source, "utf8");
const start = text.indexOf("= [", text.indexOf("export const blogPosts")) + 2;
const arrayText = text
  .slice(start, text.lastIndexOf("]") + 1)
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n")
  .replace(/,(\s*[\]}])/g, "$1"); // trailing commas are valid TypeScript but not JSON
const posts = JSON.parse(arrayText);

/** The website's inline text (plain string, or parts with bold and links) to the CMS's **bold** / [text](address) form. */
const inline = (rich) =>
  typeof rich === "string" ? rich : rich.map((part) => (typeof part === "string" ? part : "strong" in part ? `**${part.strong}**` : `[${part.text}](${part.href})`)).join("");

const toBlock = (b) => {
  if (b.type === "ul" || b.type === "ol") return { type: b.type, items: b.items.map(inline) };
  if (b.type === "h2" || b.type === "h3" || b.type === "callout") return { type: b.type, text: b.text };
  return { type: "p", text: inline(b.text) };
};

async function call(url, options) {
  const res = await fetch(`${CMS}${url}`, options);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const config = await call(`/api/admin/sites/${SITE}`).catch(() => ({ ok: false }));
if (!config.ok) {
  console.error(`The CMS is not reachable at ${CMS}. Start it first (npm run dev, or npm run build && npm run start).`);
  process.exit(1);
}
const categoryIds = Object.fromEntries(config.data.categories.map((c) => [c.slug, c.id]));
const authorId = config.data.authors.find((a) => a.kind === "organisation")?.id ?? null;
const existing = (await call(`/api/admin/sites/${SITE}/posts`)).data.posts;

let created = 0;
let skipped = 0;
for (const [index, post] of posts.entries()) {
  if (existing.some((p) => p.slug === post.slug)) {
    skipped++;
    continue;
  }

  let coverImage = null;
  if (post.image) {
    const file = path.join(repo, "public", decodeURIComponent(post.image.src));
    if (existsSync(file)) {
      const form = new FormData();
      form.append("file", new Blob([readFileSync(file)]), path.basename(file));
      const up = await call(`/api/admin/sites/${SITE}/media`, { method: "POST", body: form });
      if (up.ok) coverImage = { mediaId: up.data.media.id, url: up.data.media.url, alt: post.image.alt, caption: post.image.caption ?? "", width: up.data.media.width, height: up.data.media.height };
      else console.warn(`  image not imported for ${post.slug}: ${up.data.message}`);
    }
  }

  // Posts are listed newest first. Five have no known date: they keep their position with a hidden date.
  const publishAt = post.date ? `${post.date}T09:00:00.000Z` : new Date(Date.UTC(2026, 5, 20 - index, 9)).toISOString();
  const body = {
    title: post.title,
    slug: post.slug,
    summary: post.excerpt,
    body: post.body.map(toBlock),
    coverImage,
    categoryId: categoryIds[post.topic] ?? null,
    authorId,
    tags: [],
    seo: { title: "", description: "" },
    canonicalOverride: "",
    status: "published",
    publishAt,
    hideDate: !post.date,
    faq: [],
    sources: [],
    relatedLinks: post.related ?? [],
    lastReviewedAt: null,
    readMinutesOverride: post.readMinutes ?? null,
  };
  const res = await call(`/api/admin/sites/${SITE}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) created++;
  else console.warn(`  NOT imported: ${post.slug}: ${res.data.message} ${JSON.stringify(res.data.fieldErrors ?? {})}`);
}

console.log(`Customs Wise posts in the website repository: ${posts.length}. Imported now: ${created}. Already present: ${skipped}.`);
