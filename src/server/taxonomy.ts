import "server-only";
import { z } from "zod";
import { SLUG_PATTERN, slugify } from "@/lib/content";
import type { Author, Category, FieldErrors, Site } from "@/lib/types";
import { StoreConflictError, audit, mutateDb, newId } from "./store";

/** Categories (per website), authors (shared, linked to websites) and website settings. */

type Result<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409; message: string; fieldErrors: FieldErrors };
const invalid = <T>(fieldErrors: FieldErrors, message = "Some details need attention."): Result<T> => ({ ok: false, status: 400, message, fieldErrors });
const missing = <T>(what: string): Result<T> => ({ ok: false, status: 404, message: `${what} was not found.`, fieldErrors: {} });

/* ---------- Categories ---------- */

const categoryInput = z.object({ label: z.string().trim().min(1, "Enter a category name.").max(60), slug: z.string().trim().toLowerCase().max(60).optional() });

export function saveCategory(site: Site, id: string | null, raw: unknown): Promise<Result<Category>> {
  return mutateDb((db): Result<Category> => {
    const parsed = categoryInput.safeParse(raw);
    if (!parsed.success) return invalid({ label: parsed.error.issues[0]?.message ?? "Enter a category name." });
    const slug = parsed.data.slug || slugify(parsed.data.label);
    if (!SLUG_PATTERN.test(slug)) return invalid({ slug: "Use lowercase letters, numbers and hyphens only." });
    const mine = db.categories.filter((c) => c.siteId === site.id);
    if (mine.some((c) => c.slug === slug && c.id !== id)) return { ok: false, status: 409, message: "This website already has a category with that slug.", fieldErrors: { slug: "Already used on this website." } };
    if (id) {
      const existing = mine.find((c) => c.id === id);
      if (!existing) return missing("The category");
      existing.label = parsed.data.label;
      existing.slug = slug;
      audit(db, { siteId: site.id, action: "category.update", targetId: id, summary: existing.label });
      return { ok: true, value: existing };
    }
    const category: Category = { id: newId("cat"), siteId: site.id, slug, label: parsed.data.label, order: mine.length + 1 };
    db.categories.push(category);
    audit(db, { siteId: site.id, action: "category.create", targetId: category.id, summary: category.label });
    return { ok: true, value: category };
  }).catch((err: unknown): Result<Category> => {
    // The database's unique rule on (website, category slug), for a save that raced another one.
    if (err instanceof StoreConflictError) return { ok: false, status: 409, message: "This website already has a category with that slug.", fieldErrors: { slug: "Already used on this website." } };
    throw err;
  });
}

export function deleteCategory(site: Site, id: string): Promise<Result<null>> {
  return mutateDb((db) => {
    const category = db.categories.find((c) => c.id === id && c.siteId === site.id);
    if (!category) return missing("The category");
    const used = db.posts.filter((p) => p.siteId === site.id && p.categoryId === id).length;
    if (used) return { ok: false, status: 409, message: `${used} article${used === 1 ? " uses" : "s use"} this category. Move them to another category first.`, fieldErrors: {} };
    db.categories = db.categories.filter((c) => c.id !== id);
    audit(db, { siteId: site.id, action: "category.delete", targetId: id, summary: category.label });
    return { ok: true, value: null };
  });
}

/* ---------- Authors ---------- */

const authorInput = z.object({
  kind: z.enum(["person", "organisation"]),
  name: z.string().trim().min(1, "Enter the author's name.").max(100),
  jobTitle: z.string().trim().max(120).default(""),
  bio: z.string().trim().max(800).default(""),
  profileUrls: z.array(z.string().trim().max(300)).max(8).default([]),
  siteIds: z.array(z.string()).default([]),
});

export function saveAuthor(id: string | null, raw: unknown): Promise<Result<Author>> {
  return mutateDb((db) => {
    const parsed = authorInput.safeParse(raw);
    if (!parsed.success) return invalid({ name: parsed.error.issues[0]?.message ?? "Enter the author's name." });
    const profileUrls = parsed.data.profileUrls.filter(Boolean);
    if (profileUrls.some((u) => !/^https?:\/\/[^\s]+$/i.test(u))) return invalid({ profileUrls: "Each profile link must be a full web address starting with https://." });
    const siteIds = parsed.data.siteIds.filter((s) => db.sites.some((site) => site.id === s));
    if (siteIds.length === 0) return invalid({ siteIds: "Choose at least one website this author writes for." });
    const fields = { ...parsed.data, profileUrls, siteIds, slug: slugify(parsed.data.name) };
    if (id) {
      const index = db.authors.findIndex((a) => a.id === id);
      if (index < 0) return missing("The author");
      const removed = db.authors[index].siteIds.filter((s) => !siteIds.includes(s));
      const stillUsed = db.posts.some((p) => p.authorId === id && removed.includes(p.siteId));
      if (stillUsed) return invalid({ siteIds: "This author has articles on a website you un-ticked. Reassign those articles first." });
      db.authors[index] = { ...db.authors[index], ...fields };
      audit(db, { siteId: null, action: "author.update", targetId: id, summary: fields.name });
      return { ok: true, value: db.authors[index] };
    }
    const author: Author = { id: newId("author"), ...fields };
    db.authors.push(author);
    audit(db, { siteId: null, action: "author.create", targetId: author.id, summary: author.name });
    return { ok: true, value: author };
  });
}

export function deleteAuthor(id: string): Promise<Result<null>> {
  return mutateDb((db) => {
    const author = db.authors.find((a) => a.id === id);
    if (!author) return missing("The author");
    const used = db.posts.filter((p) => p.authorId === id).length;
    if (used) return { ok: false, status: 409, message: `${used} article${used === 1 ? " is" : "s are"} by this author. Reassign them first.`, fieldErrors: {} };
    db.authors = db.authors.filter((a) => a.id !== id);
    audit(db, { siteId: null, action: "author.delete", targetId: id, summary: author.name });
    return { ok: true, value: null };
  });
}

/* ---------- Website settings ---------- */

const path = z
  .string()
  .trim()
  .max(120)
  .regex(/^\/[a-z0-9\-/{}]*$/, "Start with / and use lowercase letters, numbers and hyphens.");
const settingsInput = z.object({
  name: z.string().trim().min(1, "Enter the website's name.").max(80),
  note: z.string().trim().max(80).default(""),
  baseUrl: z.string().trim().regex(/^https?:\/\/[^\s/]+(\/[^\s]*)?$/i, "Enter the website's full address, starting with https://."),
  listingPath: path,
  articlePathPattern: path.refine((p) => p.includes("{slug}"), "Include {slug} where the article's slug goes, for example /blog/{slug}."),
  seo: z.object({
    titleSuffix: z.string().trim().min(1, "Enter the text added after article titles.").max(60),
    organisationName: z.string().trim().min(1, "Enter the organisation's name.").max(100),
    listingTitle: z.string().trim().min(1, "Enter the blog's title.").max(60),
    listingDescription: z.string().trim().max(300).default(""),
  }),
});

export function saveSettings(site: Site, raw: unknown): Promise<Result<Site>> {
  return mutateDb((db) => {
    const parsed = settingsInput.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return invalid(fieldErrors);
    }
    const data = parsed.data;
    // The listing and the article pattern share one address space, so they must not collide.
    if (data.articlePathPattern.replace("{slug}", "") === `${data.listingPath}`) return invalid({ articlePathPattern: "The article address must differ from the listing address." });
    const index = db.sites.findIndex((s) => s.id === site.id);
    if (index < 0) return missing("The website");
    db.sites[index] = { ...db.sites[index], ...data, baseUrl: data.baseUrl.replace(/\/+$/, ""), updatedAt: new Date().toISOString() };
    audit(db, { siteId: site.id, action: "site.update_settings", targetId: site.id, summary: data.name });
    return { ok: true, value: db.sites[index] };
  });
}
