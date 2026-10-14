import { json, notFound, safely, siteByKey } from "@/server/http";
import { publicPosts } from "@/server/posts";
import { readDb } from "@/server/store";

/** categories · sitemap (read-only, visible articles only) */
export const GET = safely(async (_request: Request, ctx: { params: Promise<{ site: string; resource: string }> }) => {
  const { site: key, resource } = await ctx.params;
  const site = await siteByKey(key);
  if (!site) return notFound("Website not found.");
  const posts = await publicPosts(site);

  if (resource === "categories") {
    const db = await readDb();
    const categories = db.categories
      .filter((c) => c.siteId === site.id)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ slug: c.slug, label: c.label, count: posts.filter((p) => p.category?.slug === c.slug).length }));
    return json({ site: site.key, categories });
  }
  if (resource === "sitemap") {
    return json({ site: site.key, urls: posts.map((p) => ({ loc: p.canonicalUrl, path: p.path, lastModified: p.updatedAt })) });
  }
  return notFound("Unknown resource.");
});
