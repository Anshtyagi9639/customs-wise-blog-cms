import type { PublicCard, PublicPost, Site } from "@/lib/types";
import { CwArticle, CwChrome, CwListing } from "./customs-wise";
import { DemoArticle, DemoChrome, DemoListing } from "./demo";

/** Picks the design for a website. Each website's blog is rendered by its own components. */

export function TestBanner({ site, children }: { site: Site; children?: React.ReactNode }) {
  return (
    <div role="note" className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-freight px-4 py-1.5 text-center font-sans text-[0.82rem] font-bold text-overnight">
      <span>
        LOCAL TEST PREVIEW of {site.name} ({site.note}). This is not the live website.
      </span>
      {children}
    </div>
  );
}

export function SiteChrome({ site, children }: { site: Site; children: React.ReactNode }) {
  return site.theme === "customs-wise" ? <CwChrome site={site}>{children}</CwChrome> : <DemoChrome site={site}>{children}</DemoChrome>;
}

export function ArticleView({ site, post, related }: { site: Site; post: PublicPost; related: PublicCard[] }) {
  return site.theme === "customs-wise" ? <CwArticle site={site} post={post} related={related} /> : <DemoArticle site={site} post={post} related={related} />;
}

export function ListingView(props: { site: Site; posts: PublicCard[]; categories: { slug: string; label: string; count: number }[]; active?: string }) {
  return props.site.theme === "customs-wise" ? <CwListing {...props} /> : <DemoListing {...props} />;
}
