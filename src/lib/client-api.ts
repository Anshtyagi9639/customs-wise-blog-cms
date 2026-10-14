/** Small fetch wrapper for the admin screens. Always resolves, so callers can show the server's message. */
export type ApiResult<T> = { ok: boolean; status: number; data: T & { message?: string; fieldErrors?: Record<string, string> } };

export async function api<T = Record<string, unknown>>(url: string, method: "GET" | "POST" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ApiResult<T>["data"];
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { message: "The CMS could not be reached. Check that it is still running." } as ApiResult<T>["data"] };
  }
}
