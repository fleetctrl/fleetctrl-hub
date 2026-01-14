import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    // ========================================
    // CORE TABLES
    // ========================================

    computers: defineTable({
        name: v.string(),
        fingerprint_hash: v.optional(v.string()),
        jkt: v.optional(v.string()),
        rustdesk_id: v.optional(v.number()),
        ip: v.optional(v.string()),
        os: v.optional(v.string()),
        os_version: v.optional(v.string()),
        login_user: v.optional(v.string()),
        client_version: v.optional(v.string()),
        last_connection: v.optional(v.number()),
        intune_id: v.optional(v.string()),
    })
        .index("by_fingerprint_hash", ["fingerprint_hash"])
        .index("by_jkt", ["jkt"])
        .index("by_rustdesk_id", ["rustdesk_id"]),

    // ========================================
    // AUTH TABLES
    // ========================================

    enrollment_tokens: defineTable({
        token_hash: v.string(),
        name: v.optional(v.string()),
        token_fragment: v.optional(v.string()),
        remaining_uses: v.number(), // -1 = unlimited
        disabled: v.boolean(),
        expires_at: v.optional(v.number()),
        last_used_at: v.optional(v.number()),
    })
        .index("by_token_hash", ["token_hash"])
        .index("by_name", ["name"]),

    refresh_tokens: defineTable({
        computer_id: v.id("computers"),
        token_hash: v.string(),
        jkt: v.string(),
        status: v.union(
            v.literal("ACTIVE"),
            v.literal("ROTATED"),
            v.literal("REVOKED"),
            v.literal("EXPIRED")
        ),
        expires_at: v.number(),
        grace_until: v.optional(v.number()),
        last_used_at: v.optional(v.number()),
    })
        .index("by_token_hash", ["token_hash"])
        .index("by_computer_id", ["computer_id"])
        .index("by_status", ["status"]),

    // Anti-replay store (replacement for Redis)
    used_jtis: defineTable({
        jti: v.string(),
    }).index("by_jti", ["jti"]),

    // ========================================
    // TASKS
    // ========================================

    tasks: defineTable({
        computer_id: v.id("computers"),
        task_type: v.union(
            v.literal("SET_PASSWD"),
            v.literal("SET_NETWORK_STRING")
        ),
        status: v.union(
            v.literal("PENDING"),
            v.literal("IN_PROGRESS"),
            v.literal("SUCCESS"),
            v.literal("ERROR")
        ),
        task_data: v.optional(v.any()),
        error: v.optional(v.string()),
        started_at: v.optional(v.number()),
        finish_at: v.optional(v.number()),
    })
        .index("by_computer_id", ["computer_id"])
        .index("by_computer_status", ["computer_id", "status"]),

    // ========================================
    // GROUPS (Static)
    // ========================================

    computer_groups: defineTable({
        display_name: v.string(),
        description: v.optional(v.string()),
    }).index("by_display_name", ["display_name"]),

    computer_group_members: defineTable({
        group_id: v.id("computer_groups"),
        computer_id: v.id("computers"),
    })
        .index("by_group_id", ["group_id"])
        .index("by_computer_id", ["computer_id"])
        .index("by_group_computer", ["group_id", "computer_id"]),

    // ========================================
    // GROUPS (Dynamic)
    // ========================================

    dynamic_computer_groups: defineTable({
        display_name: v.string(),
        description: v.optional(v.string()),
        rule_expression: v.any(), // JSONB equivalent - nested rule structure
        last_evaluated_at: v.optional(v.number()),
    }).index("by_display_name", ["display_name"]),

    dynamic_group_members: defineTable({
        group_id: v.id("dynamic_computer_groups"),
        computer_id: v.id("computers"),
        added_at: v.number(),
    })
        .index("by_group_id", ["group_id"])
        .index("by_computer_id", ["computer_id"])
        .index("by_group_computer", ["group_id", "computer_id"]),

    // ========================================
    // APPS
    // ========================================

    apps: defineTable({
        display_name: v.string(),
        description: v.optional(v.string()),
        publisher: v.string(),
        allow_multiple_versions: v.boolean(),
        auto_update: v.boolean(),
    }).index("by_display_name", ["display_name"]),

    releases: defineTable({
        app_id: v.id("apps"),
        version: v.string(),
        installer_type: v.union(v.literal("winget"), v.literal("win32")),
        disabled_at: v.optional(v.number()),
        uninstall_previous: v.boolean(),
    })
        .index("by_app_id", ["app_id"])
        .index("by_app_version", ["app_id", "version"]),

    win32_releases: defineTable({
        release_id: v.id("releases"),
        install_binary_storage_id: v.id("_storage"),
        hash: v.string(),
        install_script: v.string(),
        uninstall_script: v.string(),
        install_binary_size: v.optional(v.number()),
    }).index("by_release_id", ["release_id"]),

    winget_releases: defineTable({
        release_id: v.id("releases"),
        winget_id: v.string(),
    }).index("by_release_id", ["release_id"]),

    detection_rules: defineTable({
        release_id: v.id("releases"),
        type: v.union(v.literal("file"), v.literal("registry")),
        config: v.any(),
    }).index("by_release_id", ["release_id"]),

    release_requirements: defineTable({
        release_id: v.id("releases"),
        timeout_seconds: v.number(),
        run_as_system: v.boolean(),
        storage_id: v.id("_storage"),
        hash: v.string(),
        byte_size: v.optional(v.number()),
    }).index("by_release_id", ["release_id"]),

    release_scripts: defineTable({
        release_id: v.id("releases"),
        phase: v.union(v.literal("pre"), v.literal("post")),
        engine: v.union(v.literal("cmd"), v.literal("powershell")),
        timeout_seconds: v.number(),
        run_as_system: v.boolean(),
        storage_id: v.optional(v.id("_storage")),
        hash: v.string(),
    }).index("by_release_id", ["release_id"]),

    // ========================================
    // RELEASE ASSIGNMENTS
    // ========================================

    // Static group → Release assignment
    computer_group_releases: defineTable({
        release_id: v.id("releases"),
        group_id: v.id("computer_groups"),
        assign_type: v.union(v.literal("include"), v.literal("exclude")),
        action: v.union(v.literal("install"), v.literal("uninstall")),
    })
        .index("by_group_id", ["group_id"])
        .index("by_release_id", ["release_id"])
        .index("by_release_group", ["release_id", "group_id"]),

    // Dynamic group → Release assignment
    dynamic_group_releases: defineTable({
        release_id: v.id("releases"),
        group_id: v.id("dynamic_computer_groups"),
        assign_type: v.union(v.literal("include"), v.literal("exclude")),
        action: v.union(v.literal("install"), v.literal("uninstall")),
    })
        .index("by_group_id", ["group_id"])
        .index("by_release_id", ["release_id"]),

    // ========================================
    // CLIENT UPDATES
    // ========================================

    client_updates: defineTable({
        version: v.string(),
        storage_id: v.id("_storage"),
        hash: v.string(),
        byte_size: v.number(),
        is_active: v.boolean(),
        notes: v.optional(v.string()),
    })
        .index("by_version", ["version"])
        .index("by_is_active", ["is_active"]),
});
