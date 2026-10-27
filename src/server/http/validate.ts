import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/** zValidator that answers invalid input with the admin API's `{ error }` body. */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(target: Target, schema: Schema) {
    return zValidator(target, schema, (result, c) => {
        if (!result.success) {
            return c.json({ error: result.error.issues.map((issue) => `${issue.path.join(".") || target}: ${issue.message}`).join("; ") }, 400);
        }
    });
}
