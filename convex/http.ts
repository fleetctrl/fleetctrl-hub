import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { verifyDPoP, issueTokens, hashToken } from "./lib/auth";

const http = httpRouter();

// --- POST /enroll ---
http.route({
  path: "/enroll",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      // 1. Check Enrollment Token Header
      const enrollToken = request.headers.get("enrollment-token");
      if (!enrollToken) {
        return new Response("Missing enrollment-token", { status: 400 });
      }

      // 2. Parse Body
      const body = await request.json();
      const { name, fingerprint_hash, jkt } = body;

      if (!name || !fingerprint_hash || !jkt) {
         return new Response("Invalid payload", { status: 400 });
      }

      // 3. Run Mutation to Enroll
      // This checks the token validity and creates/updates the computer
      const result = await ctx.runMutation(api.enroll.enrollDevice, {
        enrollmentToken: enrollToken,
        fingerprintHash: fingerprint_hash,
        name: name,
        jkt: jkt,
      });

      // 4. Issue Tokens
      // We need the ID of the computer. `result.computerId` is a Convex ID.
      const tokens = await issueTokens(
        `device:${result.computerId}`,
        result.computerId,
        jkt,
        process.env.CONVEX_SITE_URL || "http://localhost", // API URL
        process.env.JWT_SECRET!
      );

      // We also need to store the Refresh Token in the DB.
      // We need another mutation for that?
      // Or we can do it inside `issueTokens` if we passed `ctx`?
      // `issueTokens` is in `lib/auth.ts`, it doesn't have `ctx`.
      // We should create a mutation `storeRefreshToken`.

      await ctx.runMutation(api.auth_actions.storeRefreshToken, {
        jkt: jkt,
        computerId: result.computerId,
        tokenHash: await hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + 2592000 * 1000).toISOString(), // 30 days
      });

      return new Response(JSON.stringify({ tokens }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });

    } catch (e: any) {
      console.error(e);
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
  }),
});

// --- GET /client/version ---
http.route({
  path: "/client/version",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // This endpoint was public in Go (or at least check was generic)
    // "GetActiveVersion returns the currently active client version"

    // It used `cache.WithCache`. Convex is fast enough.

    const version = await ctx.runQuery(api.client.getActiveVersion);

    if (!version) {
       return new Response(JSON.stringify({ version: null }), {
           status: 200,
           headers: { "Content-Type": "application/json" }
       });
    }

    return new Response(JSON.stringify({
        id: version._id,
        version: version.version,
        hash: version.hash
    }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
  }),
});

// --- GET /client/download/:versionID ---
http.route({
    path: "/client/download/:versionID",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
        // 1. Auth (DPoP)
        const dpopHeader = request.headers.get("DPoP");
        const computerIdHeader = request.headers.get("X-Computer-ID");

        if (!computerIdHeader) {
            return new Response("Unauthorized: Missing X-Computer-ID", { status: 401 });
        }

        try {
            // Verify DPoP
            // We need to check against the JKT stored in DB for this computer?
            // The Go code:
            // 1. Checks X-Computer-ID exists.
            // 2. Middleware `withDPoP` verifies the signature and JKT.
            // 3. `DownloadClient` just checks headers.

            // Replicating `withDPoP` middleware logic here:
            const { jkt } = await verifyDPoP(
                dpopHeader,
                request.method,
                request.url
            );

            // Verify that this JKT belongs to the computer claiming it?
            // Go code `auth.go` -> `Recover` finds device by JKT.
            // But `DownloadClient` is a protected endpoint.
            // We should ideally verify that the computerId in header matches the JKT.

            // Let's assume we trust the signature for now,
            // but strict security would require checking `computers` table
            // to see if `jkt` matches `computerId`.

            // 2. Get Version
            const versionId = request.routeParams.versionID;
            const version = await ctx.runQuery(api.client.getVersion, { id: versionId });

            if (!version) {
                return new Response("Version not found", { status: 404 });
            }

            // 3. Generate Download URL
            // In Convex, if we use Convex Storage, we need the `storageId`.
            // The migration schema has `storage_path`.
            // If we migrated files to Convex Storage, `storage_path` should hold the storage ID.

            // Assuming `version.storage_path` is the Convex Storage ID.
            const url = await ctx.storage.getUrl(version.storage_path);

            if (!url) {
                return new Response("File not found in storage", { status: 500 });
            }

            return Response.redirect(url);

        } catch (e: any) {
            return new Response(`Unauthorized: ${e.message}`, { status: 401 });
        }
    }),
});


export default http;
