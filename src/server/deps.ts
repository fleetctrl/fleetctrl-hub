import type { Database } from "@/server/db/client";
import type { EventBus } from "@/server/events";
import type { PubSub } from "@/server/pubsub";
import type { TokenConfig } from "@/server/security/jwt";
import type { ObjectStorage } from "@/server/storage/s3";

export type AuthConfig = {
    secret: string;
    siteUrl: string;
    trustedOrigins: string[];
    allowRegistration: boolean;
};

/** Everything the composition root wires into feature routers and jobs. */
export type AppDeps = {
    db: Database;
    storage: ObjectStorage;
    events: EventBus;
    pubsub: PubSub;
    tokens: TokenConfig;
    auth: AuthConfig;
};
