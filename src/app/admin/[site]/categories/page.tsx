import { notFound } from "next/navigation";
import { CategoriesManager } from "@/components/admin/managers";
import { readDb } from "@/server/store";

export const metadata = { title: "Categories" };

export default async function CategoriesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site: key } = await params;
  const db = await readDb();
  const site = db.sites.find((s) => s.key === key);
  if (!site) notFound();
  const categories = db.categories.filter((c) => c.siteId === site.id).sort((a, b) => a.order - b.order);
  const counts: Record<string, number> = {};
  for (const p of db.posts) if (p.siteId === site.id && p.categoryId) counts[p.categoryId] = (counts[p.categoryId] ?? 0) + 1;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="page-title">Categories</h1>
        <p className="text-[0.95rem] text-ink-soft">
          These belong to {site.name} only. Other websites have their own categories.
        </p>
      </div>
      <CategoriesManager siteKey={site.key} categories={categories} counts={counts} />
    </div>
  );
}
