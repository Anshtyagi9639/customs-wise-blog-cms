"use client";

import { FilePlus2, FileText, FolderTree, LayoutDashboard, Settings, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const ITEMS = [
  { path: "", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/posts", label: "All Posts", icon: FileText, exact: true },
  { path: "/posts/new", label: "Create New Post", icon: FilePlus2, exact: true },
  { path: "/categories", label: "Categories", icon: FolderTree },
  { path: "/authors", label: "Authors", icon: Users },
  { path: "/settings", label: "Website Settings", icon: Settings },
];

export function AdminNav({ siteKey, sites }: { siteKey: string; sites: { key: string; name: string; note: string }[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/admin/${siteKey}`;
  return (
    <>
      <div>
        <label className="mb-1 block text-[0.72rem] font-bold tracking-[0.12em] text-starlight uppercase" htmlFor="site-switch">
          Website
        </label>
        <select
          id="site-switch"
          className="min-h-10 w-full rounded-brand border border-salt/25 bg-ship px-2.5 text-[0.92rem] font-semibold text-salt"
          value={siteKey}
          onChange={(e) => router.push(`/admin/${e.target.value}`)}
        >
          {sites.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name} ({s.note})
            </option>
          ))}
        </select>
      </div>
      <nav aria-label="CMS" className="mt-4">
        <ul className="flex flex-wrap gap-1 lg:flex-col">
          {ITEMS.map((item) => {
            const href = `${base}${item.path}`;
            const active = item.exact ? pathname === href : pathname.startsWith(href);
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <a
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-2.5 rounded-brand px-3 text-[0.92rem] font-semibold transition-colors ${active ? "bg-cargo text-overnight" : "text-salt hover:bg-salt/10"}`}
                >
                  <Icon aria-hidden className="size-4 shrink-0" /> {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-4 border-t border-salt/15 pt-4" />
    </>
  );
}
