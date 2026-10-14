import { forbidden, json, notFound, readJson, sameOrigin } from "@/server/http";
import { readDb } from "@/server/store";
import { saveSettings } from "@/server/taxonomy";

type Ctx = { params: Promise<{ site: string }> };

/** A website's settings, with the categories and authors that can be used on it. */
export async function GET(_request: Request, ctx: Ctx) {
  const { site: key } = await ctx.params;
  const db = await readDb();
  const site = db.sites.find((s) => s.key === key);
  if (!site) return notFound("Website not found.");
  return json({
    site,
    categories: db.categories.filter((c) => c.siteId === site.id).sort((a, b) => a.order - b.order),
    authors: db.authors.filter((a) => a.siteIds.includes(site.id)),
  });
}

export async function PUT(request: Request, ctx: Ctx) {
  if (!sameOrigin(request)) return forbidden();
  const { site: key } = await ctx.params;
  const site = (await readDb()).sites.find((s) => s.key === key);
  if (!site) return notFound("Website not found.");
  const result = await saveSettings(site, await readJson(request));
  if (!result.ok) return json({ error: "invalid", message: result.message, fieldErrors: result.fieldErrors }, result.status);
  return json({ site: result.value });
}
