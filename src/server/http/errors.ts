import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import {
    PG_FOREIGN_KEY_VIOLATION,
    PG_INVALID_TEXT_REPRESENTATION,
    PG_RESTRICT_VIOLATION,
    PG_UNIQUE_VIOLATION,
    pgErrorCode,
} from "@/server/db/errors";

/** An expected failure whose message is safe to show to an admin (Convex mutation errors). */
export class DomainError extends Error {
    constructor(message: string, readonly status: ContentfulStatusCode = 400) {
        super(message);
        this.name = "DomainError";
    }
}

export class NotFoundError extends DomainError {
    constructor(message = "Not found") {
        super(message, 404);
        this.name = "NotFoundError";
    }
}

/** Error handler for the admin API: `{ error }` bodies, domain messages kept, internals hidden. */
export function adminErrorHandler(error: Error, c: Context) {
    if (error instanceof DomainError) {
        return c.json({ error: error.message }, error.status);
    }
    if (error instanceof ZodError) {
        return c.json({ error: error.issues.map((issue) => issue.message).join("; ") }, 400);
    }
    switch (pgErrorCode(error)) {
        case PG_UNIQUE_VIOLATION:
            return c.json({ error: "A record with these values already exists" }, 409);
        case PG_FOREIGN_KEY_VIOLATION:
        case PG_RESTRICT_VIOLATION:
            return c.json({ error: "A referenced record does not exist or is still in use" }, 400);
        case PG_INVALID_TEXT_REPRESENTATION:
            return c.json({ error: "Invalid input" }, 400);
    }
    console.error(`[admin] ${c.req.method} ${c.req.path} failed:`, error);
    return c.json({ error: "Internal Server Error" }, 500);
}
