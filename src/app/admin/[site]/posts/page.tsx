import { FilePlus2 } from "lucide-react";
import { notFound } from "next/navigation";
import { PostTable } from "@/components/admin/post-table";
import { displayStatus } from "@/lib/content";
import { readDb } from "@/server/store";

export const metadata = { title: "All Posts" };

const STATUSES = ["all", "draft", "scheduled", "published"] as const;

export default async function AllPosts({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ status?: string; q?: string; category?: string }> }) {
  const { site: key } = await params;
  const query = await searchParams;
  const db = await readDb();
  const site = db.sites.find((s) => s.key === key);
  if (!site) notFound();

  const status = STATUSES.find((s) => s === query.status) ?? "all";
  const q = (query.q ?? "").trim().toLowerCase();
  const categories = db.categories.filter((c) => c.siteId === site.id).sort((a, b) => a.order - b.order);
  const category = categories.find((c) => c.id === query.category);
  const all = db.posts.filter((p) => p.siteId === site.id).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const posts = all.filter(
    (p) => (status === "all" || displayStatus(p) === status) && (!category || p.categoryId === category.id) && (!q || `${p.title} ${p.slug} ${p.summary} ${p.tags.join(" ")}`.toLowerCase().includes(q)),
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">All Posts</h1>
          <p className="text-[0.95rem] text-ink-soft">
            {site.name}: {posts.length} of {all.length} shown
          </p>
        </div>
        <a href={`/admin/${site.key}/posts/new`} className="btn btn-accent">
          <FilePlus2 aria-hidden className="size-4" /> Create New Post
        </a>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" type="search" className="input" defaultValue={query.q ?? ""} placeholder="Title, slug, summary or tag" />
        </div>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" className="input" defaultValue={status}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <select id="category" name="category" className="input" defaultValue={category?.id ?? ""}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          Filter
        </button>
        <a href={`/admin/${site.key}/posts`} className="btn btn-secondary">
          Clear
        </a>
      </form>

      <div className="card">
        <PostTable
          site={site}
          posts={posts}
          categories={categories}
          authors={db.authors}
          otherSites={db.sites.filter((s) => s.id !== site.id).map((s) => ({ key: s.key, name: s.name }))}
          empty={all.length === 0 ? "This website has no articles yet. Create the first one." : "No articles match these filters."}
        />
      </div>
    </div>
  );
}
