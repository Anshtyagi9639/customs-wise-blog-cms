import { ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/content";
import type { PublicCard, PublicPost, Site } from "@/lib/types";
import { Blocks, resolveHref } from "./blocks";

/**
 * Local preview of the Customs Wise blog. The markup and class names follow the website's own blog components
 * (page hero, featured post, blog card, article layout, related posts), so an article here looks as it would there.
 * The header and footer are simplified stand-ins: their links open the real website.
 */

const NAV = [
  ["Home", "/"],
  ["About", "/about"],
  ["Services", "/services"],
  ["Food Customs", "/food-customs"],
  ["Industries", "/industries"],
  ["Insights", "/insights"],
] as const;

const local = (site: Site, path: string) => `/sites/${site.key}${path}`;

export function CwChrome({ site, children }: { site: Site; children: React.ReactNode }) {
  return (
    <div className="theme-cw bg-salt">
      <header className="absolute inset-x-0 z-10">
        <div className="container-site flex h-[var(--nav-h)] items-center gap-6">
          <a href={local(site, site.listingPath)} aria-label="Customs Wise blog (local preview)">
            <img src="/brand/customs-wise-logo.png" alt="Customs Wise" width={626} height={272} className="h-11 w-auto" />
          </a>
          <nav aria-label="Main" className="ml-auto hidden items-center gap-6 text-[0.95rem] font-semibold text-salt lg:flex">
            {NAV.map(([label, path]) => (
              <a key={path} href={`${site.baseUrl}${path}`} target="_blank" rel="noopener noreferrer" className="hover:text-cargo">
                {label}
              </a>
            ))}
            <a href={local(site, site.listingPath)} className="border-b-2 border-cargo pb-0.5 text-cargo">
              Blog
            </a>
          </nav>
          <a
            href={`${site.baseUrl}/contact#enquiry`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-h-11 items-center rounded-brand bg-cargo px-5 text-[0.95rem] font-bold text-overnight hover:bg-haul lg:ml-0"
          >
            Make an Enquiry
          </a>
        </div>
      </header>
      <main>{children}</main>
      <footer className="bg-overnight py-10 text-[0.9rem] text-starlight">
        <div className="container-site flex flex-wrap items-center justify-between gap-4">
          <img src="/brand/customs-wise-logo.png" alt="Customs Wise" width={626} height={272} className="h-12 w-auto" />
          <p className="max-w-[46ch]">Local preview: this header and footer are simplified stand-ins for the real ones on {site.baseUrl.replace(/^https?:\/\//, "")}.</p>
        </div>
      </footer>
    </div>
  );
}

function Hero({ title, intro, trail }: { title: string; intro: React.ReactNode; trail: { name: string; href?: string }[] }) {
  return (
    <section className="bg-clearance relative overflow-hidden pt-[calc(var(--nav-h)+3.5rem)] pb-16 text-salt">
      <div className="container-site relative">
        <nav aria-label="Breadcrumb" className="mb-5 text-[0.86rem] text-starlight">
          <ol className="flex flex-wrap items-center gap-x-2">
            {[{ name: "Home" } as { name: string; href?: string }, ...trail].map((c, i, all) => (
              <li key={i} className="flex items-center gap-x-2">
                {c.href ? (
                  <a href={c.href} className="hover:text-cargo">
                    {c.name}
                  </a>
                ) : (
                  <span aria-current={i === all.length - 1 ? "page" : undefined}>{c.name}</span>
                )}
                {i < all.length - 1 && <span aria-hidden>/</span>}
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="max-w-[20ch] text-[clamp(2.2rem,5vw,4rem)] uppercase !text-salt">{title}</h1>
        <div className="mt-4 max-w-[62ch] text-[1.1rem] text-[#d2dfe5]">{intro}</div>
      </div>
    </section>
  );
}

/** Category, author, date and reading time. Mirrors the website's post-meta line, with the author added. */
function Meta({ post, tone = "light", className = "" }: { post: PublicCard; tone?: "light" | "dark"; className?: string }) {
  const muted = tone === "dark" ? "text-starlight" : "text-pebble";
  const sep = `whitespace-nowrap before:inline-block before:w-5 before:text-center before:font-normal before:content-['/'] ${tone === "dark" ? "before:text-salt/30" : "before:text-line"}`;
  return (
    <div className={`overflow-hidden text-[0.8rem] font-bold ${className}`}>
      <p className="-ml-5 flex flex-wrap items-center gap-y-1">
        {post.category && <span className={`${sep} ${tone === "dark" ? "text-cargo" : "text-freight"}`}>{post.category.label}</span>}
        {post.author && <span className={`${sep} ${muted}`}>By {post.author.name}</span>}
        {post.displayDate && (
          <time dateTime={post.displayDate} className={`${sep} ${muted}`}>
            {formatDate(post.displayDate)}
          </time>
        )}
        <span className={`${sep} ${muted}`}>{post.readMinutes} min read</span>
      </p>
    </div>
  );
}

function NoImage({ label }: { label?: string }) {
  return (
    <div aria-hidden className="bg-clearance absolute inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-16 place-items-center rounded-brand bg-salt/95">
          <img src="/brand/docs-icon.png" alt="" width={40} height={40} className="size-10" />
        </span>
        {label && <span className="font-display text-[1.05rem] tracking-[0.14em] text-starlight uppercase">{label}</span>}
      </div>
    </div>
  );
}

function Card({ site, post }: { site: Site; post: PublicCard }) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-brand border border-line bg-salt transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-atlantic hover:shadow-card focus-within:border-atlantic">
      <div className="relative aspect-video overflow-hidden bg-ship">
        {post.coverImage ? (
          <img src={post.coverImage.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <NoImage label={post.category?.label} />
        )}
      </div>
      <div className="flex flex-1 flex-col px-5.5 pt-5 pb-6">
        <Meta post={post} className="mb-2" />
        <h3 className="text-[1.4rem] group-hover:text-freight">{post.title}</h3>
        <p className="mt-2 flex-1 text-[0.93rem] text-ink-soft">{post.summary}</p>
        <a
          href={local(site, post.path)}
          aria-label={`Read article: ${post.title}`}
          className="mt-4 inline-flex items-center gap-1.5 text-[0.93rem] font-bold text-atlantic after:absolute after:inset-0 after:content-['']"
        >
          Read article <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
        </a>
      </div>
    </article>
  );
}

function Featured({ site, post }: { site: Site; post: PublicCard }) {
  const href = local(site, post.path);
  return (
    <article aria-labelledby="featured-post-title" className="grid overflow-hidden rounded-brand border border-line bg-salt shadow-card lg:grid-cols-[1.1fr_1fr]">
      <div className="relative bg-ship">
        {post.coverImage ? (
          <div className="relative mx-auto h-full w-full" style={{ aspectRatio: `${post.coverImage.width} / ${post.coverImage.height}`, maxWidth: post.coverImage.width }}>
            <img src={post.coverImage.url} alt={post.coverImage.alt} className="absolute inset-0 size-full object-cover" />
          </div>
        ) : (
          <div className="relative aspect-video h-full">
            <NoImage label={post.category?.label} />
          </div>
        )}
      </div>
      <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-11">
        <p className="mb-3 text-[0.8rem] font-bold tracking-[0.14em] text-freight uppercase">Latest Blog</p>
        <Meta post={post} className="mb-3" />
        <h3 id="featured-post-title" className="text-[clamp(1.8rem,3vw,2.5rem)]">
          <a href={href} className="hover:text-freight">
            {post.title}
          </a>
        </h3>
        <p className="mt-4 text-[1.05rem] text-ink-soft">{post.summary}</p>
        <div className="mt-7">
          <a
            href={href}
            aria-label={`Read article: ${post.title}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-brand border-2 border-atlantic px-5 font-bold text-atlantic hover:bg-atlantic hover:text-salt"
          >
            Read article <ArrowRight aria-hidden className="size-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

export function CwListing({ site, posts, categories, active }: { site: Site; posts: PublicCard[]; categories: { slug: string; label: string; count: number }[]; active?: string }) {
  const base = local(site, site.listingPath);
  const [featured, ...rest] = posts;
  const grid = active ? posts : rest;
  const chip = (on: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[0.92rem] font-semibold transition-colors ${on ? "border-atlantic bg-atlantic text-salt" : "border-line bg-salt text-ship hover:border-atlantic hover:text-atlantic"}`;
  const total = categories.reduce((n, c) => n + c.count, 0);
  return (
    <>
      <Hero title={site.seo.listingTitle} intro={site.seo.listingDescription} trail={[{ name: site.seo.listingTitle }]} />
      <section aria-label="Blog posts" className="py-16 sm:py-20">
        <div className="container-site">
          {posts.length === 0 && !active ? (
            <p className="rounded-brand border border-dashed border-line px-6 py-12 text-center text-ink-soft">No articles have been published yet. Publish one in the CMS and it will appear here.</p>
          ) : (
            <>
              {!active && featured && <Featured site={site} post={featured} />}
              <div className={active ? "" : "mt-12"}>
                <div role="group" aria-label="Filter articles by topic" className="flex flex-wrap gap-2">
                  <a href={base} className={chip(!active)} aria-current={!active ? "true" : undefined}>
                    All articles <span className={`rounded-full px-2 text-[0.76rem] ${!active ? "bg-salt/20" : "bg-mist"}`}>{total}</span>
                  </a>
                  {categories.map((c) => (
                    <a key={c.slug} href={`${base}?category=${c.slug}`} className={chip(active === c.slug)} aria-current={active === c.slug ? "true" : undefined}>
                      {c.label} <span className={`rounded-full px-2 text-[0.76rem] ${active === c.slug ? "bg-salt/20" : "bg-mist"}`}>{c.count}</span>
                    </a>
                  ))}
                </div>
                <p className="mt-6 mb-4 text-[0.92rem] text-pebble">{active ? `${grid.length} ${grid.length === 1 ? "article" : "articles"} found` : "More articles"}</p>
                {grid.length === 0 ? (
                  <p className="rounded-brand border border-dashed border-line px-6 py-10 text-center text-ink-soft">No articles in this category yet.</p>
                ) : (
                  <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {grid.map((p) => (
                      <li key={p.id}>
                        <Card site={site} post={p} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

export function CwArticle({ site, post, related }: { site: Site; post: PublicPost; related: PublicCard[] }) {
  const listing = local(site, site.listingPath);
  const links = post.relatedLinks.length
    ? post.relatedLinks
    : [
        { label: "Customs services", href: "/services" },
        { label: "Food customs", href: "/food-customs" },
      ];
  return (
    <>
      <Hero title={post.title} intro={<Meta post={post} tone="dark" className="text-[0.92rem]" />} trail={[{ name: site.seo.listingTitle, href: listing }, { name: post.title }]} />
      <div className="container-site grid items-start gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_18.75rem] lg:gap-18">
        <div className="prose-cw min-w-0">
          <article aria-label={post.title}>
            {post.coverImage && (
              <figure className="!mt-0 mb-8">
                <img
                  src={post.coverImage.url}
                  alt={post.coverImage.alt}
                  width={post.coverImage.width}
                  height={post.coverImage.height}
                  fetchPriority="high"
                  className="h-auto w-full rounded-brand"
                  style={{ maxWidth: post.coverImage.width }}
                />
                {post.coverImage.caption && <figcaption>{post.coverImage.caption}</figcaption>}
              </figure>
            )}
            <Blocks blocks={post.body} site={site} />

            {post.faq.length > 0 && (
              <section aria-labelledby="faq-title">
                <h2 id="faq-title">Frequently asked questions</h2>
                {post.faq.map((f, i) => (
                  <div key={i}>
                    <h3>{f.question}</h3>
                    <p className="whitespace-pre-line">{f.answer}</p>
                  </div>
                ))}
              </section>
            )}

            {post.sources.length > 0 && (
              <section aria-labelledby="sources-title">
                <h2 id="sources-title">Sources</h2>
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

            {(post.lastReviewedAt || post.tags.length > 0 || (post.author && post.author.kind === "person")) && (
              <footer className="mt-10 space-y-4 border-t border-line pt-6 text-[0.9rem]">
                {post.lastReviewedAt && (
                  <p className="!mb-0 !text-pebble">
                    Last reviewed: <time dateTime={post.lastReviewedAt}>{formatDate(post.lastReviewedAt)}</time>
                  </p>
                )}
                {post.author && post.author.kind === "person" && (
                  <div className="rounded-brand bg-mist p-4">
                    <p className="!mb-1 font-bold !text-overnight">
                      {post.author.name}
                      {post.author.jobTitle && <span className="font-normal text-pebble">, {post.author.jobTitle}</span>}
                    </p>
                    {post.author.bio && <p className="!mb-0">{post.author.bio}</p>}
                  </div>
                )}
                {post.tags.length > 0 && (
                  <ul className="!m-0 flex !list-none flex-wrap gap-2 !p-0" aria-label="Tags">
                    {post.tags.map((t) => (
                      <li key={t} className="!m-0 rounded-full border border-line px-3 py-0.5 text-[0.8rem] !text-ink-soft">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </footer>
            )}
          </article>
        </div>
        <aside className="grid gap-4.5 lg:sticky lg:top-6" aria-label="Related">
          <div className="bg-clearance rounded-brand p-5.5 text-[#e3ecf0]">
            <h2 className="text-[1.45rem] !text-salt">Need help with your customs requirements?</h2>
            <p className="mt-2 text-[0.93rem]">Talk it through with our team before your goods move.</p>
            <a
              href={`${site.baseUrl}/contact?service=other#enquiry`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-11 items-center rounded-brand bg-cargo px-5 font-bold text-overnight hover:bg-haul"
            >
              Make an enquiry
            </a>
          </div>
          <nav aria-label="Related Customs Wise pages" className="rounded-brand border border-line p-5">
            <h2 className="text-[1.3rem]">Related Customs Wise pages</h2>
            <ul className="mt-2.5 space-y-2 text-[0.93rem]">
              {links.map((l) => {
                const link = resolveHref(site, l.href);
                return (
                  <li key={l.href}>
                    <a href={link.href} {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="text-atlantic underline underline-offset-3 hover:text-freight">
                      {l.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      </div>
      {related.length > 0 && (
        <section aria-labelledby="related-posts-title" className="bg-mist py-16 sm:py-20">
          <div className="container-site">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <h2 id="related-posts-title" className="text-[clamp(1.9rem,3.4vw,2.8rem)]">
                Related articles
              </h2>
              <a href={listing} className="font-semibold text-atlantic underline underline-offset-3 hover:text-freight">
                All articles
              </a>
            </div>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <li key={p.id}>
                  <Card site={site} post={p} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
