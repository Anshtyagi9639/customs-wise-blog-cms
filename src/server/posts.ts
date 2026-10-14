import "server-only";
import { z } from "zod";
import { SLUG_PATTERN, canonicalUrl, cleanBlocks, isSafeHref, isVisible, pickRelated, slugify, toCard, toPublicPost } from "@/lib/content";
import type { FieldErrors, ImageRef, Post, PostInput, PublicCard, PublicPost, Site } from "@/lib/types";
import { type Database, StoreConflictError, audit, mutateDb, newId, readDb } from "./store";

/**
 * Article rules: validation, slugs, publishing, copying, and what the public may see.
 * Every function takes the site first. Nothing here reads or changes an article through another site.
 */

export function mediaBase(): string {
  return (process.env.CMS_PUBLIC_URL?.trim() || "http://127.0.0.1:3100").replace(/\/+$/, "");
}

const text = (max: number) => z.string().trim().max(max);
const image = z.object({
  mediaId: z.string().min(1),
  // An image uploaded through this CMS: a local file it serves itself, or an https address on Cloudinary.
  url: z.string().regex(/^(\/media\/[a-z0-9-]+\/[A-Za-z0-9._-]+|https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/[A-Za-z0-9_./-]+)$/, "Not an uploaded image."),
  alt: text(300),
  caption: text(300).default(""),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("p"), text: z.string().max(8000) }),
  z.object({ type: z.literal("h2"), text: z.string().max(200) }),
  z.object({ type: z.literal("h3"), text: z.string().max(200) }),
  z.object({ type: z.literal("ul"), items: z.array(z.string().max(2000)).max(60) }),
  z.object({ type: z.literal("ol"), items: z.array(z.string().max(2000)).max(60) }),
  z.object({ type: z.literal("quote"), text: z.string().max(2000), cite: z.string().max(200).default("") }),
  z.object({ type: z.literal("callout"), text: z.string().max(4000) }),
  z.object({ type: z.literal("image"), image }),
]);

const inputSchema = z.object({
  title: text(160),
  slug: z.string().trim().toLowerCase().max(80),
  summary: text(400),
  body: z.array(block).max(300),
  coverImage: image.nullable(),
  categoryId: z.string().nullable(),
  authorId: z.string().nullable(),
  tags: z.array(text(40)).max(12),
  seo: z.object({ title: text(120), description: text(320) }),
  canonicalOverride: text(500),
  status: z.enum(["draft", "published"]),
  publishAt: z.string().nullable(),
  hideDate: z.boolean().default(false),
  faq: z.array(z.object({ question: text(300), answer: text(2000) })).max(30),
  sources: z.array(z.object({ label: text(200), url: text(500) })).max(30),
  relatedLinks: z.array(z.object({ label: text(120), href: text(300) })).max(12),
  lastReviewedAt: z.string().nullable(),
  readMinutesOverride: z.number().int().min(1).max(120).nullable().default(null),
});

export type SaveResult = { ok: true; post: Post } | { ok: false; status: 400 | 404 | 409; message: string; fieldErrors: FieldErrors };

const fail = (fieldErrors: FieldErrors, status: 400 | 409 = 400): SaveResult => ({
  ok: false,
  status,
  message: status === 409 ? "That address is already used by another article on this website." : "Some details need attention before this can be saved.",
  fieldErrors,
});

/**
 * The database's own unique rule on (website, slug) refused the save. The check in `validate` normally catches this
 * first; this is the case where two saves raced, or another copy of the app took the slug in between.
 */
const slugTaken =
  (site: Site) =>
  (err: unknown): SaveResult => {
    if (err instanceof StoreConflictError) return fail({ slug: `That slug has just been taken by another article on ${site.name}. Choose a different slug.` }, 409);
    throw err;
  };

/**
 * Checks an article. A draft only needs a title and a valid slug, so work in progress can always be saved.
 * Publishing needs everything a reader or search engine relies on.
 */
function validate(db: Database, site: Site, raw: unknown, existingId: string | null): { ok: true; data: PostInput } | { ok: false; result: SaveResult } {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, result: fail(fieldErrors) };
  }
  const data: PostInput = {
    ...parsed.data,
    body: cleanBlocks(parsed.data.body),
    tags: [...new Set(parsed.data.tags.map((t) => t.toLowerCase()).filter(Boolean))],
    faq: parsed.data.faq.filter((f) => f.question || f.answer),
    sources: parsed.data.sources.filter((s) => s.label || s.url),
    relatedLinks: parsed.data.relatedLinks.filter((l) => l.label || l.href),
    slug: parsed.data.slug || slugify(parsed.data.title),
  };
  const errors: FieldErrors = {};
  const publishing = data.status === "published";

  if (!data.title) errors.title = "Enter a title.";
  if (!data.slug) errors.slug = "Enter a URL slug.";
  else if (!SLUG_PATTERN.test(data.slug)) errors.slug = "Use lowercase letters, numbers and hyphens only, for example customs-update-2026.";

  if (data.categoryId && !db.categories.some((c) => c.id === data.categoryId && c.siteId === site.id)) errors.categoryId = "Choose a category from this website.";
  if (data.authorId && !db.authors.some((a) => a.id === data.authorId && a.siteIds.includes(site.id))) errors.authorId = "Choose an author who writes for this website.";
  // An image may only be used if this website has a record of it with exactly that address.
  const uploadedHere = (ref: ImageRef) => db.media.some((m) => m.id === ref.mediaId && m.siteId === site.id && m.url === ref.url);
  if (data.coverImage && !uploadedHere(data.coverImage)) errors.coverImage = "Upload the image again: it was not found for this website.";
  if (data.body.some((b) => b.type === "image" && !uploadedHere(b.image))) errors.body = "Upload the image in the article again: it was not found for this website.";
  if (data.canonicalOverride && !/^https?:\/\/[^\s]+$/i.test(data.canonicalOverride)) errors.canonicalOverride = "Enter a full web address starting with https://, or leave it empty.";
  if (data.publishAt && Number.isNaN(Date.parse(data.publishAt))) errors.publishAt = "Enter a valid date and time.";
  if (data.lastReviewedAt && !/^\d{4}-\d{2}-\d{2}$/.test(data.lastReviewedAt)) errors.lastReviewedAt = "Enter a valid date.";
  if (data.sources.some((s) => !s.label || !/^https?:\/\/[^\s]+$/i.test(s.url))) errors.sources = "Each source needs a name and a web address starting with https://.";
  if (data.relatedLinks.some((l) => !l.label || !isSafeHref(l.href))) errors.relatedLinks = "Each related page needs a label and an address such as /services.";
  if (data.faq.some((f) => !f.question || !f.answer)) errors.faq = "Each FAQ needs both a question and an answer.";

  if (publishing) {
    if (!data.summary) errors.summary = "Add a short summary. It is shown on blog cards and in search results.";
    if (data.body.length === 0) errors.body = "Write the article content.";
    if (!data.categoryId) errors.categoryId ??= "Choose a category.";
    if (!data.authorId) errors.authorId ??= "Choose an author.";
    if (data.coverImage && !data.coverImage.alt) errors.coverImageAlt = "Describe the featured image for people who cannot see it.";
    if (data.body.some((b) => b.type === "image" && !b.image.alt)) errors.body ??= "Add alt text to every image in the article.";
  }

  if (Object.keys(errors).length) return { ok: false, result: fail(errors) };
  // Slugs are unique within one website. The same slug on another website is allowed.
  if (db.posts.some((p) => p.siteId === site.id && p.slug === data.slug && p.id !== existingId)) {
    return { ok: false, result: fail({ slug: `"${data.slug}" is already used by another article on ${site.name}. Choose a different slug.` }, 409) };
  }
  if (publishing && !data.publishAt) data.publishAt = new Date().toISOString();
  return { ok: true, data };
}

/** Keeps each image's record up to date with the alt text an editor last saved for it. */
function recordAltText(db: Database, site: Site, data: PostInput) {
  for (const ref of [data.coverImage, ...data.body.flatMap((b) => (b.type === "image" ? [b.image] : []))]) {
    const media = ref && db.media.find((m) => m.id === ref.mediaId && m.siteId === site.id);
    if (media && ref.alt && media.alt !== ref.alt) media.alt = ref.alt;
  }
}

export async function listPosts(site: Site): Promise<Post[]> {
  const db = await readDb();
  return db.posts.filter((p) => p.siteId === site.id).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function getPost(site: Site, id: string): Promise<Post | undefined> {
  const db = await readDb();
  return db.posts.find((p) => p.id === id && p.siteId === site.id);
}

export function createPost(site: Site, raw: unknown): Promise<SaveResult> {
  return mutateDb((db): SaveResult => {
    const checked = validate(db, site, raw, null);
    if (!checked.ok) return checked.result;
    const now = new Date().toISOString();
    const post: Post = { ...checked.data, id: newId("post"), siteId: site.id, copiedFromPostId: null, createdAt: now, updatedAt: now };
    db.posts.push(post);
    recordAltText(db, site, checked.data);
    audit(db, { siteId: site.id, action: post.status === "published" ? "post.create_published" : "post.create_draft", targetId: post.id, summary: post.title });
    return { ok: true, post };
  }).catch(slugTaken(site));
}

export function updatePost(site: Site, id: string, raw: unknown): Promise<SaveResult> {
  return mutateDb((db): SaveResult => {
    const index = db.posts.findIndex((p) => p.id === id && p.siteId === site.id);
    if (index < 0) return { ok: false, status: 404, message: "This article no longer exists.", fieldErrors: {} };
    const checked = validate(db, site, raw, id);
    if (!checked.ok) return checked.result;
    const before = db.posts[index];
    const post: Post = { ...before, ...checked.data, updatedAt: new Date().toISOString() };
    db.posts[index] = post;
    recordAltText(db, site, checked.data);
    const action = before.status !== post.status ? (post.status === "published" ? "post.publish" : "post.unpublish") : "post.update";
    audit(db, { siteId: site.id, action, targetId: post.id, summary: post.title });
    return { ok: true, post };
  }).catch(slugTaken(site));
}

/** Publish or unpublish without opening the editor. Publishing re-checks the article against the publishing rules. */
export function setPostStatus(site: Site, id: string, status: Post["status"]): Promise<SaveResult> {
  return mutateDb((db): SaveResult => {
    const index = db.posts.findIndex((p) => p.id === id && p.siteId === site.id);
    if (index < 0) return { ok: false, status: 404, message: "This article no longer exists.", fieldErrors: {} };
    const before = db.posts[index];
    // Re-publishing shows the article again straight away; a publish time still in the future is kept (scheduled).
    const checked = validate(db, site, { ...before, status }, id);
    if (!checked.ok) return checked.result;
    const post: Post = { ...before, ...checked.data, updatedAt: new Date().toISOString() };
    db.posts[index] = post;
    audit(db, { siteId: site.id, action: status === "published" ? "post.publish" : "post.unpublish", targetId: post.id, summary: post.title });
    return { ok: true, post };
  }).catch(slugTaken(site));
}

export function deletePost(site: Site, id: string): Promise<{ ok: boolean; message?: string }> {
  return mutateDb((db) => {
    const post = db.posts.find((p) => p.id === id && p.siteId === site.id);
    if (!post) return { ok: false, message: "This article no longer exists." };
    if (post.status === "published") return { ok: false, message: "Unpublish the article before deleting it." };
    db.posts = db.posts.filter((p) => p.id !== id);
    audit(db, { siteId: site.id, action: "post.delete", targetId: id, summary: post.title });
    return { ok: true };
  });
}

/**
 * Copies an article to another website as an independent draft: its own id, slug, status and SEO fields.
 * Images are not shared between websites, so the copy starts without them. Optionally its canonical points at the original.
 */
export function copyPost(site: Site, id: string, targetKey: string, canonicalToOriginal: boolean): Promise<SaveResult & { targetSiteKey?: string }> {
  return mutateDb((db): SaveResult & { targetSiteKey?: string } => {
    const source = db.posts.find((p) => p.id === id && p.siteId === site.id);
    const target = db.sites.find((s) => s.key === targetKey);
    if (!source || !target) return { ok: false, status: 404, message: "The article or the target website was not found.", fieldErrors: {} };
    if (target.id === site.id) return { ok: false, status: 400, message: "Choose a different website to copy to.", fieldErrors: {} };

    let slug = source.slug;
    for (let n = 2; db.posts.some((p) => p.siteId === target.id && p.slug === slug); n++) slug = `${source.slug}-${n}`;
    const sourceCategory = db.categories.find((c) => c.id === source.categoryId);
    const category = db.categories.find((c) => c.siteId === target.id && c.slug === sourceCategory?.slug);
    const author = db.authors.find((a) => a.id === source.authorId && a.siteIds.includes(target.id));
    const now = new Date().toISOString();
    const post: Post = {
      ...structuredClone(source),
      id: newId("post"),
      siteId: target.id,
      slug,
      status: "draft",
      publishAt: null,
      coverImage: null,
      body: source.body.filter((b) => b.type !== "image"),
      categoryId: category?.id ?? null,
      authorId: author?.id ?? null,
      relatedLinks: [],
      canonicalOverride: canonicalToOriginal ? canonicalUrl(site, source) : "",
      copiedFromPostId: source.id,
      createdAt: now,
      updatedAt: now,
    };
    db.posts.push(post);
    audit(db, { siteId: target.id, action: "post.copy_from_site", targetId: post.id, summary: `${source.title} (copied from ${site.name})` });
    return { ok: true, post, targetSiteKey: target.key };
  }).catch(slugTaken(site));
}

/* ---------- Public (read-only) views. Only visible articles ever leave these functions. ---------- */

export async function publicPosts(site: Site, categorySlug?: string): Promise<PublicPost[]> {
  const db = await readDb();
  const now = Date.now();
  return db.posts
    .filter((p) => p.siteId === site.id && isVisible(p, now))
    .sort((a, b) => Date.parse(b.publishAt ?? "") - Date.parse(a.publishAt ?? ""))
    .map((p) => toPublicPost(site, p, db.authors, db.categories, mediaBase()))
    .filter((p) => !categorySlug || p.category?.slug === categorySlug);
}

export async function publicPostBySlug(site: Site, slug: string): Promise<{ post: PublicPost; related: PublicCard[] } | undefined> {
  const all = await publicPosts(site);
  const post = all.find((p) => p.slug === slug);
  return post ? { post, related: pickRelated(post, all).map(toCard) } : undefined;
}

/** For the admin preview: any status, same shape the public pages use. */
export async function previewPost(site: Site, id: string): Promise<{ post: PublicPost; raw: Post; related: PublicCard[] } | undefined> {
  const db = await readDb();
  const raw = db.posts.find((p) => p.id === id && p.siteId === site.id);
  if (!raw) return undefined;
  const post = toPublicPost(site, raw, db.authors, db.categories, mediaBase());
  const others = await publicPosts(site);
  return { post, raw, related: pickRelated(post, others).map(toCard) };
}
