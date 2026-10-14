import { badRequest, forbidden, json, notFound, readJson, sameOrigin, siteByKey } from "@/server/http";
import { copyPost, setPostStatus } from "@/server/posts";

type Ctx = { params: Promise<{ site: string; id: string; action: string }> };

/** publish · unpublish · copy (to another website) */
export async function POST(request: Request, ctx: Ctx) {
  if (!sameOrigin(request)) return forbidden();
  const { site: key, id, action } = await ctx.params;
  const site = await siteByKey(key);
  if (!site) return notFound("Website not found.");

  if (action === "publish" || action === "unpublish") {
    const result = await setPostStatus(site, id, action === "publish" ? "published" : "draft");
    if (!result.ok) return json({ error: "invalid", message: result.message, fieldErrors: result.fieldErrors }, result.status);
    return json({ post: result.post });
  }
  if (action === "copy") {
    const body = (await readJson(request)) as { targetSiteKey?: unknown; canonicalToOriginal?: unknown } | undefined;
    if (typeof body?.targetSiteKey !== "string") return badRequest("Choose the website to copy this article to.");
    const result = await copyPost(site, id, body.targetSiteKey, body.canonicalToOriginal === true);
    if (!result.ok) return json({ error: "invalid", message: result.message, fieldErrors: result.fieldErrors }, result.status);
    return json({ post: result.post, targetSiteKey: result.targetSiteKey }, 201);
  }
  return notFound("Unknown action.");
}
