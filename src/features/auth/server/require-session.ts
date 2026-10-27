import { createMiddleware } from "hono/factory";
import type { Auth } from "./auth";

export type SessionEnv = {
    Variables: {
        userId: string;
    };
};

/** Guards the admin API: requests need a valid Better Auth session cookie. */
export function requireSession(auth: Auth) {
    return createMiddleware<SessionEnv>(async (c, next) => {
        const session = await auth.api.getSession({ headers: c.req.raw.headers });
        if (!session) {
            return c.json({ error: "You must be logged in to perform this action" }, 401);
        }
        c.set("userId", session.user.id);
        await next();
    });
}
