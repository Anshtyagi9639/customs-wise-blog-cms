/** Data shapes shared by the admin screens, the API and the public preview. */

export type ThemeKey = "customs-wise" | "demo";

/** One website served by the CMS. Every piece of content belongs to exactly one site. */
export type Site = {
  id: string;
  /** Short, stable identifier used in URLs and the public API, e.g. "customs-wise". */
  key: string;
  name: string;
  /** Shown beside the name so nobody mistakes a test configuration for the real website. */
  note: string;
  /** Address of the real website. Used for canonical URLs and structured data only: nothing is sent there. */
  baseUrl: string;
  listingPath: string;
  /** Must contain "{slug}", e.g. "/insights/blog/{slug}". */
  articlePathPattern: string;
  theme: ThemeKey;
  locale: string;
  seo: { titleSuffix: string; organisationName: string; listingTitle: string; listingDescription: string };
  createdAt: string;
  updatedAt: string;
};

export type Category = { id: string; siteId: string; slug: string; label: string; order: number };

export type Author = {
  id: string;
  kind: "person" | "organisation";
  name: string;
  slug: string;
  jobTitle: string;
  bio: string;
  /** Public profile pages (LinkedIn, company page). Output as sameAs in structured data. */
  profileUrls: string[];
  /** Websites this author can be chosen on. */
  siteIds: string[];
};

export type ImageRef = { mediaId: string; url: string; alt: string; caption: string; width: number; height: number };

/**
 * Article content is a list of approved blocks, never free HTML.
 * Text supports two inline marks only: **bold** and [link text](address).
 */
export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string; cite: string }
  | { type: "callout"; text: string }
  | { type: "image"; image: ImageRef };

export type BlockType = Block["type"];
export type FaqItem = { question: string; answer: string };
export type SourceLink = { label: string; url: string };
export type NavLink = { label: string; href: string };

/** Stored status. "Scheduled" is not stored: it is a published post whose publish time is still in the future. */
export type PostStatus = "draft" | "published";
export type DisplayStatus = "draft" | "scheduled" | "published";

export type Post = {
  id: string;
  siteId: string;
  slug: string;
  title: string;
  summary: string;
  body: Block[];
  coverImage: ImageRef | null;
  categoryId: string | null;
  authorId: string | null;
  tags: string[];
  seo: { title: string; description: string };
  /** Empty = canonical is generated from the site's address and the slug. */
  canonicalOverride: string;
  status: PostStatus;
  /** ISO date-time. A published post is visible only once this time has passed. */
  publishAt: string | null;
  /** Keeps a post in date order without showing a date (five existing Customs Wise posts have no known year). */
  hideDate: boolean;
  faq: FaqItem[];
  sources: SourceLink[];
  /** Pages on the same website to point readers to, shown beside the article. */
  relatedLinks: NavLink[];
  /** ISO date (YYYY-MM-DD). */
  lastReviewedAt: string | null;
  readMinutesOverride: number | null;
  copiedFromPostId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What the editor sends. Ids, site and timestamps are set by the server. */
export type PostInput = Omit<Post, "id" | "siteId" | "createdAt" | "updatedAt" | "copiedFromPostId">;

export type Media = {
  id: string;
  siteId: string;
  /** Where the file is kept. Records made before image hosting was added have no value and are local. */
  storage?: "local" | "cloudinary";
  /** Cloudinary public ID, for example "customs-wise/blog/abc123". Only for images stored on Cloudinary. */
  publicId?: string;
  /** Local images: a path on this app (/media/...). Cloudinary images: the full https address. */
  url: string;
  /** The alt text most recently saved with this image in an article. */
  alt?: string;
  fileName: string;
  originalName: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  createdAt: string;
};

export type AuditEntry = { id: string; at: string; siteId: string | null; actor: string; action: string; targetId: string | null; summary: string };

/** Everything a website needs to show an article. Contains public information only. */
export type PublicPost = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  /** Path on the website, e.g. /insights/blog/my-post */
  path: string;
  canonicalUrl: string;
  category: { slug: string; label: string } | null;
  author: Pick<Author, "kind" | "name" | "jobTitle" | "bio" | "profileUrls"> | null;
  tags: string[];
  coverImage: ImageRef | null;
  publishedAt: string | null;
  /** Null when the date should not be shown. */
  displayDate: string | null;
  updatedAt: string;
  lastReviewedAt: string | null;
  readMinutes: number;
  seo: { title: string; description: string };
  faq: FaqItem[];
  sources: SourceLink[];
  relatedLinks: NavLink[];
  body: Block[];
  /** The body as ready-made HTML, generated from the blocks with all text escaped. */
  html: string;
  jsonLd: Record<string, unknown>[];
};

export type PublicCard = Pick<PublicPost, "id" | "slug" | "title" | "summary" | "path" | "category" | "author" | "coverImage" | "displayDate" | "readMinutes" | "tags">;

export type FieldErrors = Record<string, string>;
