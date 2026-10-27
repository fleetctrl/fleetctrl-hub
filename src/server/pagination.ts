import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";

/** Same shape as a Convex `.paginate()` result, so dashboard components keep working unchanged. */
export type PaginationResult<T> = {
    page: T[];
    continueCursor: string;
    isDone: boolean;
};

export const paginationQuerySchema = z.object({
    cursor: z.string().optional(),
    numItems: z.coerce.number().int().positive().max(500),
});

type CursorValue = string | number;

function encodeCursor(sortValue: CursorValue, id: string): string {
    return Buffer.from(JSON.stringify([sortValue, id])).toString("base64url");
}

const cursorSchema = z.tuple([z.union([z.string(), z.number()]), z.string()]);

function decodeCursor(cursor: string): [CursorValue, string] | null {
    try {
        const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export type KeysetQuery = {
    /** Condition that selects rows after the cursor; undefined on the first page. */
    where: SQL | undefined;
    orderBy: SQL[];
    limit: number;
};

/**
 * Keyset pagination on `(sortKey, id)`. `sortKey` must be non-null (wrap nullable columns in
 * coalesce) and `sortValue` must return the same value for a row, as a string or number
 * (timestamps as ISO strings, which round-trip exactly at millisecond precision).
 */
export async function paginate<Row>(args: {
    cursor?: string | null;
    numItems: number;
    desc: boolean;
    sortKey: SQL | AnyColumn;
    idKey: AnyColumn;
    sortValue: (row: Row) => CursorValue;
    idValue: (row: Row) => string;
    query: (keyset: KeysetQuery) => Promise<Row[]>;
}): Promise<PaginationResult<Row>> {
    const after = args.cursor ? decodeCursor(args.cursor) : null;
    const direction = args.desc ? sql`desc` : sql`asc`;
    const where = after
        ? args.desc
            ? sql`(${args.sortKey}, ${args.idKey}) < (${after[0]}, ${after[1]})`
            : sql`(${args.sortKey}, ${args.idKey}) > (${after[0]}, ${after[1]})`
        : undefined;
    const rows = await args.query({
        where,
        orderBy: [sql`${args.sortKey} ${direction}`, sql`${args.idKey} ${direction}`],
        limit: args.numItems + 1,
    });
    const isDone = rows.length <= args.numItems;
    const page = isDone ? rows : rows.slice(0, args.numItems);
    const last = page.at(-1);
    return {
        page,
        continueCursor: last ? encodeCursor(args.sortValue(last), args.idValue(last)) : (args.cursor ?? ""),
        isDone,
    };
}

/** Applies a mapper to every row of a page. */
export function mapPage<Row, Out>(result: PaginationResult<Row>, map: (row: Row) => Out): PaginationResult<Out> {
    return { ...result, page: result.page.map(map) };
}
