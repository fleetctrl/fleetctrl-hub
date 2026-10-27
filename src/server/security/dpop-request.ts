import type { Context } from "hono";

/**
 * The `htu` a DPoP proof must carry for this request: API_URL (which includes the public `/api`
 * prefix that Caddy strips) plus the request path. Without API_URL, the URL the server sees.
 */
export function expectedHtu(c: Context, apiUrl: string | undefined): string {
    const url = new URL(c.req.url);
    if (apiUrl) {
        return `${apiUrl.replace(/\/$/, "")}${url.pathname}`;
    }
    url.search = "";
    url.hash = "";
    return url.href;
}
