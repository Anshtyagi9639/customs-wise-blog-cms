import { notFound } from "next/navigation";
import { PostEditor } from "@/components/admin/post-editor";
import type { Post, PostInput } from "@/lib/types";
import { readDb } from "@/server/store";

export const metadata = { title: "Edit Post" };

function toInput(post: Post): PostInput {
  const input: Partial<Post> = { ...post };
  delete input.id;
  delete input.siteId;
  delete input.createdAt;
  delete input.updatedAt;
  delete input.copiedFromPostId;
  return input as PostInput;
}

export default async function EditPost({ params, searchParams }: { params: Promise<{ site: string; id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { site: key, id } = await params;
  const { notice } = await searchParams;
  const db = await readDb();
  const site = db.sites.find((s) => s.key === key);
  // An article is only reachable through the website it belongs to.
  const post = site && db.posts.find((p) => p.id === id && p.siteId === site.id);
  if (!site || !post) notFound();

  const original = post.copiedFromPostId ? db.posts.find((p) => p.id === post.copiedFromPostId) : undefined;
  const originalSite = original && db.sites.find((s) => s.id === original.siteId);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Edit Post</h1>
        <a href={`/admin/${site.key}/posts/${post.id}/preview`} className="btn btn-secondary btn-sm">
          Open saved preview
        </a>
      </div>
      <p className="mb-4 text-[0.95rem] text-ink-soft">
        {site.name} <span className="text-pebble">({site.note})</span>
        {originalSite && original && (
          <span className="block text-[0.88rem] text-pebble">
            Copied from &ldquo;{original.title}&rdquo; on {originalSite.name}. This is a separate article: changes here do not affect the original.
          </span>
        )}
      </p>
      <PostEditor
        key={post.id}
        site={site}
        categories={db.categories.filter((c) => c.siteId === site.id).sort((a, b) => a.order - b.order)}
        authors={db.authors.filter((a) => a.siteIds.includes(site.id))}
        postId={post.id}
        initial={toInput(post)}
        notice={notice}
      />
    </div>
  );
}
