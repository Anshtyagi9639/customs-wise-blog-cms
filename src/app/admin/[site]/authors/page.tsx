import { notFound } from "next/navigation";
import { AuthorsManager } from "@/components/admin/managers";
import { readDb } from "@/server/store";

export const metadata = { title: "Authors" };

export default async function AuthorsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: key } = await params;
  const db = await readDb();
  const site = db.sites.find((s) => s.key === key);
  if (!site) notFound();
  const counts: Record<string, number> = {};
  for (const p of db.posts) if (p.authorId) counts[p.authorId] = (counts[p.authorId] ?? 0) + 1;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">Authors</h1>
        <p className="text-[0.95rem] text-ink-soft">Authors are shared by the CMS. Each one is ticked for the websites they write for, and can only be chosen on those.</p>
      </div>
      <AuthorsManager site={site} sites={db.sites.map((s) => ({ id: s.id, name: s.name }))} authors={db.authors} counts={counts} />
    </div>
  );
}
