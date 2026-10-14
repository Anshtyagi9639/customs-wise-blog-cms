"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import type { Author, Category, Site } from "@/lib/types";

/** Categories, Authors and Website Settings screens. Each form saves through the admin API and reloads the data. */

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const save = async (url: string, method: "POST" | "PUT", body: unknown, success: string) => {
    setBusy(true);
    setError(null);
    setDone(null);
    setFieldErrors({});
    const result = await api(url, method, body);
    setBusy(false);
    if (!result.ok) {
      setError(result.data.message ?? "That could not be saved.");
      setFieldErrors(result.data.fieldErrors ?? {});
      return false;
    }
    setDone(success);
    router.refresh();
    return true;
  };
  return { busy, error, fieldErrors, done, save };
}

function Feedback({ error, fieldErrors, done }: { error: string | null; fieldErrors: Record<string, string>; done: string | null }) {
  const details = Object.values(fieldErrors).filter(Boolean);
  if (error)
    return (
      <div role="alert" className="rounded-brand border-l-4 border-error bg-salt px-4 py-2.5 text-[0.9rem] font-semibold text-error">
        {error}
        {details.length > 0 && (
          <ul className="mt-1 list-disc pl-5 font-normal">
            {details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>
    );
  return done ? (
    <p role="status" className="rounded-brand border-l-4 border-transit bg-salt px-4 py-2.5 text-[0.9rem] font-semibold text-ship">
      {done}
    </p>
  ) : null;
}

/* ---------- Categories ---------- */

export function CategoriesManager({ siteKey, categories, counts }: { siteKey: string; categories: Category[]; counts: Record<string, number> }) {
  const state = useSave();
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const url = `/api/admin/sites/${siteKey}/categories`;

  return (
    <div className="grid gap-5">
      <Feedback {...state} />
      <form
        className="card flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await state.save(url, "POST", { label }, "Category added.")) setLabel("");
        }}
      >
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="new-category">
            New category
          </label>
          <input id="new-category" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="For example: Trade policy" maxLength={60} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={state.busy || !label.trim()}>
          Add category
        </button>
      </form>

      <div className="card overflow-x-auto !p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Slug</th>
              <th>Articles</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="!py-6 text-center text-pebble">
                  This website has no categories yet.
                </td>
              </tr>
            )}
            {categories.map((c) => (
              <tr key={c.id}>
                <td>
                  {editing?.id === c.id ? (
                    <input className="input" aria-label="Category name" value={editing.label} onChange={(e) => setEditing({ id: c.id, label: e.target.value })} />
                  ) : (
                    <span className="font-semibold">{c.label}</span>
                  )}
                </td>
                <td className="text-pebble">{c.slug}</td>
                <td>{counts[c.id] ?? 0}</td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    {editing?.id === c.id ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={state.busy}
                          onClick={async () => {
                            if (await state.save(url, "POST", { id: c.id, label: editing.label, slug: c.slug }, "Category renamed.")) setEditing(null);
                          }}
                        >
                          Save
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: c.id, label: c.label })}>
                          Rename
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={state.busy}
                          onClick={() => {
                            if (window.confirm(`Delete the category "${c.label}"?`)) void state.save(url, "POST", { id: c.id, delete: true }, "Category deleted.");
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Authors ---------- */

type AuthorDraft = { id: string | null; kind: Author["kind"]; name: string; jobTitle: string; bio: string; profileUrls: string; siteIds: string[] };
const blankAuthor = (siteId: string): AuthorDraft => ({ id: null, kind: "person", name: "", jobTitle: "", bio: "", profileUrls: "", siteIds: [siteId] });

export function AuthorsManager({ site, sites, authors, counts }: { site: Site; sites: Pick<Site, "id" | "name">[]; authors: Author[]; counts: Record<string, number> }) {
  const state = useSave();
  const [draft, setDraft] = useState<AuthorDraft>(blankAuthor(site.id));
  const set = (patch: Partial<AuthorDraft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="grid gap-5">
      <Feedback {...state} />
      <form
        className="card grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const body = { ...draft, id: draft.id ?? undefined, profileUrls: draft.profileUrls.split("\n").map((u) => u.trim()).filter(Boolean) };
          if (await state.save("/api/admin/authors", "POST", body, draft.id ? "Author updated." : "Author added.")) setDraft(blankAuthor(site.id));
        }}
      >
        <h2 className="section-title">{draft.id ? "Edit author" : "Add an author"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="a-name">
              Name
            </label>
            <input id="a-name" className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} />
          </div>
          <div>
            <label className="label" htmlFor="a-kind">
              Type
            </label>
            <select id="a-kind" className="input" value={draft.kind} onChange={(e) => set({ kind: e.target.value as Author["kind"] })}>
              <option value="person">A person</option>
              <option value="organisation">The organisation</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="a-job">
              Job title <span className="font-normal text-pebble">(optional)</span>
            </label>
            <input id="a-job" className="input" value={draft.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="a-links">
              Profile links <span className="font-normal text-pebble">(optional, one per line)</span>
            </label>
            <textarea id="a-links" className="input" rows={2} value={draft.profileUrls} onChange={(e) => set({ profileUrls: e.target.value })} placeholder="https://www.linkedin.com/in/…" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="a-bio">
            Short biography <span className="font-normal text-pebble">(optional)</span>
          </label>
          <textarea id="a-bio" className="input" rows={3} value={draft.bio} onChange={(e) => set({ bio: e.target.value })} maxLength={800} />
        </div>
        <fieldset>
          <legend className="label">Writes for</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.92rem]">
            {sites.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input type="checkbox" checked={draft.siteIds.includes(s.id)} onChange={(e) => set({ siteIds: e.target.checked ? [...draft.siteIds, s.id] : draft.siteIds.filter((x) => x !== s.id) })} />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={state.busy || !draft.name.trim()}>
            {draft.id ? "Save author" : "Add author"}
          </button>
          {draft.id && (
            <button type="button" className="btn btn-secondary" onClick={() => setDraft(blankAuthor(site.id))}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="card overflow-x-auto !p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Author</th>
              <th>Writes for</th>
              <th>Articles</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {authors.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="font-semibold">{a.name}</span>
                  <span className="block text-[0.84rem] text-pebble">{a.kind === "organisation" ? "Organisation" : a.jobTitle || "Person"}</span>
                </td>
                <td>{a.siteIds.map((id) => sites.find((s) => s.id === id)?.name ?? id).join(", ")}</td>
                <td>{counts[a.id] ?? 0}</td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setDraft({ id: a.id, kind: a.kind, name: a.name, jobTitle: a.jobTitle, bio: a.bio, profileUrls: a.profileUrls.join("\n"), siteIds: a.siteIds });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={state.busy}
                      onClick={() => {
                        if (window.confirm(`Delete the author "${a.name}"?`)) void state.save("/api/admin/authors", "POST", { id: a.id, delete: true }, "Author deleted.");
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Website settings ---------- */

export function SettingsForm({ site }: { site: Site }) {
  const state = useSave();
  const [form, setForm] = useState({ name: site.name, note: site.note, baseUrl: site.baseUrl, listingPath: site.listingPath, articlePathPattern: site.articlePathPattern, seo: { ...site.seo } });
  const err = (key: string) => (state.fieldErrors[key] ? <p className="field-error">{state.fieldErrors[key]}</p> : null);
  const text = (id: string, label: string, value: string, onChange: (v: string) => void, hint?: string, errorKey?: string) => (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="hint">{hint}</p>}
      {err(errorKey ?? id)}
    </div>
  );

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void state.save(`/api/admin/sites/${site.key}`, "PUT", form, "Website settings saved.");
      }}
    >
      <Feedback error={state.error} fieldErrors={{}} done={state.done} />
      <section className="card grid gap-3">
        <h2 className="section-title">Website</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("name", "Website name", form.name, (v) => setForm({ ...form, name: v }))}
          {text("note", "Label", form.note, (v) => setForm({ ...form, note: v }), "Shown next to the name, for example: test configuration.")}
        </div>
        {text("baseUrl", "Website address", form.baseUrl, (v) => setForm({ ...form, baseUrl: v }), "Used to build canonical URLs and structured data. Nothing is sent to this address.")}
        <div className="grid gap-3 sm:grid-cols-2">
          {text("listingPath", "Blog listing address", form.listingPath, (v) => setForm({ ...form, listingPath: v }), "For example /blog")}
          {text("articlePathPattern", "Article address pattern", form.articlePathPattern, (v) => setForm({ ...form, articlePathPattern: v }), "Use {slug} for the article's slug, for example /insights/blog/{slug}")}
        </div>
        <p className="hint">Key: <code>{site.key}</code> (used in the API address; cannot be changed here)</p>
      </section>
      <section className="card grid gap-3">
        <h2 className="section-title">Search and structured-data defaults</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {text("seo.titleSuffix", "Added after article titles", form.seo.titleSuffix, (v) => setForm({ ...form, seo: { ...form.seo, titleSuffix: v } }), "A title becomes: Article title | this text")}
          {text("seo.organisationName", "Organisation name", form.seo.organisationName, (v) => setForm({ ...form, seo: { ...form.seo, organisationName: v } }), "The publisher in structured data.")}
          {text("seo.listingTitle", "Blog title", form.seo.listingTitle, (v) => setForm({ ...form, seo: { ...form.seo, listingTitle: v } }))}
          {text("seo.listingDescription", "Blog description", form.seo.listingDescription, (v) => setForm({ ...form, seo: { ...form.seo, listingDescription: v } }))}
        </div>
      </section>
      <div>
        <button type="submit" className="btn btn-primary" disabled={state.busy}>
          Save settings
        </button>
      </div>
    </form>
  );
}
