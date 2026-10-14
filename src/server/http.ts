import "server-only";
import type { Site } from "@/lib/types";
import { StoreUnavailableError, readDb } from "./store";

/** Small helpers shared by the route handlers. */

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * Wraps a public route so a database problem becomes a plain "temporarily unavailable" answer.
 * Nothing about the database (address, name, driver message) is ever included in a response.
 */
export function safely<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof StoreUnavailableError) return json({ error: "unavailable", message: "The content service is temporarily unavailable. Try again shortly." }, 503, { "Retry-After": "30" });
      throw err;
    }
  };
}

export const notFound = (message = "Not found.") => json({ error: "not_found", message }, 404);
export const badRequest = (message: string, fieldErrors: Record<string, string> = {}) => json({ error: "invalid", message, fieldErrors }, 400);

export async function siteByKey(key: string): Promise<Site | undefined> {
  return (await readDb()).sites.find((s) => s.key === key);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * The prototype has no sign-in. As a minimum guard, requests that change data must come from this app's own pages:
 * a browser on another website cannot post to the admin API. Real authentication is required before any hosting.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // scripts and tests on this computer
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export const forbidden = () => json({ error: "forbidden", message: "This request was not sent from the CMS." }, 403);
