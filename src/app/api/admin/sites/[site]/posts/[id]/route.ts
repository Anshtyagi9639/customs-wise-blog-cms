import { forbidden, json, notFound, readJson, sameOrigin, siteByKey } from "@/server/http";
import { deletePost, getPost, updatePost } from "@/server/posts";

type Ctx = { params: Promise<{ site: string; id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { site: key, id } = await ctx.params;
  const site = await siteByKey(key);
  const post = site && (await getPost(site, id));
  return post ? json({ post }) : notFound("Article not found on this website.");
}

export async function PUT(request: Request, ctx: Ctx) {
  if (!sameOrigin(request)) return forbidden();
  const { site: key, id } = await ctx.params;
  const site = await siteByKey(key);
  if (!site) return notFound("Website not found.");
  const result = await updatePost(site, id, await readJson(request));
  if (!result.ok) return json({ error: "invalid", message: result.message, fieldErrors: result.fieldErrors }, result.status);
  return json({ post: result.post });
}

export async function DELETE(request: Request, ctx: Ctx) {
  if (!sameOrigin(request)) return forbidden();
  const { site: key, id } = await ctx.params;
  const site = await siteByKey(key);
  if (!site) return notFound("Website not found.");
  const result = await deletePost(site, id);
  return result.ok ? json({ ok: true }) : json({ error: "invalid", message: result.message }, 409);
}
