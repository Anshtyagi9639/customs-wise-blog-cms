import "server-only";
import type { Author, Category, Post, Site } from "@/lib/types";
import type { Database } from "./store";

/**
 * Starting content, created the first time the app runs with no data/db.json.
 * Two clearly labelled TEST website configurations. The Demo Website and everything in it is fictional.
 * Customs Wise starts with its real category names and no articles (import them with `npm run import:customs-wise`).
 */
export function seedDatabase(): Database {
  const now = new Date().toISOString();

  const customsWise: Site = {
    id: "site_customs_wise",
    key: "customs-wise",
    name: "Customs Wise",
    note: "test configuration",
    baseUrl: "https://www.customswise.ie",
    listingPath: "/blog",
    articlePathPattern: "/insights/blog/{slug}",
    theme: "customs-wise",
    locale: "en-IE",
    seo: {
      titleSuffix: "Customs Wise",
      organisationName: "Customs Wise",
      listingTitle: "Blog",
      listingDescription: "News and updates from the Customs Wise team.",
    },
    createdAt: now,
    updatedAt: now,
  };

  const demo: Site = {
    id: "site_demo",
    key: "demo-website",
    name: "Demo Website",
    note: "fictional test configuration",
    baseUrl: "https://demo-website.example",
    listingPath: "/journal",
    articlePathPattern: "/journal/{slug}",
    theme: "demo",
    locale: "en-GB",
    seo: {
      titleSuffix: "Demo Website",
      organisationName: "Demo Website (fictional)",
      listingTitle: "Journal",
      listingDescription: "Fictional articles used to test the multi-site CMS.",
    },
    createdAt: now,
    updatedAt: now,
  };

  const categories: Category[] = [
    { id: "cat_cw_food", siteId: customsWise.id, slug: "food-customs", label: "Food customs", order: 1 },
    { id: "cat_cw_reg", siteId: customsWise.id, slug: "regulatory-updates", label: "Regulatory updates", order: 2 },
    { id: "cat_cw_trade", siteId: customsWise.id, slug: "trade-policy", label: "Trade policy", order: 3 },
    { id: "cat_cw_guide", siteId: customsWise.id, slug: "practical-guidance", label: "Practical guidance", order: 4 },
    { id: "cat_demo_news", siteId: demo.id, slug: "news", label: "News", order: 1 },
    { id: "cat_demo_guides", siteId: demo.id, slug: "guides", label: "Guides", order: 2 },
  ];

  const authors: Author[] = [
    {
      id: "author_cw_org",
      kind: "organisation",
      name: "Customs Wise",
      slug: "customs-wise",
      jobTitle: "",
      bio: "",
      profileUrls: [],
      siteIds: [customsWise.id],
    },
    {
      id: "author_demo_alex",
      kind: "person",
      name: "Alex Example",
      slug: "alex-example",
      jobTitle: "Fictional editor",
      bio: "Alex Example is a made-up author used to test author profiles in the CMS.",
      profileUrls: ["https://demo-website.example/team/alex-example"],
      siteIds: [demo.id],
    },
  ];

  const demoPost = (n: number, slug: string, title: string, summary: string, categoryId: string, daysAgo: number, body: Post["body"]): Post => {
    const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    return {
      id: `post_demo_${n}`,
      siteId: demo.id,
      slug,
      title,
      summary,
      body,
      coverImage: null,
      categoryId,
      authorId: "author_demo_alex",
      tags: ["demo", "test"],
      seo: { title: "", description: "" },
      canonicalOverride: "",
      status: "published",
      publishAt: at,
      hideDate: false,
      faq: [],
      sources: [],
      relatedLinks: [],
      lastReviewedAt: null,
      readMinutesOverride: null,
      copiedFromPostId: null,
      createdAt: at,
      updatedAt: at,
    };
  };

  const posts: Post[] = [
    demoPost(1, "welcome-to-the-demo-journal", "Welcome to the demo journal", "A fictional first article that shows how a second website's blog is kept separate from the first.", "cat_demo_news", 3, [
      { type: "p", text: "This article is **fictional**. It exists so the CMS has a second website to publish to, with its own address pattern, categories and design." },
      { type: "h2", text: "What this demonstrates" },
      { type: "ul", items: ["Articles belong to one website only.", "Each website has its own categories and settings.", "The same slug can be used on two websites without a clash."] },
      { type: "callout", text: "Nothing on this page refers to a real organisation." },
    ]),
    demoPost(2, "how-to-read-a-test-article", "How to read a test article", "A fictional guide used to check lists, quotes and links in the article layout.", "cat_demo_guides", 9, [
      { type: "p", text: "Test articles are easiest to judge when they use every kind of block. This one has a list, a quote and a [link to the journal](/journal)." },
      { type: "ol", items: ["Read the heading.", "Check the layout on a phone.", "Compare it with the editor's preview."] },
      { type: "quote", text: "If it is not in the page source, a search engine may not see it.", cite: "A fictional editor" },
    ]),
  ];

  return { version: 1, sites: [customsWise, demo], categories, authors, posts, media: [], audit: [] };
}
