import assert from "node:assert/strict";
import test from "node:test";
import { versionSortKey } from "./tableKeys.ts";

test("sorts arbitrary numeric version components", () => {
    assert(versionSortKey("1.2.3.4") > versionSortKey("1.2.3"));
    assert(versionSortKey("1.2.3.4.1") > versionSortKey("1.2.3.4"));
    assert(versionSortKey("1.2.3.10") > versionSortKey("1.2.3.4"));
});
