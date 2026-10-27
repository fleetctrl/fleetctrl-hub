import type { Database } from "@/server/db/client";

/**
 * In-process domain events. Handlers run synchronously inside the emitter's transaction, so an
 * event and its consequences commit or roll back together (Convex single-mutation semantics).
 * Lets a lower feature notify a higher one without importing it.
 */
export interface DomainEvents {
    /** A computer field that dynamic group rules read changed (name, ip, os, login user, ...). */
    "computer.ruleFieldsChanged": { computerId: string };
}

type EventName = keyof DomainEvents;
type Handler<Name extends EventName> = (tx: Database, payload: DomainEvents[Name]) => Promise<void>;

export class EventBus {
    readonly #handlers = new Map<EventName, Handler<EventName>[]>();

    on<Name extends EventName>(name: Name, handler: Handler<Name>): void {
        const handlers = this.#handlers.get(name) ?? [];
        // SAFETY: handlers are stored per event name and only invoked with that event's payload.
        handlers.push(handler as Handler<EventName>);
        this.#handlers.set(name, handlers);
    }

    async emit<Name extends EventName>(tx: Database, name: Name, payload: DomainEvents[Name]): Promise<void> {
        for (const handler of this.#handlers.get(name) ?? []) {
            await handler(tx, payload);
        }
    }
}

/** Emitting side of the bus, which is all that services need. */
export type EventEmitter = Pick<EventBus, "emit">;
