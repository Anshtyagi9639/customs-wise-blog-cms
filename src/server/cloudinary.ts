import "server-only";
import { type UploadApiOptions, type UploadApiResponse, v2 as cloudinary } from "cloudinary";

/**
 * Cloudinary image hosting, through the official Node.js SDK.
 *
 * Credentials come from three server-side environment variables and are passed to the SDK per call. They are never
 * logged, returned by an API or sent to the browser; uploads are signed on this server, so the browser never needs
 * them. Error messages shown to editors are written here: Cloudinary's own messages are not passed on, because they
 * can contain the cloud name or the API key.
 */

const NAMES = { cloudName: "CLOUDINARY_CLOUD_NAME", apiKey: "CLOUDINARY_API_KEY", apiSecret: "CLOUDINARY_API_SECRET" } as const;

type Ready = { state: "ready"; cloudName: string; apiKey: string; apiSecret: string };
export type CloudinaryConfig = { state: "off" } | { state: "misconfigured"; message: string } | Ready;

/**
 * "off" when none of the three variables is set (images then stay in the local folder).
 * "misconfigured" when only some are set or one is malformed: uploads are refused rather than silently stored locally.
 */
export function cloudinaryConfig(): CloudinaryConfig {
  // CMS_IMAGES=local keeps new images in the local folder even when Cloudinary is configured (used for test runs).
  if (process.env.CMS_IMAGES?.trim().toLowerCase() === "local") return { state: "off" };
  const cloudName = process.env[NAMES.cloudName]?.trim() ?? "";
  const apiKey = process.env[NAMES.apiKey]?.trim() ?? "";
  const apiSecret = process.env[NAMES.apiSecret]?.trim() ?? "";
  if (!cloudName && !apiKey && !apiSecret) return { state: "off" };

  const missing = [!cloudName && NAMES.cloudName, !apiKey && NAMES.apiKey, !apiSecret && NAMES.apiSecret].filter(Boolean);
  if (missing.length) return { state: "misconfigured", message: `Image hosting is not fully set up: ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} missing from .env.local. Add ${missing.length === 1 ? "it" : "them"} and restart the CMS.` };
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(cloudName)) return { state: "misconfigured", message: `${NAMES.cloudName} in .env.local is not a valid cloud name. Copy it again from the Cloudinary dashboard and restart the CMS.` };
  if (!/^\d{6,30}$/.test(apiKey)) return { state: "misconfigured", message: `${NAMES.apiKey} in .env.local should be the numeric API key from the Cloudinary dashboard. Copy it again and restart the CMS.` };
  return { state: "ready", cloudName, apiKey, apiSecret };
}

export type ImageStoreKind = "cloudinary" | "local-folder";
export const imageStoreKind = (): ImageStoreKind => (cloudinaryConfig().state === "off" ? "local-folder" : "cloudinary");

/** A failure with a message that is safe and useful to show to an editor. */
export class ImageHostError extends Error {
  constructor(
    public readonly status: 502 | 503,
    message: string,
  ) {
    super(message);
    this.name = "ImageHostError";
  }
}

function explain(err: unknown): ImageHostError {
  if (err instanceof ImageHostError) return err;
  const e = (err ?? {}) as { http_code?: unknown; name?: unknown; code?: unknown; error?: { http_code?: unknown; name?: unknown; code?: unknown } };
  const http = Number(e.http_code ?? e.error?.http_code) || 0;
  const kind = String(e.name ?? e.error?.name ?? e.code ?? e.error?.code ?? "Error");
  // The status and kind of error only. Cloudinary's message is not logged: it can include the cloud name or API key.
  console.error(`[images] Cloudinary request failed: http=${http || "none"} kind=${kind.replace(/[^\w.-]/g, "").slice(0, 40)}`);

  if (http === 401 || http === 403) return new ImageHostError(503, "Cloudinary did not accept the configured account details. Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.local, then restart the CMS.");
  if (http === 404) return new ImageHostError(503, "Cloudinary did not recognise the configured cloud name. Check CLOUDINARY_CLOUD_NAME in .env.local, then restart the CMS.");
  if (http === 400) return new ImageHostError(502, "Cloudinary could not process that image. Try saving it again as JPEG or PNG.");
  if (http === 420 || http === 429) return new ImageHostError(503, "Cloudinary is limiting uploads for this account at the moment. Wait a few minutes and try again.");
  if (http === 499 || /timeout/i.test(kind)) return new ImageHostError(502, "The upload to Cloudinary took too long and was stopped. Check the internet connection and try again.");
  if (http >= 500) return new ImageHostError(502, "Cloudinary is having a problem at the moment. The image was not saved. Try again shortly.");
  if (!http) return new ImageHostError(502, "Cloudinary could not be reached. Check the internet connection and try again.");
  return new ImageHostError(502, `Cloudinary refused the upload (code ${http}). The image was not saved.`);
}

// Passed with every call, so these three variables always decide which account is used. The SDK's own optional
// CLOUDINARY_URL variable is not needed; if present, it only supplies settings not given here (such as a regional
// upload address).
const credentials = (cfg: Ready) => ({ cloud_name: cfg.cloudName, api_key: cfg.apiKey, api_secret: cfg.apiSecret, secure: true });

export type HostedImage = { publicId: string; secureUrl: string; width?: number; height?: number };

/**
 * Uploads one already-validated image. `folder` is the website's own folder (for example "customs-wise/blog") and
 * `name` is a name generated by this app, so the public ID is predictable and never comes from the uploaded file name.
 */
export async function uploadToCloudinary(cfg: Ready, input: { bytes: Buffer; folder: string; name: string; mediaId: string; siteKey: string }): Promise<HostedImage> {
  const publicId = `${input.folder}/${input.name}`;
  const options: UploadApiOptions = {
    ...credentials(cfg),
    public_id: publicId,
    // Accounts using Cloudinary's "dynamic folders" show the asset in this Media Library folder as well.
    asset_folder: input.folder,
    resource_type: "image",
    // Never replace an existing asset: a name clash is reported back instead.
    overwrite: false,
    unique_filename: false,
    use_filename: false,
    // Lets every asset uploaded by the CMS be listed later and matched to its record (see docs/CLOUDINARY.md).
    tags: ["blog-cms", `blog-cms-site-${input.siteKey}`],
    context: { cms_media_id: input.mediaId },
    timeout: 60_000,
  };

  let result: UploadApiResponse;
  try {
    result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, uploaded) => (error || !uploaded ? reject(error ?? new Error("empty response")) : resolve(uploaded)));
      stream.on("error", reject);
      stream.end(input.bytes);
    });
  } catch (err) {
    throw explain(err);
  }

  // With overwrite off, Cloudinary answers with the asset that already has this ID instead of storing the new file.
  if ((result as { existing?: boolean }).existing) throw new ImageHostError(502, "An image with the same generated name already exists on Cloudinary, so nothing was replaced. Upload the image again.");
  const secureUrl = String(result.secure_url ?? "");
  if (!result.public_id || !new RegExp(`^https://res\\.cloudinary\\.com/${cfg.cloudName}/image/upload/[A-Za-z0-9_./-]+$`).test(secureUrl)) {
    console.error("[images] Cloudinary answered without a usable HTTPS address for the image.");
    await removeFromCloudinary(cfg, result.public_id || publicId);
    throw new ImageHostError(502, "Cloudinary accepted the upload but did not return a usable image address. The image was not saved. Try again.");
  }
  return { publicId: result.public_id, secureUrl, width: Number(result.width) || undefined, height: Number(result.height) || undefined };
}

/** Best-effort removal, used only to undo an upload whose record could not be saved. Returns whether it worked. */
export async function removeFromCloudinary(cfg: Ready, publicId: string): Promise<boolean> {
  try {
    const result = (await cloudinary.uploader.destroy(publicId, { ...credentials(cfg), resource_type: "image", invalidate: true })) as { result?: string };
    return result?.result === "ok" || result?.result === "not found";
  } catch (err) {
    explain(err);
    return false;
  }
}
