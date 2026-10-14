import { forbidden, json, notFound, readJson, sameOrigin, siteByKey } from "@/server/http";
import { createPost, listPosts } from "@/server/posts";

type Ctx = { params: Promise<{ site: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const site = await siteByKey((await ctx.params).site);
  if (!site) return notFound("Website not found.");
  return json({ posts: await listPosts(site) });
}

export async function POST(request: Request, ctx: Ctx) {
  if (!sameOrigin(request)) return forbidden();
  const site = await siteByKey((await ctx.params).site);
  if (!site) return notFound("Website not found.");
  const result = await createPost(site, await readJson(request));
  if (!result.ok) return json({ error: "invalid", message: result.message, fieldErrors: result.fieldErrors }, result.status);
  return json({ post: result.post }, 201);
}
