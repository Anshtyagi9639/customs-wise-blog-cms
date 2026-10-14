import { notFound } from "next/navigation";
import { SettingsForm } from "@/components/admin/managers";
import { readDb } from "@/server/store";

export const metadata = { title: "Website Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: key } = await params;
  const db = await readDb();
  const site = db.sites.find((s) => s.key === key);
  if (!site) notFound();
  const api = `/api/public/v1/sites/${site.key}`;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">Website Settings</h1>
        <p className="text-[0.95rem] text-ink-soft">
          {site.name} <span className="text-pebble">({site.note})</span>
        </p>
      </div>
      <SettingsForm key={site.updatedAt} site={site} />
      <section className="card grid gap-2">
        <h2 className="section-title">How this website reads its articles</h2>
        <p className="text-[0.92rem] text-ink-soft">Read-only addresses for this website. They return published articles only, and never another website&apos;s content.</p>
        <ul className="grid gap-1 text-[0.9rem]">
          {[`${api}/posts`, `${api}/posts/{slug}`, `${api}/categories`, `${api}/sitemap`].map((u) => (
            <li key={u}>
              {u.includes("{") ? (
                <code>{u}</code>
              ) : (
                <a href={u} target="_blank" rel="noopener noreferrer" className="text-atlantic underline">
                  <code>{u}</code>
                </a>
              )}
            </li>
          ))}
        </ul>
        <p className="hint">Local preview of this website&apos;s blog: <a className="underline" href={`/sites/${site.key}${site.listingPath}`}>/sites/{site.key}{site.listingPath}</a></p>
      </section>
    </div>
  );
}
