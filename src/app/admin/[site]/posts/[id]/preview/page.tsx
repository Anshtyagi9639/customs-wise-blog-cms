import { notFound } from "next/navigation";
import { PreviewFrame } from "@/components/admin/preview-frame";
import { displayStatus } from "@/lib/content";
import { siteByKey } from "@/server/http";
import { previewPost } from "@/server/posts";

export const metadata = { title: "Preview" };

const LABEL = { draft: "Draft", scheduled: "Scheduled", published: "Published" } as const;

/** Preview screen: the saved article in its website's design, plus exactly what search engines would be given. */
export default async function PreviewScreen({ params }: { params: Promise<{ site: string; id: string }> }) {
  const { site: key, id } = await params;
  const site = await siteByKey(key);
  const found = site && (await previewPost(site, id));
  if (!site || !found) notFound();
  const { post, raw } = found;
  const status = displayStatus(raw);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Preview</h1>
          <p className="text-[0.95rem] text-ink-soft">
            &ldquo;{post.title}&rdquo; on {site.name} <span className={`badge badge-${status} ml-1`}>{LABEL[status]}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/${site.key}/posts/${id}`} className="btn btn-primary">
            Back to editing
          </a>
          <a href={`/preview/${site.key}/${id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            Open full page
          </a>
          {status === "published" && (
            <a href={`/sites/${site.key}${post.path}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              View on website preview
            </a>
          )}
        </div>
      </div>
      <p className="text-[0.9rem] text-ink-soft">This shows the last saved version. {status === "published" ? "It is visible on the local website preview." : "It is not visible to the public: only this preview can show it."}</p>

      <PreviewFrame src={`/preview/${site.key}/${id}`} title={`Preview of ${post.title}`} />

      <section className="card grid gap-3" aria-labelledby="seo-output">
        <h2 id="seo-output" className="section-title">
          What search engines are given
        </h2>
        <dl className="grid gap-x-4 gap-y-2 text-[0.9rem] sm:grid-cols-[11rem_1fr]">
          <dt className="font-bold">Page title</dt>
          <dd data-testid="seo-title">{post.seo.title}</dd>
          <dt className="font-bold">Meta description</dt>
          <dd>{post.seo.description || <span className="text-pebble">None yet</span>}</dd>
          <dt className="font-bold">Canonical URL</dt>
          <dd className="break-all" data-testid="seo-canonical">
            {post.canonicalUrl}
            {raw.canonicalOverride ? <span className="text-pebble"> (manual override)</span> : <span className="text-pebble"> (generated)</span>}
          </dd>
          <dt className="font-bold">Address on the website</dt>
          <dd className="break-all">{post.path}</dd>
          <dt className="font-bold">Reading time</dt>
          <dd>{post.readMinutes} min</dd>
        </dl>
        <details>
          <summary className="cursor-pointer text-[0.9rem] font-bold text-atlantic">Structured data (JSON-LD), generated from the article</summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded-brand bg-overnight p-3 text-[0.78rem] leading-snug text-starlight" data-testid="jsonld">
            {JSON.stringify(post.jsonLd, null, 2)}
          </pre>
        </details>
        <details>
          <summary className="cursor-pointer text-[0.9rem] font-bold text-atlantic">Ready-made HTML (for websites that cannot render blocks)</summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded-brand bg-overnight p-3 text-[0.78rem] leading-snug whitespace-pre-wrap text-starlight">{post.html}</pre>
        </details>
      </section>
    </div>
  );
}
