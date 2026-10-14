import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Media, Site } from "@/lib/types";
import { ImageHostError, cloudinaryConfig, removeFromCloudinary, uploadToCloudinary } from "./cloudinary";
import { audit, mutateDb, newId, uploadsDir } from "./store";

/**
 * Image uploads. Every file is checked here first (real type, size, dimensions), then stored in one of two places:
 *
 * - Cloudinary, when CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are set. The file goes to the
 *   website's own folder (<website>/blog/) and the record keeps the public ID and the https address.
 * - Otherwise the local folder data/uploads/<website>/, served back by /media/<website>/<file>.
 *
 * Images uploaded earlier to the local folder keep working whichever is in use: each record says where its file is.
 * Only a record describing the image is saved in the database, never the image itself, and only after the file has
 * been stored successfully.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" } as const;
type Mime = keyof typeof ALLOWED_IMAGE_TYPES;

/** The real type, read from the file's first bytes. The name and the browser's stated type are not trusted. */
export function sniffImageType(b: Buffer): Mime | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.toString("latin1", 0, 4) === "GIF8") return "image/gif";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (b.toString("latin1", 4, 8) === "ftyp" && /^(avif|avis)$/.test(b.toString("latin1", 8, 12))) return "image/avif";
  return null;
}

/** Width and height read from the file header, so the page can reserve the right space and avoid layout shift. */
export function imageSize(b: Buffer, mime: Mime): { width: number; height: number } | null {
  try {
    if (mime === "image/png") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (mime === "image/gif") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (mime === "image/jpeg") {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        const length = b.readUInt16BE(i + 2);
        // Start-of-frame markers carry the dimensions (C4, C8 and CC are not frames).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        i += 2 + length;
      }
      return null;
    }
    if (mime === "image/webp") {
      const kind = b.toString("latin1", 12, 16);
      if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (kind === "VP8L") {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    // AVIF: the "ispe" (image spatial extents) box holds width and height.
    const at = b.indexOf("ispe", 0, "latin1");
    return at > 0 && at + 16 <= b.length ? { width: b.readUInt32BE(at + 8), height: b.readUInt32BE(at + 12) } : null;
  } catch {
    return null;
  }
}

export type UploadResult = { ok: true; media: Media } | { ok: false; status: 400 | 413 | 415 | 502 | 503; message: string };

export async function saveImage(site: Site, file: { name: string; bytes: Buffer }): Promise<UploadResult> {
  const { bytes } = file;
  if (bytes.length === 0) return { ok: false, status: 400, message: "The file is empty. Choose an image file." };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, status: 413, message: `The image is ${(bytes.length / 1048576).toFixed(1)} MB. The limit is 5 MB.` };
  const mime = sniffImageType(bytes);
  if (!mime) return { ok: false, status: 415, message: "That file is not a supported image. Use JPEG, PNG, WebP, AVIF or GIF." };
  const size = imageSize(bytes, mime);
  if (!size || size.width < 1 || size.height < 1 || size.width > 12000 || size.height > 12000) {
    return { ok: false, status: 415, message: "The image could not be read. Try saving it again as JPEG or PNG." };
  }

  // The stored name is generated: nothing from the uploaded file name reaches the disk, a public ID or a URL.
  const name = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
  const fileName = `${name}.${ALLOWED_IMAGE_TYPES[mime]}`;
  const record = {
    id: newId("media"),
    siteId: site.id,
    fileName,
    originalName: file.name.replace(/[^\w.\- ]+/g, "").slice(0, 120),
    mime,
    bytes: bytes.length,
    alt: "",
    createdAt: new Date().toISOString(),
  };
  const saveRecord = (media: Media) =>
    mutateDb((db) => {
      db.media.push(media);
      audit(db, { siteId: site.id, action: "media.upload", targetId: media.id, summary: `${media.originalName} (${media.width}×${media.height}, ${media.storage})` });
    });

  const hosting = cloudinaryConfig();
  if (hosting.state === "misconfigured") return { ok: false, status: 503, message: hosting.message };

  if (hosting.state === "ready") {
    let hosted;
    try {
      hosted = await uploadToCloudinary(hosting, { bytes, folder: `${site.key}/blog`, name, mediaId: record.id, siteKey: site.key });
    } catch (err) {
      if (err instanceof ImageHostError) return { ok: false, status: err.status, message: err.message };
      throw err;
    }
    const media: Media = { ...record, storage: "cloudinary", publicId: hosted.publicId, url: hosted.secureUrl, width: hosted.width ?? size.width, height: hosted.height ?? size.height };
    try {
      await saveRecord(media);
    } catch {
      // The file is on Cloudinary but nothing points at it. Take it down again so no orphan is left behind;
      // if that fails too, the public ID is logged so it can be found and removed by hand.
      const removed = await removeFromCloudinary(hosting, hosted.publicId);
      console.error(`[images] The record for an uploaded image could not be saved. ${removed ? "The upload was removed from Cloudinary." : `ORPHANED ASSET left on Cloudinary: ${hosted.publicId}`}`);
      return { ok: false, status: 503, message: "The image was uploaded but could not be recorded, so it was not kept. Try again." };
    }
    return { ok: true, media };
  }

  const dir = path.join(uploadsDir(), site.key);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, fileName), bytes);
  const media: Media = { ...record, storage: "local", url: `/media/${site.key}/${fileName}`, width: size.width, height: size.height };
  try {
    await saveRecord(media);
  } catch {
    rmSync(path.join(dir, fileName), { force: true });
    return { ok: false, status: 503, message: "The image could not be recorded, so it was not kept. Try again." };
  }
  return { ok: true, media };
}
