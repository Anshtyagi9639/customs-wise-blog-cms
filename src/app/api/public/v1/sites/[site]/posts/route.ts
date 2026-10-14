import { toCard } from "@/lib/content";
import { json, notFound, safely, siteByKey } from "@/server/http";
import { publicPosts } from "@/server/posts";

/**
 * Read-only list of one website's visible articles (published, and past their publish time), newest first.
 * Drafts, scheduled articles and other websites' articles are never returned.
 */
export const GET = safely(async (request: Request, ctx: { params: Promise<{ site: string }> }) => {
  const site = await siteByKey((await ctx.params).site);
  if (!site) return notFound("Website not found.");
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? undefined;
  if (category && !/^[a-z0-9-]{1,60}$/.test(category)) return json({ error: "invalid", message: "Invalid category." }, 400);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const all = await publicPosts(site, category);
  const items = all.slice((page - 1) * limit, page * limit).map(toCard);
  return json({ site: site.key, page, limit, total: all.length, posts: items });
});
