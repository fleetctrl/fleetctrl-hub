/**
 * Computer Count Aggregate
 *
 * Maintains a denormalized count of computers for efficient `COUNT(*)` queries.
 */

import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "../../_generated/api";

export const computerCountAggregate = new DirectAggregate<{
    Namespace: null;
    Key: string;
    Id: string;
}>(components.computerCountAggregate);
