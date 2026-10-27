import { text, timestamp } from "drizzle-orm/pg-core";
import { uuidv7 } from "./id";

/**
 * Column builders shared by every feature schema.
 *
 * Timestamps use millisecond precision (`timestamptz(3)`), so a value survives the round trip
 * through a JS `Date` and the epoch-millisecond numbers in API responses exactly. Clients echo some
 * of them back (e.g. `reinstall_requested_at`) and the server compares them for equality.
 */
export const primaryId = () => text().primaryKey().$defaultFn(() => uuidv7());

export const timestamptz = () => timestamp({ withTimezone: true, precision: 3 });

export const createdAt = () => timestamptz().notNull().defaultNow();
