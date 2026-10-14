"use client";

import { ArrowDown, ArrowUp, Eye, ImagePlus, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArticleView, SiteChrome } from "@/components/public/site-view";
import { api } from "@/lib/client-api";
import { canonicalUrl, displayStatus, seoDescription, seoTitle, slugify, toPublicPost } from "@/lib/content";
import type { Author, Block, BlockType, Category, FieldErrors, ImageRef, Media, Post, PostInput, Site } from "@/lib/types";

type Props = {
  site: Site;
  categories: Category[];
  authors: Author[];
  /** Null when creating a new article. */
  postId: string | null;
  initial: PostInput;
  notice?: string;
};

const BLOCK_LABELS: Record<BlockType, string> = { p: "Paragraph", h2: "Heading", h3: "Sub-heading", ul: "Bulleted list", ol: "Numbered list", quote: "Quote", callout: "Call-out", image: "Image" };
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;
const NOTICES: Record<string, string> = { "draft-created": "Draft saved.", published: "Published. It is now on the local website preview." };

function newBlock(type: BlockType): Block {
  if (type === "ul" || type === "ol") return { type, items: [""] };
  if (type === "quote") return { type, text: "", cite: "" };
  if (type === "image") return { type, image: { mediaId: "", url: "", alt: "", caption: "", width: 0, height: 0 } };
  return { type, text: "" };
}

/** Date-time field value in the editor's own time zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

export function PostEditor({ site, categories, authors, postId, initial, notice }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<PostInput>(initial);
  const [savedStatus, setSavedStatus] = useState(initial.status);
  const [slugEdited, setSlugEdited] = useState(Boolean(postId));
  const [customCanonical, setCustomCanonical] = useState(Boolean(initial.canonicalOverride));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(notice && NOTICES[notice] ? { kind: "ok", text: NOTICES[notice] } : null);
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const set = <K extends keyof PostInput>(key: K, value: PostInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };
  const setBlock = (index: number, block: Block) => set("body", form.body.map((b, i) => (i === index ? block : b)));
  const moveBlock = (index: number, by: number) => {
    const next = [...form.body];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    set("body", next);
  };

  const onTitle = (title: string) => {
    setForm((f) => ({ ...f, title, slug: slugEdited ? f.slug : slugify(title) }));
    // The slug follows the title until it is edited by hand, so a "missing slug" message is settled here too.
    if (errors.title || (errors.slug && !slugEdited)) setErrors((e) => ({ ...e, title: "", slug: slugEdited ? e.slug : "" }));
  };

  /** Checks the file in the browser for instant feedback, then uploads it. The server checks it again. */
  async function upload(file: File, slot: string): Promise<ImageRef | null> {
    if (!IMAGE_TYPES.includes(file.type)) {
      setErrors((e) => ({ ...e, [slot]: "That file is not a supported image. Use JPEG, PNG, WebP, AVIF or GIF." }));
      return null;
    }
    if (file.size > MAX_BYTES) {
      setErrors((e) => ({ ...e, [slot]: `The image is ${(file.size / 1048576).toFixed(1)} MB. The limit is 5 MB.` }));
      return null;
    }
    setUploading(slot);
    setErrors((e) => ({ ...e, [slot]: "" }));
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/sites/${site.key}/media`, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { media?: Media; message?: string };
      if (!res.ok || !data.media) {
        setErrors((e) => ({ ...e, [slot]: data.message ?? "The image could not be uploaded." }));
        return null;
      }
      return { mediaId: data.media.id, url: data.media.url, alt: "", caption: "", width: data.media.width, height: data.media.height };
    } catch {
      setErrors((e) => ({ ...e, [slot]: "The image could not be uploaded. Check the CMS is still running." }));
      return null;
    } finally {
      setUploading(null);
    }
  }

  async function save(status: Post["status"]) {
    setSaving(status);
    setMessage(null);
    const payload: PostInput = { ...form, status, canonicalOverride: customCanonical ? form.canonicalOverride : "" };
    const result = postId
      ? await api<{ post: Post }>(`/api/admin/sites/${site.key}/posts/${postId}`, "PUT", payload)
      : await api<{ post: Post }>(`/api/admin/sites/${site.key}/posts`, "POST", payload);
    setSaving(null);
    if (!result.ok || !result.data.post) {
      setErrors(result.data.fieldErrors ?? {});
      setMessage({ kind: "error", text: result.data.message ?? "The article could not be saved." });
      setTab("edit");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const saved = result.data.post;
    setErrors({});
    if (!postId) {
      router.replace(`/admin/${site.key}/posts/${saved.id}?notice=${status === "published" ? "published" : "draft-created"}`);
      return;
    }
    const wasPublished = savedStatus === "published";
    setSavedStatus(saved.status);
    setForm((f) => ({ ...f, status: saved.status, slug: saved.slug, publishAt: saved.publishAt }));
    const shown = displayStatus(saved);
    setMessage({
      kind: "ok",
      text:
        saved.status === "draft"
          ? wasPublished
            ? "Unpublished. It is saved as a draft and no longer appears on the website preview."
            : "Draft saved."
          : shown === "scheduled"
            ? "Scheduled. It will appear on the website preview at the publish time."
            : wasPublished
              ? "Changes published."
              : "Published. It is now on the local website preview.",
    });
    router.refresh();
  }

  const shownStatus = displayStatus({ status: savedStatus, publishAt: form.publishAt });
  const livePath = `/sites/${site.key}${site.articlePathPattern.replace("{slug}", form.slug)}`;
  const autoCanonical = canonicalUrl(site, { slug: form.slug || "your-article", canonicalOverride: "" });
  const errorList = Object.entries(errors).filter(([, v]) => v);

  /** The article as the public pages would receive it, built from what is on screen right now (saved or not). */
  const preview = useMemo(() => {
    const now = new Date().toISOString();
    const post: Post = { ...form, id: postId ?? "unsaved", siteId: site.id, copiedFromPostId: null, createdAt: now, updatedAt: now, publishAt: form.publishAt ?? now };
    return toPublicPost(site, post, authors, categories, "");
  }, [form, postId, site, authors, categories]);

  const fieldError = (key: string) => (errors[key] ? <p className="field-error">{errors[key]}</p> : null);
  const invalid = (key: string) => (errors[key] ? { "aria-invalid": true as const } : {});

  return (
    <div>
      {/* Action bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-2 border-b border-line bg-mist/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span className={`badge badge-${shownStatus}`} data-testid="status-badge">
          {shownStatus === "draft" ? "Draft" : shownStatus === "scheduled" ? "Scheduled" : "Published"}
        </span>
        <div role="tablist" aria-label="Editor view" className="ml-1 inline-flex overflow-hidden rounded-brand border border-line bg-salt">
          <button type="button" role="tab" aria-selected={tab === "edit"} onClick={() => setTab("edit")} className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-[0.86rem] font-bold ${tab === "edit" ? "bg-atlantic text-salt" : "text-overnight"}`}>
            <Pencil aria-hidden className="size-4" /> Edit
          </button>
          <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")} className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-[0.86rem] font-bold ${tab === "preview" ? "bg-atlantic text-salt" : "text-overnight"}`}>
            <Eye aria-hidden className="size-4" /> Preview
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {savedStatus === "published" && shownStatus === "published" && (
            <a href={livePath} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              View on website preview
            </a>
          )}
          <button type="button" className="btn btn-secondary" disabled={saving !== null} onClick={() => save("draft")}>
            {saving === "draft" && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {savedStatus === "published" ? "Unpublish" : "Save draft"}
          </button>
          <button type="button" className="btn btn-accent" disabled={saving !== null} onClick={() => save("published")}>
            {saving === "published" && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {savedStatus === "published" ? "Update" : "Publish"}
          </button>
        </div>
      </div>

      {message && (
        <div role={message.kind === "error" ? "alert" : "status"} className={`mb-5 rounded-brand border-l-4 bg-salt px-4 py-3 text-[0.93rem] font-semibold ${message.kind === "error" ? "border-error text-error" : "border-transit text-ship"}`}>
          {message.text}
          {message.kind === "error" && errorList.length > 0 && (
            <ul className="mt-2 list-disc pl-5 font-normal">
              {errorList.map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "preview" ? (
        <div>
          <p className="mb-3 text-[0.9rem] text-ink-soft">
            This is how the article will look on <strong>{site.name}</strong>, using what is in the editor now, including unsaved changes. Nothing is published by previewing.
          </p>
          <div className="relative overflow-hidden rounded-[10px] border border-line bg-salt" data-testid="live-preview">
            <SiteChrome site={site}>
              <ArticleView site={site} post={preview} related={[]} />
            </SiteChrome>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-5">
            <section className="card grid gap-4" aria-labelledby="sec-content">
              <h2 id="sec-content" className="section-title">
                Article
              </h2>
              <div>
                <label className="label" htmlFor="f-title">
                  Blog title
                </label>
                <input id="f-title" className="input" value={form.title} onChange={(e) => onTitle(e.target.value)} maxLength={160} {...invalid("title")} />
                {fieldError("title")}
              </div>
              <div>
                <label className="label" htmlFor="f-slug">
                  URL slug
                </label>
                <input
                  id="f-slug"
                  className="input"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                  }}
                  maxLength={80}
                  {...invalid("slug")}
                />
                <p className="hint break-all">
                  Address on the website: {site.baseUrl}
                  {site.articlePathPattern.replace("{slug}", form.slug || "…")}
                </p>
                {fieldError("slug")}
              </div>
              <div>
                <label className="label" htmlFor="f-summary">
                  Short summary
                </label>
                <textarea id="f-summary" className="input" rows={3} value={form.summary} onChange={(e) => set("summary", e.target.value)} maxLength={400} {...invalid("summary")} />
                <p className="hint">One or two sentences. Shown on blog cards and used as the search description unless you set one below. {form.summary.length}/400</p>
                {fieldError("summary")}
              </div>
            </section>

            <section className="card grid gap-3" aria-labelledby="sec-body">
              <h2 id="sec-body" className="section-title">
                Main article content
              </h2>
              <p className="hint !mt-0">
                Build the article from blocks. Inside text, use <code>**bold**</code> and <code>[link text](https://address)</code> or <code>[link text](/page-on-this-site)</code>.
              </p>
              {fieldError("body")}
              {form.body.map((b, i) => (
                <div key={i} className="rounded-brand border border-line bg-mist/50 p-3" data-testid="block">
                  <div className="mb-2 flex items-center gap-1">
                    <span className="text-[0.78rem] font-bold tracking-wide text-pebble uppercase">{BLOCK_LABELS[b.type]}</span>
                    <span className="ml-auto" />
                    <button type="button" className="btn btn-secondary btn-sm !px-2" aria-label="Move block up" disabled={i === 0} onClick={() => moveBlock(i, -1)}>
                      <ArrowUp aria-hidden className="size-4" />
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm !px-2" aria-label="Move block down" disabled={i === form.body.length - 1} onClick={() => moveBlock(i, 1)}>
                      <ArrowDown aria-hidden className="size-4" />
                    </button>
                    <button type="button" className="btn btn-danger btn-sm !px-2" aria-label="Delete block" onClick={() => set("body", form.body.filter((_, k) => k !== i))}>
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                  {(b.type === "h2" || b.type === "h3") && <input className="input" aria-label={BLOCK_LABELS[b.type]} value={b.text} onChange={(e) => setBlock(i, { ...b, text: e.target.value })} maxLength={200} />}
                  {(b.type === "p" || b.type === "callout") && <textarea className="input" aria-label={BLOCK_LABELS[b.type]} rows={b.type === "p" ? 4 : 2} value={b.text} onChange={(e) => setBlock(i, { ...b, text: e.target.value })} />}
                  {(b.type === "ul" || b.type === "ol") && (
                    <>
                      <textarea className="input" aria-label={BLOCK_LABELS[b.type]} rows={4} value={b.items.join("\n")} onChange={(e) => setBlock(i, { ...b, items: e.target.value.split("\n") })} />
                      <p className="hint">One item per line.</p>
                    </>
                  )}
                  {b.type === "quote" && (
                    <div className="grid gap-2">
                      <textarea className="input" aria-label="Quote" rows={2} value={b.text} onChange={(e) => setBlock(i, { ...b, text: e.target.value })} />
                      <input className="input" aria-label="Who said it" placeholder="Who said it (optional)" value={b.cite} onChange={(e) => setBlock(i, { ...b, cite: e.target.value })} />
                    </div>
                  )}
                  {b.type === "image" && (
                    <div className="grid gap-2">
                      {b.image.url ? <img src={b.image.url} alt="" className="max-h-56 w-auto rounded-brand border border-line" /> : null}
                      <input
                        type="file"
                        accept={IMAGE_TYPES.join(",")}
                        aria-label="Choose an image for this block"
                        className="text-[0.88rem]"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const ref = await upload(file, `block-${i}`);
                          if (ref) setBlock(i, { ...b, image: { ...ref, alt: b.image.alt, caption: b.image.caption } });
                          e.target.value = "";
                        }}
                      />
                      {uploading === `block-${i}` && <p className="hint">Uploading…</p>}
                      {fieldError(`block-${i}`)}
                      <input className="input" aria-label="Image alt text" placeholder="Alt text: describe the image" value={b.image.alt} onChange={(e) => setBlock(i, { ...b, image: { ...b.image, alt: e.target.value } })} />
                      <input className="input" aria-label="Image caption" placeholder="Caption (optional)" value={b.image.caption} onChange={(e) => setBlock(i, { ...b, image: { ...b.image, caption: e.target.value } })} />
                    </div>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Add a block">
                {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
                  <button key={type} type="button" className="btn btn-secondary btn-sm" onClick={() => set("body", [...form.body, newBlock(type)])}>
                    <Plus aria-hidden className="size-3.5" /> {BLOCK_LABELS[type]}
                  </button>
                ))}
              </div>
            </section>

            <section className="card grid gap-3" aria-labelledby="sec-faq">
              <h2 id="sec-faq" className="section-title">
                FAQ section <span className="font-normal text-pebble">(optional)</span>
              </h2>
              <p className="hint !mt-0">Questions and answers shown at the end of the article. Also adds FAQ structured data for search and answer engines.</p>
              {fieldError("faq")}
              {form.faq.map((f, i) => (
                <div key={i} className="grid gap-2 rounded-brand border border-line bg-mist/50 p-3">
                  <input className="input" aria-label={`Question ${i + 1}`} placeholder="Question" value={f.question} onChange={(e) => set("faq", form.faq.map((x, k) => (k === i ? { ...x, question: e.target.value } : x)))} />
                  <textarea className="input" aria-label={`Answer ${i + 1}`} placeholder="Answer" rows={2} value={f.answer} onChange={(e) => set("faq", form.faq.map((x, k) => (k === i ? { ...x, answer: e.target.value } : x)))} />
                  <button type="button" className="btn btn-danger btn-sm justify-self-start" onClick={() => set("faq", form.faq.filter((_, k) => k !== i))}>
                    Remove question
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={() => set("faq", [...form.faq, { question: "", answer: "" }])}>
                <Plus aria-hidden className="size-3.5" /> Add question
              </button>
            </section>

            <section className="card grid gap-3" aria-labelledby="sec-sources">
              <h2 id="sec-sources" className="section-title">
                Sources and review <span className="font-normal text-pebble">(optional)</span>
              </h2>
              {fieldError("sources")}
              {form.sources.map((s, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input className="input" aria-label={`Source ${i + 1} name`} placeholder="Source name" value={s.label} onChange={(e) => set("sources", form.sources.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                  <input className="input" aria-label={`Source ${i + 1} address`} placeholder="https://…" value={s.url} onChange={(e) => set("sources", form.sources.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))} />
                  <button type="button" className="btn btn-danger btn-sm" aria-label={`Remove source ${i + 1}`} onClick={() => set("sources", form.sources.filter((_, k) => k !== i))}>
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={() => set("sources", [...form.sources, { label: "", url: "" }])}>
                <Plus aria-hidden className="size-3.5" /> Add source
              </button>
              <div className="max-w-xs">
                <label className="label" htmlFor="f-reviewed">
                  Last reviewed
                </label>
                <input id="f-reviewed" type="date" className="input" value={form.lastReviewedAt ?? ""} onChange={(e) => set("lastReviewedAt", e.target.value || null)} {...invalid("lastReviewedAt")} />
                {fieldError("lastReviewedAt")}
              </div>
            </section>

            <section className="card grid gap-3" aria-labelledby="sec-related">
              <h2 id="sec-related" className="section-title">
                Related pages on this website <span className="font-normal text-pebble">(optional)</span>
              </h2>
              {fieldError("relatedLinks")}
              {form.relatedLinks.map((l, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input className="input" aria-label={`Related page ${i + 1} label`} placeholder="Label, e.g. Food customs" value={l.label} onChange={(e) => set("relatedLinks", form.relatedLinks.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                  <input className="input" aria-label={`Related page ${i + 1} address`} placeholder="/food-customs" value={l.href} onChange={(e) => set("relatedLinks", form.relatedLinks.map((x, k) => (k === i ? { ...x, href: e.target.value } : x)))} />
                  <button type="button" className="btn btn-danger btn-sm" aria-label={`Remove related page ${i + 1}`} onClick={() => set("relatedLinks", form.relatedLinks.filter((_, k) => k !== i))}>
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm justify-self-start" onClick={() => set("relatedLinks", [...form.relatedLinks, { label: "", href: "" }])}>
                <Plus aria-hidden className="size-3.5" /> Add related page
              </button>
            </section>
          </div>

          <div className="grid content-start gap-5">
            <section className="card grid gap-3" aria-labelledby="sec-image">
              <h2 id="sec-image" className="section-title">
                Featured image
              </h2>
              {form.coverImage ? (
                <>
                  <img src={form.coverImage.url} alt="" className="w-full rounded-brand border border-line" data-testid="cover-preview" />
                  <p className="hint !mt-0" data-testid="cover-stored">
                    {form.coverImage.width} × {form.coverImage.height} px · {form.coverImage.url.startsWith("https://") ? "Stored on Cloudinary" : "Stored on this computer"}
                  </p>
                </>
              ) : (
                <p className="grid aspect-video place-items-center rounded-brand border border-dashed border-line text-[0.88rem] text-pebble">No image chosen</p>
              )}
              <label className="btn btn-secondary btn-sm cursor-pointer justify-self-start">
                <ImagePlus aria-hidden className="size-4" /> {form.coverImage ? "Replace image" : "Upload image"}
                <input
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  className="sr-only"
                  data-testid="cover-input"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const ref = await upload(file, "coverImage");
                    if (ref) set("coverImage", { ...ref, alt: form.coverImage?.alt ?? "", caption: form.coverImage?.caption ?? "" });
                    e.target.value = "";
                  }}
                />
              </label>
              {uploading === "coverImage" && <p className="hint !mt-0">Uploading…</p>}
              <p className="hint !mt-0">JPEG, PNG, WebP, AVIF or GIF, up to 5 MB.</p>
              {fieldError("coverImage")}
              {form.coverImage && (
                <>
                  <div>
                    <label className="label" htmlFor="f-alt">
                      Image alt text
                    </label>
                    <input id="f-alt" className="input" value={form.coverImage.alt} onChange={(e) => set("coverImage", { ...form.coverImage!, alt: e.target.value })} maxLength={300} {...invalid("coverImageAlt")} />
                    <p className="hint">Describe the image for people who cannot see it.</p>
                    {fieldError("coverImageAlt")}
                  </div>
                  <div>
                    <label className="label" htmlFor="f-caption">
                      Caption <span className="font-normal text-pebble">(optional)</span>
                    </label>
                    <input id="f-caption" className="input" value={form.coverImage.caption} onChange={(e) => set("coverImage", { ...form.coverImage!, caption: e.target.value })} maxLength={300} />
                  </div>
                  <button type="button" className="btn btn-danger btn-sm justify-self-start" onClick={() => set("coverImage", null)}>
                    Remove image
                  </button>
                </>
              )}
            </section>

            <section className="card grid gap-3" aria-labelledby="sec-org">
              <h2 id="sec-org" className="section-title">
                Category, author and tags
              </h2>
              <div>
                <label className="label" htmlFor="f-category">
                  Category
                </label>
                <select id="f-category" className="input" value={form.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value || null)} {...invalid("categoryId")}>
                  <option value="">Choose a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {fieldError("categoryId")}
              </div>
              <div>
                <label className="label" htmlFor="f-author">
                  Author
                </label>
                <select id="f-author" className="input" value={form.authorId ?? ""} onChange={(e) => set("authorId", e.target.value || null)} {...invalid("authorId")}>
                  <option value="">Choose an author</option>
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.kind === "organisation" ? " (organisation)" : a.jobTitle ? `, ${a.jobTitle}` : ""}
                    </option>
                  ))}
                </select>
                <p className="hint">
                  Profile details are managed under <a className="underline" href={`/admin/${site.key}/authors`}>Authors</a>.
                </p>
                {fieldError("authorId")}
              </div>
              <div>
                <label className="label" htmlFor="f-tags">
                  Tags
                </label>
                <input id="f-tags" className="input" value={form.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trimStart()))} placeholder="customs, imports" {...invalid("tags")} />
                <p className="hint">Separate tags with commas.</p>
                {fieldError("tags")}
              </div>
            </section>

            <section className="card grid gap-3" aria-labelledby="sec-publish">
              <h2 id="sec-publish" className="section-title">
                Publication date and time
              </h2>
              <div>
                <label className="label" htmlFor="f-publish">
                  Publish at
                </label>
                <input id="f-publish" type="datetime-local" className="input" value={toLocalInput(form.publishAt)} onChange={(e) => set("publishAt", fromLocalInput(e.target.value))} {...invalid("publishAt")} />
                <p className="hint">Leave empty to use the moment you publish. A future time schedules the article: it appears by itself when that time arrives.</p>
                {fieldError("publishAt")}
              </div>
              <label className="flex items-start gap-2 text-[0.9rem]">
                <input type="checkbox" className="mt-1" checked={form.hideDate} onChange={(e) => set("hideDate", e.target.checked)} />
                <span>Do not show the date on the website</span>
              </label>
            </section>

            <section className="card grid gap-3" aria-labelledby="sec-seo">
              <h2 id="sec-seo" className="section-title">
                Search engines (SEO)
              </h2>
              <div>
                <label className="label" htmlFor="f-seo-title">
                  Meta title
                </label>
                <input id="f-seo-title" className="input" value={form.seo.title} onChange={(e) => set("seo", { ...form.seo, title: e.target.value })} maxLength={120} placeholder={`${form.title || "Article title"} | ${site.seo.titleSuffix}`} />
                <p className={`hint ${seoTitle(site, form).length > 60 ? "!text-freight" : ""}`}>Leave empty to use the article title. {seoTitle(site, form).length} characters; about 60 show in search results.</p>
              </div>
              <div>
                <label className="label" htmlFor="f-seo-desc">
                  Meta description
                </label>
                <textarea id="f-seo-desc" className="input" rows={3} value={form.seo.description} onChange={(e) => set("seo", { ...form.seo, description: e.target.value })} maxLength={320} placeholder={form.summary || "Uses the short summary"} />
                <p className={`hint ${seoDescription(form).length > 160 ? "!text-freight" : ""}`}>Leave empty to use the short summary. {seoDescription(form).length} characters; about 160 show in search results.</p>
              </div>
              <div>
                <p className="label">Canonical URL</p>
                <p className="hint !mt-0 break-all">Generated automatically: {autoCanonical}</p>
                <label className="mt-2 flex items-start gap-2 text-[0.9rem]">
                  <input type="checkbox" className="mt-1" checked={customCanonical} onChange={(e) => setCustomCanonical(e.target.checked)} />
                  <span>Use a different canonical URL (for an article first published elsewhere)</span>
                </label>
                {customCanonical && (
                  <input className="input mt-2" aria-label="Canonical URL override" placeholder="https://…" value={form.canonicalOverride} onChange={(e) => set("canonicalOverride", e.target.value)} {...invalid("canonicalOverride")} />
                )}
                {fieldError("canonicalOverride")}
              </div>
              <div className="rounded-brand border border-line p-3" aria-label="Search result preview">
                <p className="text-[0.74rem] font-bold tracking-wide text-pebble uppercase">Search result preview</p>
                <p className="mt-1 truncate text-[0.8rem] text-ink-soft">{(customCanonical && form.canonicalOverride) || autoCanonical}</p>
                <p className="truncate text-[1.05rem] text-atlantic">{seoTitle(site, form) || "Article title"}</p>
                <p className="line-clamp-2 text-[0.86rem] text-ink-soft">{seoDescription(form) || "The short summary appears here."}</p>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
