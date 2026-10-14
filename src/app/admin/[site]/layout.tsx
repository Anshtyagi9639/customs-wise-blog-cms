import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { readDb } from "@/server/store";

// The admin always shows current data, never a cached page.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Blog CMS (local)", template: "%s · Blog CMS (local)" } };

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ site: string }> }) {
  const { site: key } = await params;
  const db = await readDb();
  const site = db.sites.find((s) => s.key === key);
  if (!site) notFound();

  return (
    <div className="admin min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="bg-overnight p-4 text-salt lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto">
        <a href="/" className="block">
          <span className="block text-[1.05rem] leading-tight font-bold">Multi-Site Blog CMS</span>
          <span className="mt-0.5 inline-block rounded-full bg-freight px-2 py-0.5 text-[0.7rem] font-bold tracking-wide text-overnight uppercase">Local prototype</span>
        </a>
        <div className="mt-5">
          <AdminNav siteKey={site.key} sites={db.sites.map((s) => ({ key: s.key, name: s.name, note: s.note }))} />
          <a href={`/sites/${site.key}${site.listingPath}`} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-2 rounded-brand border border-salt/25 px-3 text-[0.9rem] font-semibold text-salt hover:bg-salt/10">
            <ExternalLink aria-hidden className="size-4" /> Open website preview
          </a>
          <p className="mt-4 text-[0.78rem] leading-snug text-starlight">No sign-in in this prototype. It runs on this computer only and must not be put online as it is.</p>
        </div>
      </aside>
      <div className="min-w-0 px-4 py-6 sm:px-6 lg:py-8">{children}</div>
    </div>
  );
}
