import { notFound } from "next/navigation";
import { ArticleView, SiteChrome, TestBanner } from "@/components/public/site-view";
import { displayStatus } from "@/lib/content";
import { siteByKey } from "@/server/http";
import { previewPost } from "@/server/posts";

/**
 * Full-page preview of one saved article in its website's design, whatever its status.
 * Reached only from the CMS. In production this address would need a signed, short-lived link, because it can show
 * unpublished content; in this local prototype there is no sign-in at all.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Preview" };

export default async function RawPreview({ params }: { params: Promise<{ site: string; id: string }> }) {
  const { site: key, id } = await params;
  const site = await siteByKey(key);
  const found = site && (await previewPost(site, id));
  if (!site || !found) notFound();
  const status = displayStatus(found.raw);
  return (
    <>
      <TestBanner site={site}>
        <span className="rounded-full bg-overnight px-2.5 py-0.5 text-salt" data-testid="preview-status">
          {status === "published" ? "PUBLISHED" : status === "scheduled" ? "SCHEDULED: not visible to the public yet" : "DRAFT: not visible to the public"}
        </span>
      </TestBanner>
      <SiteChrome site={site}>
        <ArticleView site={site} post={found.post} related={found.related} />
      </SiteChrome>
    </>
  );
}
