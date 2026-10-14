import { forbidden, json, notFound, readJson, sameOrigin, siteByKey } from "@/server/http";
import { deleteCategory, saveCategory } from "@/server/taxonomy";

type Ctx = { params: Promise<{ site: string }> };

/** Create (no id), rename (with id) or delete (with id and delete: true) a category of this website. */
export async function POST(request: Request, ctx: Ctx) {
  if (!sameOrigin(request)) return forbidden();
  const site = await siteByKey((await ctx.params).site);
  if (!site) return notFound("Website not found.");
  const body = ((await readJson(request)) ?? {}) as { id?: string; delete?: boolean };
  const result = body.delete && body.id ? await deleteCategory(site, body.id) : await saveCategory(site, body.id ?? null, body);
  if (!result.ok) return json({ error: "invalid", message: result.message, fieldErrors: result.fieldErrors }, result.status);
  return json({ category: result.value });
}
