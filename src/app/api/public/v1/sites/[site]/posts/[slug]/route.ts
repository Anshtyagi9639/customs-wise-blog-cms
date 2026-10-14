import { json, notFound, safely, siteByKey } from "@/server/http";
import { publicPostBySlug } from "@/server/posts";

/** One visible article with its body (blocks and ready-made HTML), SEO fields and structured data. 404 otherwise. */
export const GET = safely(async (_request: Request, ctx: { params: Promise<{ site: string; slug: string }> }) => {
  const { site: key, slug } = await ctx.params;
  const site = await siteByKey(key);
  if (!site) return notFound("Website not found.");
  const found = await publicPostBySlug(site, slug);
  return found ? json({ site: site.key, post: found.post, related: found.related }) : notFound("Article not found.");
});
