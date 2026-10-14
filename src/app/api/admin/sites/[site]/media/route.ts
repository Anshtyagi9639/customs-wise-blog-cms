import { badRequest, forbidden, json, notFound, sameOrigin, siteByKey } from "@/server/http";
import { MAX_IMAGE_BYTES, saveImage } from "@/server/media";

/** Image upload (multipart form, field name "file"). Type, size and dimensions are checked on the server. */
export async function POST(request: Request, ctx: { params: Promise<{ site: string }> }) {
  if (!sameOrigin(request)) return forbidden();
  const site = await siteByKey((await ctx.params).site);
  if (!site) return notFound("Website not found.");

  // Refuse clearly oversized uploads before reading them into memory.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES + 200_000) return json({ error: "too_large", message: "The image is larger than the 5 MB limit." }, 413);

  let file: FormDataEntryValue | null = null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return badRequest("The upload could not be read. Choose the image again.");
  }
  if (!(file instanceof File)) return badRequest("Choose an image file to upload.");

  const result = await saveImage(site, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
  if (!result.ok) return json({ error: result.status >= 500 ? "image_storage_unavailable" : "invalid_image", message: result.message }, result.status);
  return json({ media: result.media }, 201);
}
