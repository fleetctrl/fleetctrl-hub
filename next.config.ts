import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));

// Behind Caddy, /api* and /auth* never reach Next.js. Without Caddy (`pnpm dev`), Next proxies
// them to the API service so the browser stays same-origin, as it is in production.
const apiProxyTarget = process.env.API_PROXY_TARGET
    ?? (process.env.NODE_ENV === "development" ? "http://localhost:3001" : undefined);

const nextConfig: NextConfig = {
    // eslint: { ignoreDuringBuilds: true },
    output: "standalone",
    turbopack: {
        root: workspaceRoot,
    },
    // The dev proxy buffers request bodies (10 MB) and times out after 30 s by default, which
    // would cut off installer uploads and the presence stream. Only applies when proxying.
    ...(apiProxyTarget
        ? { experimental: { proxyClientMaxBodySize: "2gb", proxyTimeout: 60 * 60 * 1000 } }
        : {}),
    async rewrites() {
        if (!apiProxyTarget) return [];
        return [
            { source: "/api/:path*", destination: `${apiProxyTarget}/:path*` },
            { source: "/auth/:path*", destination: `${apiProxyTarget}/auth/:path*` },
        ];
    },
};

export default nextConfig;
