import { articlePath, displayStatus, formatDateTime } from "@/lib/content";
import type { Author, Category, Post, Site } from "@/lib/types";
import { PostActions } from "./post-actions";

const LABEL = { draft: "Draft", scheduled: "Scheduled", published: "Published" } as const;

/** A list of one website's articles with their status and actions. Used on the dashboard and the All Posts screen. */
export function PostTable({ site, posts, categories, authors, otherSites, empty }: { site: Site; posts: Post[]; categories: Category[]; authors: Author[]; otherSites: { key: string; name: string }[]; empty: string }) {
  if (posts.length === 0) return <p className="rounded-brand border border-dashed border-line px-4 py-6 text-center text-[0.92rem] text-pebble">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table min-w-[44rem]">
        <thead>
          <tr>
            <th>Article</th>
            <th>Status</th>
            <th>Category · Author</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => {
            const shown = displayStatus(p);
            return (
              <tr key={p.id} data-testid="post-row" data-slug={p.slug}>
                <td className="max-w-[22rem]">
                  <a href={`/admin/${site.key}/posts/${p.id}`} className="font-semibold text-atlantic hover:underline">
                    {p.title || "(untitled)"}
                  </a>
                  <span className="block text-[0.8rem] break-all text-pebble">{articlePath(site, p.slug)}</span>
                  {shown === "published" && (
                    <a href={`/sites/${site.key}${articlePath(site, p.slug)}`} target="_blank" rel="noopener noreferrer" className="text-[0.8rem] font-semibold text-atlantic underline">
                      View on website preview
                    </a>
                  )}
                </td>
                <td>
                  <span className={`badge badge-${shown}`}>{LABEL[shown]}</span>
                </td>
                <td className="text-[0.86rem]">
                  {categories.find((c) => c.id === p.categoryId)?.label ?? <span className="text-pebble">No category</span>}
                  <span className="block text-pebble">{authors.find((a) => a.id === p.authorId)?.name ?? "No author"}</span>
                </td>
                <td className="text-[0.86rem] whitespace-nowrap">
                  {shown === "draft" ? (
                    <>
                      <span className="text-pebble">Edited</span> {formatDateTime(p.updatedAt)}
                    </>
                  ) : (
                    <>
                      <span className="text-pebble">{shown === "scheduled" ? "Goes live" : "Published"}</span> {p.publishAt ? formatDateTime(p.publishAt) : ""}
                    </>
                  )}
                </td>
                <td>
                  <PostActions siteKey={site.key} post={{ id: p.id, title: p.title, status: p.status }} shown={shown} otherSites={otherSites} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
