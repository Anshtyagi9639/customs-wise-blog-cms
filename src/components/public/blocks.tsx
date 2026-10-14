import { Fragment } from "react";
import { parseInline } from "@/lib/content";
import type { Block, Site } from "@/lib/types";

/**
 * Where a link inside the local preview should go.
 * Paths that belong to this website's blog stay inside the preview; any other path on the website, and every
 * external address, opens the real address in a new tab (those pages do not exist in the prototype).
 */
export function resolveHref(site: Pick<Site, "key" | "baseUrl" | "listingPath" | "articlePathPattern">, href: string): { href: string; external: boolean } {
  if (!href.startsWith("/")) return { href, external: /^https?:/i.test(href) };
  const articlePrefix = site.articlePathPattern.split("{slug}")[0];
  const isBlogPath = href === site.listingPath || href.startsWith(`${site.listingPath}?`) || (href.startsWith(articlePrefix) && href.length > articlePrefix.length);
  return isBlogPath ? { href: `/sites/${site.key}${href}`, external: false } : { href: `${site.baseUrl}${href}`, external: true };
}

export function Inline({ text, site }: { text: string; site: Site }) {
  return parseInline(text).map((part, i) => {
    if (typeof part === "string") return <Fragment key={i}>{part}</Fragment>;
    if ("strong" in part) return <strong key={i}>{part.strong}</strong>;
    const link = resolveHref(site, part.href);
    return (
      <a key={i} href={link.href} {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {part.text}
      </a>
    );
  });
}

/** Renders the approved article blocks as elements. No HTML from the editor is ever inserted directly. */
export function Blocks({ blocks, site }: { blocks: Block[]; site: Site }) {
  return blocks.map((b, i) => {
    switch (b.type) {
      case "h2":
        return <h2 key={i}>{b.text}</h2>;
      case "h3":
        return <h3 key={i}>{b.text}</h3>;
      case "ul":
      case "ol": {
        const List = b.type;
        return (
          <List key={i}>
            {b.items.map((item, k) => (
              <li key={k}>
                <Inline text={item} site={site} />
              </li>
            ))}
          </List>
        );
      }
      case "quote":
        return (
          <blockquote key={i}>
            <p>
              <Inline text={b.text} site={site} />
            </p>
            {b.cite && <cite>{b.cite}</cite>}
          </blockquote>
        );
      case "callout":
        return (
          <div key={i} className="callout">
            <p className="break-words">
              <Inline text={b.text} site={site} />
            </p>
          </div>
        );
      case "image":
        return (
          <figure key={i}>
            <img src={b.image.url} alt={b.image.alt} width={b.image.width} height={b.image.height} loading="lazy" style={{ maxWidth: Math.min(b.image.width, 1200) }} />
            {b.image.caption && <figcaption>{b.image.caption}</figcaption>}
          </figure>
        );
      default:
        return (
          <p key={i} className={i === 0 ? "lede" : undefined}>
            <Inline text={b.text} site={site} />
          </p>
        );
    }
  });
}
