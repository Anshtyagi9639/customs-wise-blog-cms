import { readDb } from "@/server/store";

export const dynamic = "force-dynamic";

/** Start page of the local prototype: where everything is. */
export default async function Home() {
  const db = await readDb();
  return (
    <main className="admin min-h-dvh px-4 py-10">
      <div className="mx-auto grid max-w-3xl gap-6">
        <div>
          <span className="inline-block rounded-full bg-freight px-2.5 py-0.5 text-[0.72rem] font-bold tracking-wide text-overnight uppercase">Local prototype</span>
          <h1 className="page-title mt-2">Multi-Site Blog CMS</h1>
          <p className="mt-1 text-ink-soft">A proof of concept running on this computer. It has no sign-in and is not connected to any live website.</p>
        </div>
        {db.sites.map((site) => (
          <section key={site.id} className="card grid gap-3">
            <h2 className="section-title">
              {site.name} <span className="font-normal text-pebble">({site.note})</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-primary" href={`/admin/${site.key}`}>
                Open the CMS dashboard
              </a>
              <a className="btn btn-secondary" href={`/sites/${site.key}${site.listingPath}`}>
                Open the website preview
              </a>
              <a className="btn btn-secondary" href={`/api/public/v1/sites/${site.key}/posts`}>
                Public API
              </a>
            </div>
            <p className="text-[0.86rem] text-pebble">
              {db.posts.filter((p) => p.siteId === site.id).length} articles · real address used for canonical URLs: {site.baseUrl}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
