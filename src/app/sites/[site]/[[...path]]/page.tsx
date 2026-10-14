import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleView, ListingView, SiteChrome, TestBanner } from "@/components/public/site-view";
import { toCard } from "@/lib/content";
import type { Site } from "@/lib/types";
import { siteByKey } from "@/server/http";
import { publicPostBySlug, publicPosts } from "@/server/posts";
import { readDb } from "@/server/store";

/**
 * Local public preview of one website's blog, at the same paths the real website uses
 * (for Customs Wise: /blog and /insights/blog/<slug>). It reads only visible articles, exactly as the public API does.
 */

// Always read current content: publishing in the CMS shows here on the next page load.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ site: string; path?: string[] }>; searchParams: Promise<{ category?: string }> };

/** Which page a path is: the listing, an article (with its slug), or nothing. */
function route(site: Site, segments: string[] | undefined): { kind: "listing" } | { kind: "article"; slug: string } | null {
  const path = `/${(segments ?? []).join("/")}`;
  if (path === site.listingPath) return { kind: "listing" };
  const [before, after] = site.articlePathPattern.split("{slug}");
  if (path.startsWith(before) && path.endsWith(after) && path.length > before.length + after.length) {
    const slug = path.slice(before.length, path.length - after.length);
    if (/^[a-z0-9-]+$/.test(slug)) return { kind: "article", slug };
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site: key, path } = await params;
  const site = await siteByKey(key);
  const where = site && route(site, path);
  if (!site || !where) return { title: "Not found" };
  if (where.kind === "listing") {
    return {
      title: `${site.seo.listingTitle} | ${site.seo.titleSuffix}`,
      description: site.seo.listingDescription,
      alternates: { canonical: `${site.baseUrl}${site.listingPath}` },
    };
  }
  const found = await publicPostBySlug(site, where.slug);
  if (!found) return { title: "Not found" };
  const { post } = found;
  return {
    title: { absolute: post.seo.title },
    description: post.seo.description,
    // The canonical points at the real website's address for this article, as it would in production.
    alternates: { canonical: post.canonicalUrl },
    openGraph: {
      type: "article",
      title: post.seo.title,
      description: post.seo.description,
      url: post.canonicalUrl,
      siteName: site.seo.organisationName,
      ...(post.displayDate ? { publishedTime: post.displayDate } : {}),
      modifiedTime: post.updatedAt,
      ...(post.category ? { section: post.category.label } : {}),
      tags: post.tags,
      ...(post.coverImage ? { images: [{ url: post.coverImage.url, width: post.coverImage.width, height: post.coverImage.height, alt: post.coverImage.alt }] } : {}),
    },
    twitter: { card: "summary_large_image", title: post.seo.title, description: post.seo.description },
  };
}

export default async function SitePage({ params, searchParams }: Props) {
  const { site: key, path } = await params;
  const site = await siteByKey(key);
  if (!site) notFound();
  const where = route(site, path);
  if (!where) notFound();

  const banner = (
    <TestBanner site={site}>
      <a href={`/admin/${site.key}`} className="underline">
        Open the CMS
      </a>
    </TestBanner>
  );

  if (where.kind === "listing") {
    const { category } = await searchParams;
    const active = category && /^[a-z0-9-]+$/.test(category) ? category : undefined;
    const [all, db] = await Promise.all([publicPosts(site), readDb()]);
    const categories = db.categories
      .filter((c) => c.siteId === site.id)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ slug: c.slug, label: c.label, count: all.filter((p) => p.category?.slug === c.slug).length }))
      .filter((c) => c.count > 0);
    const posts = (active ? all.filter((p) => p.category?.slug === active) : all).map(toCard);
    return (
      <>
        {banner}
        <SiteChrome site={site}>
          <ListingView site={site} posts={posts} categories={categories} active={active} />
        </SiteChrome>
      </>
    );
  }

  const found = await publicPostBySlug(site, where.slug);
  if (!found) notFound();
  return (
    <>
      {banner}
      {found.post.jsonLd.map((data, i) => (
        // Structured data is generated from the article's fields; "<" is escaped so it cannot close the script tag.
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
      ))}
      <SiteChrome site={site}>
        <ArticleView site={site} post={found.post} related={found.related} />
      </SiteChrome>
    </>
  );
}
