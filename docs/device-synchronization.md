# Device synchronization

Deploy the Hub (including the Convex schema/functions) before deploying the updated Windows client. No data backfill is needed: new inventory fields are optional. Old clients can continue using `PATCH /computer/rustdesk-sync`, which still refreshes presence.

New clients send these requests on startup and then independently:

| Endpoint | Interval | Effect |
| --- | --- | --- |
| `POST /computer/heartbeat` | 1 minute | Updates only `last_connection` using server time; no request body required. |
| `PATCH /computer/hardware-sync` | 1 hour | Updates device inventory and `last_inventory_at`, leaving presence unchanged. |

Both routes use the existing bearer token + DPoP authentication. Device identity comes from the verified token, never from the request body. Manual client device/full synchronization also refreshes inventory. The UI marks devices offline after five minutes without a check-in and reevaluates presence every 30 seconds.

Inventory includes the existing device fields and an optional `hardware` object:

```json
{
  "hardware": {
    "cpu_name": "Example CPU",
    "cpu_cores": 4,
    "cpu_logical_processors": 8,
    "ram_bytes": 17179869184,
    "system_drive": "C:",
    "system_drive_total_bytes": 549755813888,
    "system_drive_free_bytes": 137438953472
  }
}
```

Counts and capacities are nonnegative integers (CPU counts, RAM and drive capacity must be positive). Free space may be zero and cannot exceed capacity. Malformed inventory returns HTTP 400. Omitting hardware preserves previously collected values. The detail page displays capacities in GiB and the inventory timestamp separately from the last check-in.

Validation: `pnpm test:sync`, `pnpm exec tsc --noEmit`, and `pnpm lint`.
