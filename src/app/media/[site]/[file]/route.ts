import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { uploadsDir } from "@/server/store";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif" };

/** Serves an uploaded image from the local uploads folder. Public: no sign-in is needed to view a published image. */
export async function GET(_request: Request, ctx: { params: Promise<{ site: string; file: string }> }) {
  const { site, file } = await ctx.params;
  // Only names this app generates are accepted, so a request cannot reach outside the uploads folder.
  const match = /^[a-z0-9]+-[a-f0-9]{12}\.(jpg|png|webp|avif|gif)$/.exec(file);
  if (!/^[a-z0-9-]{1,60}$/.test(site) || !match) return new Response("Not found", { status: 404 });
  const full = path.join(uploadsDir(), site, file);
  if (!existsSync(full)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(readFileSync(full)), {
    headers: { "Content-Type": TYPES[match[1]], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
