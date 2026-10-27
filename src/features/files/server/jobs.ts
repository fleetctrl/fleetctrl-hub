import type { Job } from "@/server/cron";
import type { ObjectStorage } from "@/server/storage/s3";
import { collectGarbage } from "./service";

export function filesJobs(storage: ObjectStorage): Job[] {
    return [
        { name: "files-gc", schedule: "30 4 * * *", run: (tx) => collectGarbage(tx, storage) },
    ];
}
