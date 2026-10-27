import { z } from "zod";

const trimmedUrl = z.url().transform((value) => value.replace(/\/+$/, ""));

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1),
    // Device API: DPoP proofs bind `htu` to API_URL + pathname, so this must stay identical to v2.
    API_URL: trimmedUrl.optional(),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    BETTER_AUTH_SECRET: z.string().min(1),
    SITE_URL: trimmedUrl,
    NEXT_PUBLIC_SITE_URL: trimmedUrl.optional(),
    ALLOW_REGISTRATION: z.string().optional(),
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().default("fleetctrl-files"),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof envSchema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
    const parsed = envSchema.safeParse(source);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
        throw new Error(`Invalid server environment:\n${issues.join("\n")}`);
    }
    return parsed.data;
}
