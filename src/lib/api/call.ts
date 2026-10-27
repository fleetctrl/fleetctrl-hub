import type { ClientResponse } from "hono/client";

/** Failed admin API request; `message` is the server's `{ error }` text. */
export class ApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "ApiError";
    }
}

/** Body of the successful responses of an `hc` call (drops the validators' `400 { error }` variant). */
export type SuccessBody<Response> = Response extends ClientResponse<infer Body, infer Status, infer _Format>
    ? ([Status] extends [400] ? never : Body)
    : never;

function errorMessage(text: string, fallback: string): string {
    try {
        const body: unknown = JSON.parse(text);
        if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
    } catch {
        // not JSON
    }
    return fallback;
}

/**
 * Awaits an `hc` request and returns its JSON, or throws ApiError with the server's message.
 * A 401 means the session ended: the browser goes back to the sign-in page.
 */
export async function call<Response extends ClientResponse<unknown, number, string>>(
    request: Promise<Response>,
): Promise<SuccessBody<Response>> {
    const response = await request;
    if (response.ok) {
        // SAFETY: a 2xx response carries one of the route's success bodies.
        return response.json() as Promise<SuccessBody<Response>>;
    }
    const message = errorMessage(await response.text(), response.statusText || `Request failed (${response.status})`);
    if (response.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/sign-in")) {
        window.location.assign("/sign-in");
    }
    throw new ApiError(message, response.status);
}
