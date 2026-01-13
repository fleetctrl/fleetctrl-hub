import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  // public.computers
  computers: defineTable({
    rustdesk_id: v.optional(v.number()),
    name: v.string(),
    ip: v.optional(v.string()),
    last_connection: v.string(), // timestamptz stored as string
    os: v.optional(v.string()),
    os_version: v.optional(v.string()),
    created_at: v.string(), // timestamptz stored as string
    login_user: v.optional(v.string()),
    fingerprint_hash: v.string(),
    jkt: v.string(),
  })
    .index("by_rustdesk_id", ["rustdesk_id"])
    .index("by_fingerprint_hash", ["fingerprint_hash"])
    .index("by_jkt", ["jkt"]),

  // public.enrollment_tokens
  enrollment_tokens: defineTable({
    created_at: v.string(),
    token_hash: v.string(), // PK in Postgres
    remaining_uses: v.int64(),
    disabled: v.boolean(),
    last_used_at: v.optional(v.string()),
    expires_at: v.optional(v.string()),
    name: v.optional(v.string()),
    token_fragment: v.optional(v.string()),
  })
    .index("by_token_hash", ["token_hash"])
    .index("by_name", ["name"]),

  // public.refresh_tokens
  refresh_tokens: defineTable({
    jkt: v.optional(v.string()),
    created_at: v.string(),
    expires_at: v.string(),
    last_used_at: v.optional(v.string()),
    computer_id: v.id("computers"), // FK to computers
    status: v.string(), // enum 'ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED'
    grace_until: v.optional(v.string()),
    token_hash: v.optional(v.string()),
  })
    .index("by_computer_id", ["computer_id"])
    .index("by_token_hash", ["token_hash"])
    .index("by_jkt", ["jkt"]),

  // public.tasks
  tasks: defineTable({
    created_at: v.string(),
    task: v.string(), // enum 'SET_PASSWD', 'SET_NETWORK_STRING'
    status: v.string(), // enum 'PENDING', 'SUCCESS', 'ERROR', 'IN_PROGRESS'
    error: v.optional(v.string()),
    task_data: v.any(), // json
    computer_id: v.optional(v.id("computers")), // FK to computers
    started_at: v.optional(v.string()),
    finish_at: v.optional(v.string()),
  })
    .index("by_computer_id", ["computer_id"]),

  // public.apps
  apps: defineTable({
    display_name: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
    description: v.optional(v.string()),
    publisher: v.string(),
    allow_multiple_versions: v.boolean(),
    auto_update: v.boolean(),
  }),

  // public.releases
  releases: defineTable({
    created_at: v.string(),
    updated_at: v.optional(v.string()),
    version: v.string(),
    installer_type: v.string(), // enum 'winget', 'win32'
    app_id: v.id("apps"), // FK to apps
    disabled_at: v.optional(v.string()),
    uninstall_previous: v.boolean(),
  })
    .index("by_app_id", ["app_id"])
    .index("by_app_id_version", ["app_id", "version"]),

  // public.release_requirements
  release_requirements: defineTable({
    created_at: v.string(),
    updated_at: v.string(),
    release_id: v.id("releases"), // FK to releases
    timeout_seconds: v.int64(),
    run_as_system: v.boolean(),
    storage_path: v.string(),
    hash: v.string(),
    bucket: v.string(),
    byte_size: v.optional(v.int64()),
  })
    .index("by_release_id", ["release_id"]),

  // public.release_scripts
  release_scripts: defineTable({
    created_at: v.string(),
    release_id: v.optional(v.id("releases")), // FK to releases
    phase: v.string(), // enum 'pre', 'post'
    timeout_seconds: v.number(), // integer in PG, number in Convex
    run_as_system: v.boolean(),
    storage_path: v.optional(v.string()),
    engine: v.string(), // enum 'cmd', 'powershell'
    hash: v.string(),
  })
    .index("by_release_id", ["release_id"]),

  // public.win32_releases
  win32_releases: defineTable({
    created_at: v.string(),
    updated_at: v.string(),
    release_id: v.id("releases"), // FK to releases
    install_binary_path: v.string(),
    hash: v.string(),
    install_script: v.string(),
    uninstall_script: v.string(),
    install_binary_size: v.optional(v.int64()),
    install_binary_bucket: v.string(),
  })
    .index("by_release_id", ["release_id"]),

  // public.winget_releases
  winget_releases: defineTable({
    created_at: v.string(),
    updated_at: v.string(),
    release_id: v.id("releases"), // FK to releases
    winget_id: v.string(),
  })
    .index("by_release_id", ["release_id"]),

  // public.detection_rules
  detection_rules: defineTable({
    created_at: v.string(),
    updated_at: v.string(),
    release_id: v.id("releases"), // FK to releases
    config: v.any(), // jsonb
    type: v.string(), // enum 'file', 'registry'
  })
    .index("by_release_id", ["release_id"]),

  // public.computer_groups
  computer_groups: defineTable({
    created_at: v.string(),
    updated_at: v.string(),
    display_name: v.string(),
  })
    .index("by_display_name", ["display_name"]),

  // public.computer_group_members
  computer_group_members: defineTable({
    created_at: v.string(),
    computer_id: v.id("computers"), // FK
    group_id: v.id("computer_groups"), // FK
  })
    .index("by_computer_id", ["computer_id"])
    .index("by_group_id", ["group_id"])
    .index("by_computer_and_group", ["computer_id", "group_id"]),

  // public.computer_group_releases
  computer_group_releases: defineTable({
    created_at: v.string(),
    release_id: v.id("releases"), // FK
    group_id: v.id("computer_groups"), // FK
    assign_type: v.string(), // enum 'include', 'exclude'
    action: v.string(), // enum 'install', 'uninstall'
  })
    .index("by_group_id", ["group_id"])
    .index("by_release_id", ["release_id"])
    .index("by_release_and_group", ["release_id", "group_id"]),

  // public.client_updates
  client_updates: defineTable({
    created_at: v.string(),
    version: v.string(),
    storage_path: v.string(),
    storage_bucket: v.string(),
    hash: v.string(),
    byte_size: v.int64(),
    is_active: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index("by_version", ["version"])
    .index("by_is_active", ["is_active"]),
});
