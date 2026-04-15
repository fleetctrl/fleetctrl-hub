import type { DatabaseReader, DatabaseWriter } from "../_generated/server";
import type { Id, TableNames } from "../_generated/dataModel";

type DbWithNormalizeId = Pick<DatabaseReader, "normalizeId"> | Pick<DatabaseWriter, "normalizeId">;

export function maybeNormalizeTableId<TableName extends TableNames>(
    db: DbWithNormalizeId,
    tableName: TableName,
    id: string
): Id<TableName> | null {
    return db.normalizeId(tableName, id);
}

export function normalizeTableId<TableName extends TableNames>(
    db: DbWithNormalizeId,
    tableName: TableName,
    id: string,
    fieldName = `${tableName} ID`
): Id<TableName> {
    const normalizedId = maybeNormalizeTableId(db, tableName, id);
    if (!normalizedId) {
        throw new Error(`Invalid ${fieldName}`);
    }
    return normalizedId;
}
