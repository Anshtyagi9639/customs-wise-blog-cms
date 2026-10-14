import { formatDate } from "@/lib/content";
import type { PublicCard, PublicPost, Site } from "@/lib/types";
import { Blocks } from "./blocks";

/** A deliberately different, fictional website design: it shows that each website keeps its own look, addresses and content. */

const local = (site: Site, path: string) => `/sites/${site.key}${path}`;

export function DemoChrome({ site, children }: { site: Site; children: React.ReactNode }) {
  return (
    <div className="theme-demo min-h-dvh">
      <header className="border-b-4 border-demo-leaf bg-salt">
        <div className="mx-auto flex w-[min(60rem,100%-2.5rem)] flex-wrap items-baseline justify-between gap-3 py-5">
          <a href={local(site, site.listingPath)} className="text-[1.6rem] font-bold text-demo-ink">
            {site.name}
          </a>
          <span className="text-[0.85rem] text-demo-clay">Fictional website for testing</span>
        </div>
      </header>
      <main className="mx-auto w-[min(60rem,100%-2.5rem)] py-10">{children}</main>
      <footer className="border-t border-demo-leaf/40 py-6 text-center text-[0.85rem]">Demo Website is not a real organisation.</footer>
    </div>
  );
}

function Byline({ post }: { post: PublicCard }) {
  return (
    <p className="text-[0.85rem] text-demo-clay">
      {[post.category?.label, post.author && `By ${post.author.name}`, post.displayDate && formatDate(post.displayDate, "en-GB"), `${post.readMinutes} min read`].filter(Boolean).join(" · ")}
    </p>
  );
}

export function DemoListing({ site, posts, categories, active }: { site: Site; posts: PublicCard[]; categories: { slug: string; label: string; count: number }[]; active?: string }) {
  const base = local(site, site.listingPath);
  return (
    <>
      <h1 className="text-[2.4rem]">{site.seo.listingTitle}</h1>
      <p className="mt-2 text-[1.05rem]">{site.seo.listingDescription}</p>
      <nav aria-label="Categories" className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[0.95rem]">
        <a href={base} className={!active ? "font-bold underline" : "underline"}>
          All
        </a>
        {categories.map((c) => (
          <a key={c.slug} href={`${base}?category=${c.slug}`} className={active === c.slug ? "font-bold underline" : "underline"}>
            {c.label} ({c.count})
          </a>
        ))}
      </nav>
      {posts.length === 0 ? (
        <p className="mt-10 border border-dashed border-demo-leaf p-8 text-center">No articles have been published here yet.</p>
      ) : (
        <ul className="mt-8 divide-y divide-demo-leaf/30">
          {posts.map((p) => (
            <li key={p.id} className="grid gap-5 py-7 sm:grid-cols-[14rem_1fr]">
              {p.coverImage ? (
                <img src={p.coverImage.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div aria-hidden className="grid aspect-[4/3] w-full place-items-center bg-demo-leaf/15 text-[0.85rem] text-demo-leaf">
                  No image
                </div>
              )}
              <div>
                <Byline post={p} />
                <h2 className="mt-1 text-[1.5rem]">
                  <a href={local(site, p.path)} className="hover:text-demo-leaf hover:underline">
                    {p.title}
                  </a>
                </h2>
                <p className="mt-2">{p.summary}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function DemoArticle({ site, post, related }: { site: Site; post: PublicPost; related: PublicCard[] }) {
  return (
    <>
      <p className="text-[0.9rem]">
        <a href={local(site, site.listingPath)} className="underline">
          ← {site.seo.listingTitle}
        </a>
      </p>
      <article aria-label={post.title} className="mt-4">
        <Byline post={post} />
        <h1 className="mt-2 text-[2.4rem]">{post.title}</h1>
        <p className="mt-3 text-[1.15rem] italic">{post.summary}</p>
        {post.coverImage && (
          <figure className="mt-6">
            <img src={post.coverImage.url} alt={post.coverImage.alt} width={post.coverImage.width} height={post.coverImage.height} className="h-auto w-full" />
            {post.coverImage.caption && <figcaption className="mt-2 text-[0.88rem]">{post.coverImage.caption}</figcaption>}
          </figure>
        )}
        <div className="prose-demo mt-8">
          <Blocks blocks={post.body} site={site} />
          {post.faq.length > 0 && (
            <section>
              <h2>Questions and answers</h2>
              {post.faq.map((f, i) => (
                <div key={i}>
                  <h3>{f.question}</h3>
                  <p className="whitespace-pre-line">{f.answer}</p>
                </div>
              ))}
            </section>
          )}
          {post.sources.length > 0 && (
            <section>
              <h2>Sources</h2>
              <ul>
                {post.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {post.lastReviewedAt && <p className="text-[0.9rem]">Last reviewed {formatDate(post.lastReviewedAt, "en-GB")}.</p>}
          {post.author?.kind === "person" && (
            <p className="border-t border-demo-leaf/40 pt-4 text-[0.95rem]">
              <strong>{post.author.name}</strong>
              {post.author.jobTitle && `, ${post.author.jobTitle}`}. {post.author.bio}
            </p>
          )}
          {post.tags.length > 0 && <p className="text-[0.88rem] text-demo-clay">Tags: {post.tags.join(", ")}</p>}
        </div>
      </article>
      {related.length > 0 && (
        <section aria-labelledby="demo-related" className="mt-12 border-t-4 border-demo-leaf pt-6">
          <h2 id="demo-related" className="text-[1.4rem]">
            More from the journal
          </h2>
          <ul className="mt-3 space-y-2">
            {related.map((p) => (
              <li key={p.id}>
                <a href={local(site, p.path)} className="text-demo-leaf underline">
                  {p.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
