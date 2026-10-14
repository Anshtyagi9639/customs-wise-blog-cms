"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import type { DisplayStatus, Post } from "@/lib/types";

type Props = { siteKey: string; post: Pick<Post, "id" | "title" | "status">; shown: DisplayStatus; otherSites: { key: string; name: string }[] };

/** Row actions on the post lists: publish or unpublish, copy to another website, delete a draft. */
export function PostActions({ siteKey, post, shown, otherSites }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [target, setTarget] = useState(otherSites[0]?.key ?? "");
  const [canonical, setCanonical] = useState(true);
  const base = `/api/admin/sites/${siteKey}/posts/${post.id}`;

  const run = async (url: string, method: "POST" | "DELETE", body?: unknown) => {
    setBusy(true);
    setError(null);
    const result = await api<{ post?: Post; targetSiteKey?: string }>(url, method, body);
    setBusy(false);
    if (!result.ok) {
      const details = Object.values(result.data.fieldErrors ?? {}).filter(Boolean);
      setError([result.data.message, ...details].filter(Boolean).join(" "));
      return null;
    }
    router.refresh();
    return result.data;
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <a className="btn btn-secondary btn-sm" href={`/admin/${siteKey}/posts/${post.id}`}>
          Edit
        </a>
        <a className="btn btn-secondary btn-sm" href={`/admin/${siteKey}/posts/${post.id}/preview`}>
          Preview
        </a>
        {post.status === "published" ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(`${base}/unpublish`, "POST")}>
            Unpublish
          </button>
        ) : (
          <button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={() => run(`${base}/publish`, "POST")}>
            Publish
          </button>
        )}
        {otherSites.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={copying} onClick={() => setCopying((c) => !c)}>
            Copy to…
          </button>
        )}
        {shown === "draft" && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete the draft "${post.title}"? This cannot be undone.`)) void run(base, "DELETE");
            }}
          >
            Delete
          </button>
        )}
      </div>
      {copying && (
        <div className="grid gap-2 rounded-brand border border-line bg-mist p-3 text-[0.86rem]">
          <label className="grid gap-1">
            <span className="font-bold">Copy this article to</span>
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              {otherSites.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={canonical} onChange={(e) => setCanonical(e.target.checked)} />
            <span>Point the copy&apos;s canonical URL at this original</span>
          </label>
          <p className="text-pebble">Creates a separate draft on that website with its own slug, status and SEO fields. Images are not copied.</p>
          <button
            type="button"
            className="btn btn-primary btn-sm justify-self-start"
            disabled={busy || !target}
            onClick={async () => {
              const data = await run(`${base}/copy`, "POST", { targetSiteKey: target, canonicalToOriginal: canonical });
              if (data?.post && data.targetSiteKey) router.push(`/admin/${data.targetSiteKey}/posts/${data.post.id}`);
            }}
          >
            Create the copy
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="field-error !mt-0">
          {error}
        </p>
      )}
    </div>
  );
}
