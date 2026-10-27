import type { ComputerRow } from "./schema";

const ms = (value: Date | null) => value?.getTime();
const opt = <T>(value: T | null) => value ?? undefined;

// Response mappers: epoch-ms numbers, and absent fields where Convex returned undefined.

export function toComputerListItem(c: ComputerRow) {
    return {
        id: c.id,
        deviceId: c.id,
        name: c.name,
        rustdeskId: opt(c.rustdeskId),
        ip: opt(c.ip),
        os: opt(c.os),
        osVersion: opt(c.osVersion),
        loginUser: opt(c.loginUser),
        clientVersion: opt(c.clientVersion),
        lastConnection: ms(c.lastConnection),
        intuneId: opt(c.intuneId),
        createdAt: c.createdAt.getTime(),
    };
}

export function toComputerTableRow(c: ComputerRow) {
    return {
        id: c.id,
        deviceId: c.id,
        rustdeskID: opt(c.rustdeskId),
        name: c.name,
        ip: opt(c.ip),
        os: opt(c.os),
        osVersion: opt(c.osVersion),
        loginUser: opt(c.loginUser),
        lastConnection: ms(c.lastConnection),
        clientVersion: opt(c.clientVersion),
        intuneId: opt(c.intuneId),
    };
}

export function toComputerDetail(c: ComputerRow) {
    return {
        id: c.id,
        deviceId: c.id,
        name: c.name,
        rustdeskId: opt(c.rustdeskId),
        ip: opt(c.ip),
        os: opt(c.os),
        osVersion: opt(c.osVersion),
        loginUser: opt(c.loginUser),
        clientVersion: opt(c.clientVersion),
        lastConnection: ms(c.lastConnection),
        lastInventoryAt: ms(c.lastInventoryAt),
        hardware: opt(c.hardware),
        intuneId: opt(c.intuneId),
        createdAt: c.createdAt.getTime(),
    };
}

export type ComputerListItem = ReturnType<typeof toComputerListItem>;
export type ComputerTableRow = ReturnType<typeof toComputerTableRow>;
export type ComputerDetail = ReturnType<typeof toComputerDetail>;
