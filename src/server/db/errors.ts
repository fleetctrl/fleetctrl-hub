/** SQLSTATE of a Postgres error, also when Drizzle wrapped it (`DrizzleQueryError.cause`). */
export function pgErrorCode(error: unknown): string | undefined {
    if (!(error instanceof Error)) return undefined;
    const source = error.cause instanceof Error ? error.cause : error;
    return "code" in source && typeof source.code === "string" ? source.code : undefined;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
/** Raised instead of 23503 when the violated foreign key is `on delete restrict`. */
export const PG_RESTRICT_VIOLATION = "23001";
export const PG_INVALID_TEXT_REPRESENTATION = "22P02";
