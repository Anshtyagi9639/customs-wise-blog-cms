import type { Author, Block, Category, DisplayStatus, Post, PublicCard, PublicPost, Site } from "./types";

/** Pure content rules, safe to use in the browser (live preview) and on the server (API, public pages). */

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Links may only go to web addresses, email, phone, or a path on the same website. */
export function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)[^\s"'<>]+$/i.test(href) || /^\/(?!\/)[^\s"'<>]*$/.test(href) || /^#[\w-]*$/.test(href);
}

export type InlinePart = string | { strong: string } | { text: string; href: string };

/** Splits text into plain parts, **bold** parts and [label](address) links. Unsafe addresses are left as plain text. */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    if (m[1] !== undefined) parts.push({ strong: m[1] });
    else if (isSafeHref(m[3])) parts.push({ text: m[2], href: m[3] });
    else parts.push(m[0]);
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function inlineHtml(text: string): string {
  return parseInline(text)
    .map((part) => {
      if (typeof part === "string") return escapeHtml(part).replace(/\n/g, "<br>");
      if ("strong" in part) return `<strong>${escapeHtml(part.strong)}</strong>`;
      const external = /^https?:/i.test(part.href);
      return `<a href="${escapeHtml(part.href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(part.text)}</a>`;
    })
    .join("");
}

/**
 * Article body as HTML for websites that cannot render the blocks themselves.
 * Built only from the approved block types, with every piece of text escaped, so it is safe to insert as-is.
 */
export function blocksToHtml(blocks: Block[], mediaBase = ""): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "h2":
        case "h3":
          return `<${b.type}>${escapeHtml(b.text)}</${b.type}>`;
        case "ul":
        case "ol":
          return `<${b.type}>${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("")}</${b.type}>`;
        case "quote":
          return `<blockquote><p>${inlineHtml(b.text)}</p>${b.cite ? `<cite>${escapeHtml(b.cite)}</cite>` : ""}</blockquote>`;
        case "callout":
          return `<div class="callout"><p>${inlineHtml(b.text)}</p></div>`;
        case "image":
          return `<figure><img src="${escapeHtml(absolute(b.image.url, mediaBase))}" alt="${escapeHtml(b.image.alt)}" width="${b.image.width}" height="${b.image.height}" loading="lazy">${
            b.image.caption ? `<figcaption>${escapeHtml(b.image.caption)}</figcaption>` : ""
          }</figure>`;
        default:
          return `<p>${inlineHtml(b.text)}</p>`;
      }
    })
    .join("\n");
}

export function blockText(b: Block): string {
  if (b.type === "ul" || b.type === "ol") return b.items.join(" ");
  if (b.type === "image") return b.image.caption;
  return b.text;
}

/** Removes blocks the editor left empty, so they are neither saved nor counted. */
export function cleanBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((b): Block[] => {
    if (b.type === "ul" || b.type === "ol") {
      const items = b.items.map((i) => i.trim()).filter(Boolean);
      return items.length ? [{ ...b, items }] : [];
    }
    if (b.type === "image") return b.image.url ? [b] : [];
    return b.text.trim() ? [{ ...b, text: b.text.trim() }] : [];
  });
}

export function readMinutes(post: Pick<Post, "body" | "summary" | "faq" | "readMinutesOverride">): number {
  if (post.readMinutesOverride) return post.readMinutesOverride;
  const words = [post.summary, ...post.body.map(blockText), ...post.faq.flatMap((f) => [f.question, f.answer])].join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function articlePath(site: Pick<Site, "articlePathPattern">, slug: string): string {
  return site.articlePathPattern.replace("{slug}", slug);
}

/** Generated from the website's address and the slug unless the editor set an override. */
export function canonicalUrl(site: Pick<Site, "baseUrl" | "articlePathPattern">, post: Pick<Post, "slug" | "canonicalOverride">): string {
  return post.canonicalOverride.trim() || `${site.baseUrl.replace(/\/+$/, "")}${articlePath(site, post.slug)}`;
}

export function seoTitle(site: Pick<Site, "seo">, post: Pick<Post, "title" | "seo">): string {
  return post.seo.title.trim() || `${post.title} | ${site.seo.titleSuffix}`;
}

export function seoDescription(post: Pick<Post, "summary" | "seo">): string {
  return post.seo.description.trim() || post.summary;
}

/** The one rule that decides what the public can see: published, and its publish time has passed. */
export function isVisible(post: Pick<Post, "status" | "publishAt">, now = Date.now()): boolean {
  return post.status === "published" && post.publishAt !== null && Date.parse(post.publishAt) <= now;
}

export function displayStatus(post: Pick<Post, "status" | "publishAt">, now = Date.now()): DisplayStatus {
  if (post.status !== "published") return "draft";
  return isVisible(post, now) ? "published" : "scheduled";
}

export function formatDate(iso: string, locale = "en-IE"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale = "en-IE"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function absolute(url: string, base: string): string {
  return /^https?:/i.test(url) ? url : `${base.replace(/\/+$/, "")}${url}`;
}

/** Structured data generated from the article's own fields: article, breadcrumb, and FAQ only when there is one. */
export function buildJsonLd(site: Site, post: Post, author: Author | undefined, category: Category | undefined, mediaBase: string): Record<string, unknown>[] {
  const canonical = canonicalUrl(site, post);
  const base = site.baseUrl.replace(/\/+$/, "");
  const organisation = { "@type": "Organization", name: site.seo.organisationName, url: `${base}/` };
  const article: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: seoDescription(post),
    url: canonical,
    mainEntityOfPage: canonical,
    inLanguage: site.locale,
    author:
      author && author.kind === "person"
        ? { "@type": "Person", name: author.name, ...(author.jobTitle ? { jobTitle: author.jobTitle } : {}), ...(author.profileUrls.length ? { sameAs: author.profileUrls } : {}) }
        : { "@type": "Organization", name: author?.name ?? site.seo.organisationName, ...(author?.profileUrls.length ? { sameAs: author.profileUrls } : {}) },
    publisher: organisation,
    dateModified: post.updatedAt,
  };
  if (post.publishAt && !post.hideDate) article.datePublished = post.publishAt;
  if (post.coverImage) article.image = absolute(post.coverImage.url, mediaBase);
  if (category) article.articleSection = category.label;
  if (post.tags.length) article.keywords = post.tags.join(", ");
  if (post.lastReviewedAt) article.lastReviewed = post.lastReviewedAt;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
      { "@type": "ListItem", position: 2, name: site.seo.listingTitle, item: `${base}${site.listingPath}` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonical },
    ],
  };
  const out: Record<string, unknown>[] = [article, breadcrumb];
  if (post.faq.length) {
    out.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: post.faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
    });
  }
  return out;
}

export function toPublicPost(site: Site, post: Post, authors: Author[], categories: Category[], mediaBase: string): PublicPost {
  const author = authors.find((a) => a.id === post.authorId);
  const category = categories.find((c) => c.id === post.categoryId && c.siteId === site.id);
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    path: articlePath(site, post.slug),
    canonicalUrl: canonicalUrl(site, post),
    category: category ? { slug: category.slug, label: category.label } : null,
    author: author ? { kind: author.kind, name: author.name, jobTitle: author.jobTitle, bio: author.bio, profileUrls: author.profileUrls } : null,
    tags: post.tags,
    coverImage: post.coverImage,
    publishedAt: post.publishAt,
    displayDate: post.hideDate ? null : post.publishAt,
    updatedAt: post.updatedAt,
    lastReviewedAt: post.lastReviewedAt,
    readMinutes: readMinutes(post),
    seo: { title: seoTitle(site, post), description: seoDescription(post) },
    faq: post.faq,
    sources: post.sources,
    relatedLinks: post.relatedLinks,
    body: post.body,
    html: blocksToHtml(post.body, mediaBase),
    jsonLd: buildJsonLd(site, post, author, category, mediaBase),
  };
}

export function toCard(p: PublicPost): PublicCard {
  const { id, slug, title, summary, path, category, author, coverImage, displayDate, readMinutes: minutes, tags } = p;
  return { id, slug, title, summary, path, category, author, coverImage, displayDate, readMinutes: minutes, tags };
}

/** Same category first (newest first), then the newest from other categories. */
export function pickRelated<T extends { id: string; category: { slug: string } | null }>(current: T, others: T[], count = 3): T[] {
  const rest = others.filter((p) => p.id !== current.id);
  return [...rest.filter((p) => p.category?.slug === current.category?.slug), ...rest.filter((p) => p.category?.slug !== current.category?.slug)].slice(0, count);
}

export function emptyPostInput(): Omit<Post, "id" | "siteId" | "createdAt" | "updatedAt" | "copiedFromPostId"> {
  return {
    slug: "",
    title: "",
    summary: "",
    body: [{ type: "p", text: "" }],
    coverImage: null,
    categoryId: null,
    authorId: null,
    tags: [],
    seo: { title: "", description: "" },
    canonicalOverride: "",
    status: "draft",
    publishAt: null,
    hideDate: false,
    faq: [],
    sources: [],
    relatedLinks: [],
    lastReviewedAt: null,
    readMinutesOverride: null,
  };
}
