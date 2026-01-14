Plán Migrace: Supabase + Go → Convex
Komplexní migrační plán pro FleetCtrl Hub z aktuální architektury (PostgreSQL/Supabase + Go API + tRPC) na Convex.

Přehled Aktuálního Stavu
Komponenty k Migraci
Komponenta	Aktuální Tech	Soubory	Složitost
Databáze	PostgreSQL/Supabase	19 migrací	Střední
Client API	Go HTTP Server	13 souborů	Vysoká (DPoP)
Admin API	tRPC	8 routerů	Střední
Storage	Supabase Storage	Buckety: internal	Nízká
Cache	Redis	JTI anti-replay	Střední
Realtime	Supabase Realtime	3 publikace	Automatická
API Endpointy k Migraci
Go API (DPoP Protected)
POST /enroll
POST /token/refresh
POST /token/recover
GET /enroll/:hash/is-enrolled
PATCH /computer/rustdesk-sync
GET /tasks
PATCH /task/:id
GET /apps/assigned
GET /apps/download/:releaseID
GET /apps/requirement/download/:requirementID
GET /client/version
GET /client/download/:versionID
POST /internal/cache/invalidate
User Review Required
NOTE

Rozhodnutí přijata:

Admin Authentication: Clerk (nativní Convex integrace)
Rollback Strategy: Není potřeba (aplikace není v produkci)
Migrace dat: Není potřeba (aplikace není v produkci)
WARNING

Breaking Change: Client API URL Pokud se změní URL API serveru, všechny enrollované počítače budou muset být re-enrollovány nebo musí podporovat nové URL.

Fáze 1: Inicializace a Schéma
1.1 Instalace Convex
cd /home/vojta/code/fleetctrl-hub
npm install convex
npx convex dev  # Inicializace
1.2 Schéma Databáze
[NEW] 
schema.ts
Přepis všech SQL tabulek do Convex schématu:

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
  })
    .index("by_jti", ["jti"]),
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
  // GROUPS
  // ========================================
  
  computer_groups: defineTable({
    display_name: v.string(),
    description: v.optional(v.string()),
  })
    .index("by_display_name", ["display_name"]),
  computer_group_members: defineTable({
    group_id: v.id("computer_groups"),
    computer_id: v.id("computers"),
  })
    .index("by_group_id", ["group_id"])
    .index("by_computer_id", ["computer_id"])
    .index("by_group_computer", ["group_id", "computer_id"]),
  dynamic_computer_groups: defineTable({
    display_name: v.string(),
    description: v.optional(v.string()),
    rule_expression: v.any(), // JSONB equivalent
    last_evaluated_at: v.optional(v.number()),
  })
    .index("by_display_name", ["display_name"]),
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
  })
    .index("by_display_name", ["display_name"]),
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
  })
    .index("by_release_id", ["release_id"]),
  winget_releases: defineTable({
    release_id: v.id("releases"),
    winget_id: v.string(),
  })
    .index("by_release_id", ["release_id"]),
  detection_rules: defineTable({
    release_id: v.id("releases"),
    type: v.union(v.literal("file"), v.literal("registry")),
    config: v.any(),
  })
    .index("by_release_id", ["release_id"]),
  release_requirements: defineTable({
    release_id: v.id("releases"),
    timeout_seconds: v.number(),
    run_as_system: v.boolean(),
    storage_id: v.id("_storage"),
    hash: v.string(),
    byte_size: v.optional(v.number()),
  })
    .index("by_release_id", ["release_id"]),
  release_scripts: defineTable({
    release_id: v.id("releases"),
    phase: v.union(v.literal("pre"), v.literal("post")),
    engine: v.union(v.literal("cmd"), v.literal("powershell")),
    timeout_seconds: v.number(),
    run_as_system: v.boolean(),
    storage_id: v.optional(v.id("_storage")),
    hash: v.string(),
  })
    .index("by_release_id", ["release_id"]),
  // Group → Release assignment
  computer_group_releases: defineTable({
    release_id: v.id("releases"),
    group_id: v.id("computer_groups"),
    assign_type: v.union(v.literal("include"), v.literal("exclude")),
    action: v.union(v.literal("install"), v.literal("uninstall")),
  })
    .index("by_group_id", ["group_id"])
    .index("by_release_id", ["release_id"])
    .index("by_release_group", ["release_id", "group_id"]),
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
Fáze 2: Auth & DPoP Implementation
Tato fáze je kritická pro zachování bezpečnosti a zpětné kompatibility s klienty.

2.1 DPoP Validace Library
[NEW] 
dpop.ts
import { SignJWT, importJWK, jwtVerify, createLocalJWKSet } from "jose";
import type { JWK } from "jose";
export interface DPoPClaims {
  htu: string;
  htm: string;
  iat: number;
  jti: string;
  ath?: string;
}
export interface DPoPResult {
  jwk: JWK;
  jkt: string;
  method: string;
  url: string;
  jti: string;
  issuedAt: Date;
  ath?: string;
}
/**
 * Validates a DPoP proof token.
 * Implements RFC 9449 DPoP validation.
 */
export async function verifyDPoP(
  dpopHeader: string,
  expectedMethod: string,
  expectedUrl: string
): Promise<DPoPResult> {
  // 1. Decode header without verification to extract JWK
  const [headerB64] = dpopHeader.split(".");
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
  
  // 2. Validate header requirements
  if (header.typ !== "dpop+jwt") {
    throw new Error("Invalid DPoP typ");
  }
  
  // 3. Reject symmetric algorithms
  if (header.alg.startsWith("HS")) {
    throw new Error("DPoP alg not allowed");
  }
  
  // 4. Extract and validate JWK
  const jwk = header.jwk as JWK;
  if (!jwk) {
    throw new Error("Missing DPoP jwk");
  }
  
  // Reject symmetric key types
  if (jwk.kty === "oct") {
    throw new Error("Invalid DPoP key type");
  }
  
  // 5. Import public key and verify signature
  const publicKey = await importJWK(jwk, header.alg);
  const { payload } = await jwtVerify(dpopHeader, publicKey, {
    typ: "dpop+jwt",
  });
  
  const claims = payload as unknown as DPoPClaims;
  
  // 6. Validate claims
  const now = Date.now();
  const iat = claims.iat * 1000;
  const clockSkew = 2 * 60 * 1000; // 2 minutes
  const maxAge = 15 * 60 * 1000; // 15 minutes
  
  if (iat > now + clockSkew) {
    throw new Error("DPoP proof from the future");
  }
  
  if (now - iat > maxAge) {
    throw new Error("Stale DPoP proof");
  }
  
  // 7. Validate method and URL binding
  if (claims.htm.toUpperCase() !== expectedMethod.toUpperCase()) {
    throw new Error("htm mismatch");
  }
  
  if (claims.htu !== expectedUrl) {
    throw new Error("htu mismatch");
  }
  
  // 8. Compute JKT (JWK Thumbprint)
  const jkt = await computeJKT(jwk);
  
  return {
    jwk,
    jkt,
    method: claims.htm,
    url: claims.htu,
    jti: claims.jti,
    issuedAt: new Date(iat),
    ath: claims.ath,
  };
}
/**
 * Computes RFC 7638 JWK Thumbprint (SHA-256, base64url encoded)
 */
export async function computeJKT(jwk: JWK): Promise<string> {
  // Extract required members based on key type
  let thumbprintInput: Record<string, string>;
  
  switch (jwk.kty) {
    case "RSA":
      thumbprintInput = { e: jwk.e!, kty: jwk.kty, n: jwk.n! };
      break;
    case "EC":
      thumbprintInput = { crv: jwk.crv!, kty: jwk.kty, x: jwk.x!, y: jwk.y! };
      break;
    case "OKP":
      thumbprintInput = { crv: jwk.crv!, kty: jwk.kty, x: jwk.x! };
      break;
    default:
      throw new Error(`Unsupported key type: ${jwk.kty}`);
  }
  
  // Lexicographically sorted JSON
  const sorted = JSON.stringify(thumbprintInput, Object.keys(thumbprintInput).sort());
  
  // SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(sorted);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  
  // Base64url encode
  return Buffer.from(hashBuffer).toString("base64url");
}
/**
 * Validates ATH (Access Token Hash) in DPoP proof
 */
export async function verifyATH(accessToken: string, expectedATH: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(accessToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const ath = Buffer.from(hashBuffer).toString("base64url");
  return ath === expectedATH;
}
2.2 JWT Token Service
[NEW] 
jwt.ts
import { SignJWT, jwtVerify } from "jose";
const JWT_SECRET = process.env.JWT_SECRET!;
const API_URL = process.env.API_URL!;
const ACCESS_TOKEN_TTL = 900; // 15 minutes
const REFRESH_TOKEN_TTL = 2592000; // 30 days
export interface TokenPayload {
  sub: string;
  cnf?: { jkt: string };
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
/**
 * Issues a new access token bound to a JWK Thumbprint
 */
export async function issueAccessToken(
  subject: string,
  jkt: string
): Promise<{ token: string; expiresAt: number }> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ACCESS_TOKEN_TTL;
  
  const token = await new SignJWT({
    cnf: { jkt },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(expiresAt)
    .setIssuer(API_URL)
    .setAudience(API_URL)
    .setSubject(subject)
    .sign(secret);
  
  return { token, expiresAt };
}
/**
 * Verifies an access token and returns the payload
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
    issuer: API_URL,
    audience: API_URL,
  });
  
  return payload as unknown as TokenPayload;
}
/**
 * Generates a cryptographically secure random refresh token
 */
export function generateRefreshToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
/**
 * Computes SHA-256 hash of a token for storage
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hashBuffer).toString("base64url");
}
export function getRefreshTokenExpiry(): number {
  return Date.now() + REFRESH_TOKEN_TTL * 1000;
}
export function getAccessTokenTTL(): number {
  return ACCESS_TOKEN_TTL;
}
2.3 Anti-Replay (JTI Store)
[NEW] 
jtiStore.ts
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
/**
 * Checks if JTI has been used and stores it for replay prevention.
 * Throws error if JTI already exists.
 */
export const checkAndStoreJTI = mutation({
  args: { jti: v.string() },
  handler: async (ctx, { jti }) => {
    // Check if JTI already exists
    const existing = await ctx.db
      .query("used_jtis")
      .withIndex("by_jti", (q) => q.eq("jti", jti))
      .first();
    
    if (existing) {
      throw new Error("Replayed DPoP proof");
    }
    
    // Store JTI
    await ctx.db.insert("used_jtis", { jti });
    return true;
  },
});
/**
 * Cleanup stale JTIs older than 15 minutes.
 * Should be run every hour via cron.
 */
export const cleanupStaleJTIs = internalMutation({
  handler: async (ctx) => {
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
    
    // Batch delete stale JTIs
    let deleted = 0;
    while (true) {
      const stale = await ctx.db
        .query("used_jtis")
        .filter((q) => q.lt(q.field("_creationTime"), fifteenMinAgo))
        .take(100);
      
      if (stale.length === 0) break;
      
      for (const doc of stale) {
        await ctx.db.delete(doc._id);
        deleted++;
      }
    }
    
    console.log(`Cleaned up ${deleted} stale JTIs`);
    return { deleted };
  },
});
2.4 Scheduled Jobs (Crons)
[NEW] 
crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
// Cleanup stale JTIs every hour
crons.interval(
  "cleanup stale JTIs",
  { hours: 1 },
  internal.lib.jtiStore.cleanupStaleJTIs
);
// Cleanup expired refresh tokens daily
crons.daily(
  "cleanup expired refresh tokens",
  { hourUTC: 3, minuteUTC: 0 },
  internal.auth.cleanupExpiredTokens
);
// Refresh dynamic group memberships every 15 minutes
crons.interval(
  "refresh dynamic groups",
  { minutes: 15 },
  internal.groups.refreshAllDynamicGroups
);
export default crons;
Fáze 3: HTTP Actions (API Compatibility Layer)
3.1 HTTP Router Setup
[NEW] 
http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { verifyDPoP, computeJKT } from "./lib/dpop";
import { verifyAccessToken, hashToken } from "./lib/jwt";
const http = httpRouter();
// ========================================
// CORS Headers
// ========================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, DPoP, Content-Type, X-Client-Version, enrollment-token",
};
// CORS Preflight
http.route({
  path: "/.+",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});
// ========================================
// Helper: DPoP Protected Handler Wrapper
// ========================================
type ProtectedHandler = (
  ctx: any,
  request: Request,
  computerId: string
) => Promise<Response>;
function withDPoP(handler: ProtectedHandler) {
  return httpAction(async (ctx, request: Request) => {
    try {
      // 1. Extract headers
      const dpopHeader = request.headers.get("DPoP");
      const authHeader = request.headers.get("Authorization");
      
      if (!dpopHeader) {
        return errorResponse(401, "Missing DPoP header");
      }
      
      if (!authHeader?.startsWith("Bearer ")) {
        return errorResponse(401, "Missing bearer token");
      }
      
      const accessToken = authHeader.slice(7);
      const url = new URL(request.url);
      const expectedUrl = `${url.origin}${url.pathname}`;
      
      // 2. Verify DPoP proof
      const dpopResult = await verifyDPoP(
        dpopHeader,
        request.method,
        expectedUrl
      );
      
      // 3. Check JTI for replay
      try {
        await ctx.runMutation(api.lib.jtiStore.checkAndStoreJTI, {
          jti: dpopResult.jti,
        });
      } catch (e) {
        return errorResponse(401, "Replayed DPoP proof");
      }
      
      // 4. Verify access token
      const tokenPayload = await verifyAccessToken(accessToken);
      
      // 5. Verify JKT binding
      if (tokenPayload.cnf?.jkt !== dpopResult.jkt) {
        return errorResponse(401, "JKT mismatch");
      }
      
      // 6. Verify ATH if present
      if (dpopResult.ath) {
        const encoder = new TextEncoder();
        const data = encoder.encode(accessToken);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const expectedAth = Buffer.from(hashBuffer).toString("base64url");
        
        if (dpopResult.ath !== expectedAth) {
          return errorResponse(401, "ATH mismatch");
        }
      }
      
      // 7. Extract computer ID from subject
      const sub = tokenPayload.sub;
      if (!sub.startsWith("device:")) {
        return errorResponse(401, "Invalid token subject");
      }
      const computerId = sub.slice(7);
      
      // 8. Update client version if provided
      const clientVersion = request.headers.get("X-Client-Version");
      if (clientVersion) {
        await ctx.runMutation(internal.computers.updateClientVersion, {
          computerId,
          clientVersion,
        });
      }
      
      // Call the actual handler
      return await handler(ctx, request, computerId);
      
    } catch (error: any) {
      console.error("DPoP validation error:", error);
      return errorResponse(401, error.message || "Authentication failed");
    }
  });
}
function errorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status, 
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      } 
    }
  );
}
function jsonResponse(data: any, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    { 
      status, 
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      } 
    }
  );
}
// ========================================
// AUTH ENDPOINTS
// ========================================
// POST /enroll
http.route({
  path: "/enroll",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const enrollmentToken = request.headers.get("enrollment-token");
      if (!enrollmentToken) {
        return errorResponse(400, "Missing enrollment-token");
      }
      
      const body = await request.json();
      const { name, fingerprint_hash, jkt } = body;
      
      if (!name || !fingerprint_hash || !jkt) {
        return errorResponse(400, "Missing required fields");
      }
      
      const result = await ctx.runAction(api.auth.enroll, {
        enrollmentToken,
        name,
        fingerprintHash: fingerprint_hash,
        jkt,
      });
      
      return jsonResponse({ tokens: result }, 201);
      
    } catch (error: any) {
      return errorResponse(400, error.message);
    }
  }),
});
// POST /token/refresh
http.route({
  path: "/token/refresh",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { refresh_token } = body;
      
      if (!refresh_token) {
        return errorResponse(400, "Missing refresh_token");
      }
      
      const result = await ctx.runAction(api.auth.refreshTokens, {
        refreshToken: refresh_token,
      });
      
      return jsonResponse({ tokens: result });
      
    } catch (error: any) {
      return errorResponse(401, error.message);
    }
  }),
});
// POST /token/recover
http.route({
  path: "/token/recover",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const dpopHeader = request.headers.get("DPoP");
      if (!dpopHeader) {
        return errorResponse(401, "Missing DPoP header");
      }
      
      const url = new URL(request.url);
      const expectedUrl = `${url.origin}${url.pathname}`;
      
      const dpopResult = await verifyDPoP(
        dpopHeader,
        request.method,
        expectedUrl
      );
      
      // Check JTI
      await ctx.runMutation(api.lib.jtiStore.checkAndStoreJTI, {
        jti: dpopResult.jti,
      });
      
      const result = await ctx.runAction(api.auth.recover, {
        jkt: dpopResult.jkt,
      });
      
      return jsonResponse({ tokens: result });
      
    } catch (error: any) {
      return errorResponse(401, error.message);
    }
  }),
});
// GET /enroll/:fingerprintHash/is-enrolled
http.route({
  path: "/enroll/:fingerprintHash/is-enrolled",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const fingerprintHash = url.pathname.split("/")[2];
    
    const result = await ctx.runQuery(api.auth.isEnrolled, {
      fingerprintHash,
    });
    
    if (result) {
      return jsonResponse({ is_enrolled: true });
    }
    return jsonResponse({ is_enrolled: false }, 404);
  }),
});
// ========================================
// TASKS ENDPOINTS
// ========================================
// GET /tasks
http.route({
  path: "/tasks",
  method: "GET",
  handler: withDPoP(async (ctx, request, computerId) => {
    const tasks = await ctx.runQuery(api.tasks.getPending, { computerId });
    return jsonResponse({ tasks });
  }),
});
// PATCH /task/:id
http.route({
  path: "/task/:id",
  method: "PATCH",
  handler: withDPoP(async (ctx, request, computerId) => {
    const url = new URL(request.url);
    const taskId = url.pathname.split("/")[2];
    const body = await request.json();
    
    await ctx.runMutation(api.tasks.updateStatus, {
      taskId,
      computerId,
      status: body.status,
      error: body.error,
    });
    
    return jsonResponse({ status: "ok" });
  }),
});
// ========================================
// APPS ENDPOINTS
// ========================================
// GET /apps/assigned
http.route({
  path: "/apps/assigned",
  method: "GET",
  handler: withDPoP(async (ctx, request, computerId) => {
    const apps = await ctx.runQuery(api.apps.getAssigned, { computerId });
    return jsonResponse({ apps });
  }),
});
// GET /apps/download/:releaseID
http.route({
  path: "/apps/download/:releaseID",
  method: "GET",
  handler: withDPoP(async (ctx, request, computerId) => {
    const url = new URL(request.url);
    const releaseId = url.pathname.split("/")[3];
    
    const downloadUrl = await ctx.runAction(api.apps.getDownloadUrl, {
      computerId,
      releaseId,
    });
    
    if (!downloadUrl) {
      return errorResponse(404, "Release not found or access denied");
    }
    
    return Response.redirect(downloadUrl, 307);
  }),
});
// GET /apps/requirement/download/:requirementID
http.route({
  path: "/apps/requirement/download/:requirementID",
  method: "GET",
  handler: withDPoP(async (ctx, request, computerId) => {
    const url = new URL(request.url);
    const requirementId = url.pathname.split("/")[4];
    
    const downloadUrl = await ctx.runAction(api.apps.getRequirementDownloadUrl, {
      computerId,
      requirementId,
    });
    
    if (!downloadUrl) {
      return errorResponse(404, "Requirement not found or access denied");
    }
    
    return Response.redirect(downloadUrl, 307);
  }),
});
// ========================================
// CLIENT UPDATES ENDPOINTS
// ========================================
// GET /client/version
http.route({
  path: "/client/version",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const version = await ctx.runQuery(api.client.getActiveVersion, {});
    return jsonResponse(version || { version: null });
  }),
});
// GET /client/download/:versionID
http.route({
  path: "/client/download/:versionID",
  method: "GET",
  handler: withDPoP(async (ctx, request, computerId) => {
    const url = new URL(request.url);
    const versionId = url.pathname.split("/")[3];
    
    const downloadUrl = await ctx.runAction(api.client.getDownloadUrl, {
      versionId,
    });
    
    if (!downloadUrl) {
      return errorResponse(404, "Version not found");
    }
    
    return Response.redirect(downloadUrl, 307);
  }),
});
// ========================================
// OTHER ENDPOINTS
// ========================================
// GET /health
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return jsonResponse({ status: "ok" });
  }),
});
export default http;
Fáze 4: Business Logic (Mutations/Queries)
4.1 Auth Module
[NEW] 
auth.ts
import { action, mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { 
  issueAccessToken, 
  generateRefreshToken, 
  hashToken, 
  getRefreshTokenExpiry,
  getAccessTokenTTL 
} from "./lib/jwt";
// Check if computer is enrolled
export const isEnrolled = query({
  args: { fingerprintHash: v.string() },
  handler: async (ctx, { fingerprintHash }) => {
    const computer = await ctx.db
      .query("computers")
      .withIndex("by_fingerprint_hash", (q) => q.eq("fingerprint_hash", fingerprintHash))
      .first();
    
    return computer !== null;
  },
});
// Enroll a new computer
export const enroll = action({
  args: {
    enrollmentToken: v.string(),
    name: v.string(),
    fingerprintHash: v.string(),
    jkt: v.string(),
  },
  handler: async (ctx, { enrollmentToken, name, fingerprintHash, jkt }) => {
    // 1. Validate enrollment token
    const tokenHash = await hashToken(enrollmentToken);
    
    const token = await ctx.runQuery(internal.auth.getEnrollmentTokenByHash, { tokenHash });
    
    if (!token) {
      throw new Error("Invalid enrollment token");
    }
    
    if (token.disabled) {
      throw new Error("Enrollment token is disabled");
    }
    
    if (token.remaining_uses === 0) {
      throw new Error("Enrollment token has no remaining uses");
    }
    
    if (token.expires_at && token.expires_at < Date.now()) {
      throw new Error("Enrollment token has expired");
    }
    
    // 2. Use token (decrement if not unlimited)
    if (token.remaining_uses !== -1) {
      await ctx.runMutation(internal.auth.decrementTokenUses, { 
        tokenId: token._id 
      });
    }
    
    // 3. Check if computer already exists
    let computerId: string;
    const existing = await ctx.runQuery(internal.computers.getByFingerprintHash, { 
      fingerprintHash 
    });
    
    if (existing) {
      // Update existing computer
      await ctx.runMutation(internal.computers.updateJkt, {
        computerId: existing._id,
        jkt,
        name,
      });
      computerId = existing._id;
    } else {
      // Create new computer
      computerId = await ctx.runMutation(internal.computers.create, {
        name,
        fingerprintHash,
        jkt,
      });
    }
    
    // 4. Issue tokens
    const subject = `device:${computerId}`;
    const { token: accessToken, expiresAt } = await issueAccessToken(subject, jkt);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await hashToken(refreshToken);
    
    await ctx.runMutation(internal.auth.createRefreshToken, {
      computerId,
      tokenHash: refreshTokenHash,
      jkt,
      expiresAt: getRefreshTokenExpiry(),
    });
    
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: getAccessTokenTTL(),
    };
  },
});
// Refresh tokens
export const refreshTokens = action({
  args: { refreshToken: v.string() },
  handler: async (ctx, { refreshToken }) => {
    const tokenHash = await hashToken(refreshToken);
    
    // 1. Find refresh token
    const rt = await ctx.runQuery(internal.auth.getRefreshTokenByHash, { tokenHash });
    
    if (!rt) {
      throw new Error("Invalid refresh token");
    }
    
    const now = Date.now();
    const graceTTL = 2 * 60 * 1000; // 2 minutes
    
    // 2. Validate status
    if (rt.status === "ACTIVE") {
      if (rt.expires_at < now) {
        throw new Error("Refresh token expired");
      }
      
      // Rotate token
      await ctx.runMutation(internal.auth.rotateRefreshToken, {
        tokenId: rt._id,
        graceUntil: now + graceTTL,
      });
    } else {
      // Check grace period
      if (!rt.grace_until || now > rt.grace_until) {
        throw new Error("Refresh token not in grace period");
      }
      
      if (rt.last_used_at) {
        throw new Error("Refresh token grace already used");
      }
      
      // Mark grace usage
      await ctx.runMutation(internal.auth.markGraceUsage, { tokenId: rt._id });
    }
    
    // 3. Issue new tokens
    const subject = `device:${rt.computer_id}`;
    const { token: accessToken } = await issueAccessToken(subject, rt.jkt);
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = await hashToken(newRefreshToken);
    
    await ctx.runMutation(internal.auth.createRefreshToken, {
      computerId: rt.computer_id,
      tokenHash: newRefreshTokenHash,
      jkt: rt.jkt,
      expiresAt: getRefreshTokenExpiry(),
    });
    
    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_in: getAccessTokenTTL(),
    };
  },
});
// Recover tokens using DPoP proof
export const recover = action({
  args: { jkt: v.string() },
  handler: async (ctx, { jkt }) => {
    // 1. Find computer by JKT
    const computer = await ctx.runQuery(internal.computers.getByJkt, { jkt });
    
    if (!computer) {
      throw new Error("Unknown device jkt");
    }
    
    // 2. Revoke all active refresh tokens
    await ctx.runMutation(internal.auth.revokeAllActiveTokens, {
      computerId: computer._id,
    });
    
    // 3. Issue fresh tokens
    const subject = `device:${computer._id}`;
    const { token: accessToken } = await issueAccessToken(subject, jkt);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await hashToken(refreshToken);
    
    await ctx.runMutation(internal.auth.createRefreshToken, {
      computerId: computer._id,
      tokenHash: refreshTokenHash,
      jkt,
      expiresAt: getRefreshTokenExpiry(),
    });
    
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: getAccessTokenTTL(),
    };
  },
});
// Internal mutations
export const createRefreshToken = internalMutation({
  args: {
    computerId: v.string(),
    tokenHash: v.string(),
    jkt: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("refresh_tokens", {
      computer_id: args.computerId as any,
      token_hash: args.tokenHash,
      jkt: args.jkt,
      status: "ACTIVE",
      expires_at: args.expiresAt,
    });
  },
});
export const cleanupExpiredTokens = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("refresh_tokens")
      .filter((q) => 
        q.and(
          q.eq(q.field("status"), "ACTIVE"),
          q.lt(q.field("expires_at"), now)
        )
      )
      .take(100);
    
    for (const token of expired) {
      await ctx.db.patch(token._id, { status: "EXPIRED" });
    }
    
    return { updated: expired.length };
  },
});
4.2 Dynamic Groups (Trigger Replacement)
V Convexu musíme přepsat SQL triggery jako explicitní mutace.

[NEW] 
groups.ts
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
// Evaluate rule against computer
function evaluateRule(
  rule: any,
  computer: {
    name: string;
    os?: string;
    os_version?: string;
    ip?: string;
    login_user?: string;
    intune_id?: string;
    _creationTime: number;
  }
): boolean {
  // Leaf node (single condition)
  if (rule.property) {
    let propValue: string | undefined;
    
    switch (rule.property) {
      case "name":
        propValue = computer.name;
        break;
      case "os":
        propValue = computer.os;
        break;
      case "osVersion":
        propValue = computer.os_version;
        break;
      case "ip":
        propValue = computer.ip;
        break;
      case "loginUser":
        propValue = computer.login_user;
        break;
      case "intuneEnrolled":
        propValue = computer.intune_id ? "true" : "false";
        break;
      default:
        return false;
    }
    
    if (propValue === undefined) return false;
    
    const ruleValue = rule.value;
    
    switch (rule.operator) {
      case "equals":
        return propValue === ruleValue;
      case "notEquals":
        return propValue !== ruleValue;
      case "contains":
        return propValue.toLowerCase().includes(ruleValue.toLowerCase());
      case "notContains":
        return !propValue.toLowerCase().includes(ruleValue.toLowerCase());
      case "startsWith":
        return propValue.toLowerCase().startsWith(ruleValue.toLowerCase());
      case "endsWith":
        return propValue.toLowerCase().endsWith(ruleValue.toLowerCase());
      case "regex":
        return new RegExp(ruleValue).test(propValue);
      case "olderThanDays": {
        const days = parseInt(ruleValue, 10);
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return computer._creationTime < cutoff;
      }
      case "newerThanDays": {
        const days = parseInt(ruleValue, 10);
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return computer._creationTime >= cutoff;
      }
      default:
        return false;
    }
  }
  
  // Branch node (nested conditions)
  const logic = rule.logic || "AND";
  const results = (rule.conditions || []).map((c: any) => 
    evaluateRule(c, computer)
  );
  
  if (results.length === 0) return false;
  
  if (logic === "AND") {
    return results.every((r: boolean) => r);
  } else {
    return results.some((r: boolean) => r);
  }
}
// Refresh membership for a single computer across all dynamic groups
export const refreshComputerMemberships = internalMutation({
  args: { computerId: v.id("computers") },
  handler: async (ctx, { computerId }) => {
    const computer = await ctx.db.get(computerId);
    if (!computer) return;
    
    // Remove existing memberships
    const existing = await ctx.db
      .query("dynamic_group_members")
      .withIndex("by_computer_id", (q) => q.eq("computer_id", computerId))
      .collect();
    
    for (const member of existing) {
      await ctx.db.delete(member._id);
    }
    
    // Evaluate all dynamic groups
    const groups = await ctx.db.query("dynamic_computer_groups").collect();
    
    for (const group of groups) {
      if (evaluateRule(group.rule_expression, computer)) {
        await ctx.db.insert("dynamic_group_members", {
          group_id: group._id,
          computer_id: computerId,
          added_at: Date.now(),
        });
      }
    }
  },
});
// Refresh all computers for a specific group
export const refreshGroupMembership = internalMutation({
  args: { groupId: v.id("dynamic_computer_groups") },
  handler: async (ctx, { groupId }) => {
    const group = await ctx.db.get(groupId);
    if (!group) return;
    
    // Clear existing members
    const existing = await ctx.db
      .query("dynamic_group_members")
      .withIndex("by_group_id", (q) => q.eq("group_id", groupId))
      .collect();
    
    for (const member of existing) {
      await ctx.db.delete(member._id);
    }
    
    // Evaluate all computers
    const computers = await ctx.db.query("computers").collect();
    
    for (const computer of computers) {
      if (evaluateRule(group.rule_expression, computer)) {
        await ctx.db.insert("dynamic_group_members", {
          group_id: groupId,
          computer_id: computer._id,
          added_at: Date.now(),
        });
      }
    }
    
    // Update last evaluated timestamp
    await ctx.db.patch(groupId, { last_evaluated_at: Date.now() });
  },
});
// Refresh all dynamic groups (for cron job)
export const refreshAllDynamicGroups = internalMutation({
  handler: async (ctx) => {
    const groups = await ctx.db.query("dynamic_computer_groups").collect();
    
    for (const group of groups) {
      // Clear existing members
      const existing = await ctx.db
        .query("dynamic_group_members")
        .withIndex("by_group_id", (q) => q.eq("group_id", group._id))
        .collect();
      
      for (const member of existing) {
        await ctx.db.delete(member._id);
      }
      
      // Evaluate all computers
      const computers = await ctx.db.query("computers").collect();
      
      for (const computer of computers) {
        if (evaluateRule(group.rule_expression, computer)) {
          await ctx.db.insert("dynamic_group_members", {
            group_id: group._id,
            computer_id: computer._id,
            added_at: Date.now(),
          });
        }
      }
      
      await ctx.db.patch(group._id, { last_evaluated_at: Date.now() });
    }
    
    console.log(`Refreshed ${groups.length} dynamic groups`);
  },
});
Fáze 5: Frontend Migration
5.1 Nahrazení tRPC za Convex
Starý kód (tRPC)	Nový kód (Convex)
api.computer.getAll.useQuery()	useQuery(api.computers.list)
api.group.create.useMutation()	useMutation(api.groups.create)
api.dynamicGroup.preview.useMutation()	useQuery(api.groups.preview, { rule })
5.2 Příklad Migrace Komponenty
Před (tRPC):

// components/computers/ComputerList.tsx
import { api } from "@/trpc/react";
export function ComputerList() {
  const { data, isLoading } = api.computer.getAll.useQuery();
  // ...
}
Po (Convex):

// components/computers/ComputerList.tsx
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
export function ComputerList() {
  const data = useQuery(api.computers.list);
  const isLoading = data === undefined;
  // ...
}
5.3 File Upload Migration
Před (Supabase Storage):

const { data, error } = await supabase.storage
  .from("internal")
  .upload(`temp/${file.name}`, file);
Po (Convex Storage):

const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
const url = await generateUploadUrl();
await fetch(url, {
  method: "POST",
  headers: { "Content-Type": file.type },
  body: file,
});
Fáze 6: Migrace Dat
6.1 Migrační Skript
[NEW] 
migrate.ts
import { createClient } from "@supabase/supabase-js";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SERVICE_ROLE_KEY!;
const CONVEX_URL = process.env.CONVEX_URL!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const convex = new ConvexHttpClient(CONVEX_URL);
async function migrateComputers() {
  console.log("Migrating computers...");
  
  const { data, error } = await supabase.from("computers").select("*");
  if (error) throw error;
  
  const idMap = new Map<string, string>(); // UUID -> Convex ID
  
  for (const computer of data) {
    const convexId = await convex.mutation(api.migration.createComputer, {
      legacyUuid: computer.id,
      name: computer.name,
      fingerprintHash: computer.fingerprint_hash,
      jkt: computer.jkt,
      rustdeskId: computer.rustdesk_id,
      ip: computer.ip,
      os: computer.os,
      osVersion: computer.os_version,
      loginUser: computer.login_user,
      clientVersion: computer.client_version,
      intuneId: computer.intune_id,
    });
    
    idMap.set(computer.id, convexId);
    console.log(`  Migrated computer ${computer.name}`);
  }
  
  return idMap;
}
async function migrateStorage() {
  console.log("Migrating storage files...");
  
  const { data: files, error } = await supabase.storage
    .from("internal")
    .list("", { limit: 1000 });
  
  if (error) throw error;
  
  for (const file of files) {
    // Download from Supabase
    const { data: blob, error: downloadError } = await supabase.storage
      .from("internal")
      .download(file.name);
    
    if (downloadError) {
      console.error(`  Failed to download ${file.name}:`, downloadError);
      continue;
    }
    
    // Get upload URL from Convex
    const uploadUrl = await convex.mutation(api.storage.generateUploadUrl);
    
    // Upload to Convex
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": blob.type },
      body: blob,
    });
    
    const { storageId } = await response.json();
    console.log(`  Migrated file ${file.name} -> ${storageId}`);
  }
}
async function main() {
  console.log("Starting migration...\n");
  
  const computerIdMap = await migrateComputers();
  await migrateStorage();
  
  console.log("\nMigration complete!");
  console.log(`Migrated ${computerIdMap.size} computers`);
}
main().catch(console.error);
Fáze 7: Úklid
Soubory k Smazání
# Go API
rm -rf api/
# Docker (Redis, Postgres)
rm docker-compose.yaml
# tRPC
rm -rf server/api/
rm -rf trpc/
# Supabase
rm -rf supabase/migrations/
rm -rf supabase/volumes/
# Supabase client
rm lib/supabase.ts
Dependencies k Odstranění
{
  "dependencies": {
    // REMOVE:
    "@supabase/supabase-js": "...",
    "@supabase/ssr": "...",
    "@trpc/client": "...",
    "@trpc/react-query": "...",
    "@trpc/server": "...",
    "@tanstack/react-query": "..." // Convex má vlastní reaktivitu
  }
}
Verification Plan
Automated Tests
# 1. Schema validation
npx convex dev --once
# 2. Unit tests pro DPoP
npm run test -- --grep "DPoP"
# 3. E2E testy pro API kompatibilitu
npm run test:e2e
Manual Verification
Enrollment Flow

Nový klient se úspěšně enrolluje
Token je správně dekrementován
DPoP proof je validován
Token Refresh

Access token expiruje korektně
Refresh token funguje
Grace period funguje
App Distribution

Assigned apps se zobrazují správně
Download redirect funguje
Storage URL je platná
Dynamic Groups

Nový počítač se přidá do skupiny
Změna pravidla přepočítá členství
Cron job správně refreshuje
Timeline Estimation
Fáze	Čas	Poznámka
Fáze 1 - Schéma	2-3 hodiny	Mechanický přepis
Fáze 2 - Auth/DPoP	6-8 hodin	Kritická, vyžaduje testování
Fáze 3 - HTTP Actions	4-6 hodin	13 endpointů
Fáze 4 - Business Logic	4-6 hodin	Queries/Mutations
Fáze 5 - Frontend	8-12 hodin	8 routerů + komponenty
Fáze 6 - Migrace Dat	2-4 hodiny	Závisí na objemu
Fáze 7 - Úklid	1-2 hodiny	Mechanický
Testování	8-12 hodin	Kritické
Celkem: ~40-55 hodin práce

Appendix: Environment Variables
# Convex Dashboard -> Settings -> Environment Variables
JWT_SECRET=<min 32 chars>
API_URL=https://your-convex-deployment.convex.site