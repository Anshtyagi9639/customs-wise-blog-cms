import { FilePlus2 } from "lucide-react";
import { notFound } from "next/navigation";
import { PostTable } from "@/components/admin/post-table";
import { displayStatus, formatDateTime } from "@/lib/content";
import { readDb } from "@/server/store";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ params }: { params: Promise<{ site: string }> }) {
  const { site: key } = await params;
  const db = await readDb();
  const site = db.sites.find((s) => s.key === key);
  if (!site) notFound();

  const posts = db.posts.filter((p) => p.siteId === site.id).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const by = (status: "draft" | "scheduled" | "published") => posts.filter((p) => displayStatus(p) === status);
  const groups = [
    { status: "draft" as const, title: "Drafts", empty: "No drafts. Articles you save without publishing appear here." },
    { status: "scheduled" as const, title: "Scheduled", empty: "Nothing is scheduled. Publish an article with a future date and time to schedule it." },
    { status: "published" as const, title: "Published", empty: "Nothing is published on this website yet." },
  ];
  const categories = db.categories.filter((c) => c.siteId === site.id);
  const otherSites = db.sites.filter((s) => s.id !== site.id).map((s) => ({ key: s.key, name: s.name }));
  const activity = db.audit.filter((a) => a.siteId === site.id || a.siteId === null).slice(0, 8);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-[0.95rem] text-ink-soft">
            {site.name} <span className="text-pebble">({site.note})</span>
          </p>
        </div>
        <a href={`/admin/${site.key}/posts/new`} className="btn btn-accent">
          <FilePlus2 aria-hidden className="size-4" /> Create New Post
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {groups.map((g) => (
          <a key={g.status} href={`#${g.status}`} className="card block hover:border-atlantic" data-testid={`count-${g.status}`}>
            <span className="block text-[2rem] leading-none font-bold">{by(g.status).length}</span>
            <span className="mt-1 block text-[0.9rem] text-ink-soft">{g.title}</span>
          </a>
        ))}
      </div>

      {groups.map((g) => (
        <section key={g.status} id={g.status} className="card" aria-labelledby={`h-${g.status}`}>
          <h2 id={`h-${g.status}`} className="section-title mb-3">
            {g.title} <span className="font-normal text-pebble">({by(g.status).length})</span>
          </h2>
          <PostTable site={site} posts={by(g.status).slice(0, 8)} categories={categories} authors={db.authors} otherSites={otherSites} empty={g.empty} />
          {by(g.status).length > 8 && (
            <p className="mt-3 text-[0.9rem]">
              <a href={`/admin/${site.key}/posts?status=${g.status}`} className="font-semibold text-atlantic underline">
                See all {by(g.status).length}
              </a>
            </p>
          )}
        </section>
      ))}

      <section className="card" aria-labelledby="h-activity">
        <h2 id="h-activity" className="section-title mb-3">
          Recent activity
        </h2>
        {activity.length === 0 ? (
          <p className="text-[0.92rem] text-pebble">Nothing has been changed yet.</p>
        ) : (
          <ul className="grid gap-1.5 text-[0.88rem]">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3">
                <span className="text-pebble">{formatDateTime(a.at)}</span>
                <code className="text-ship">{a.action}</code>
                <span>{a.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
