import { imageStoreKind } from "@/server/cloudinary";
import { json } from "@/server/http";
import { readDb, storeKind } from "@/server/store";

/** Confirms the app is running and can read its store. Reports counts and which kind of storage is in use: no content, paths, addresses or account details. */
export async function GET() {
  try {
    const db = await readDb();
    return json({ ok: true, store: storeKind(), images: imageStoreKind(), sites: db.sites.length, posts: db.posts.length, media: db.media.length, node: process.version });
  } catch {
    return json({ ok: false, message: "The content store could not be read." }, 503);
  }
}
