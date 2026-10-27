import { calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { computeATH } from "@/server/security/dpop";

type Fetcher = { request: (path: string, init?: RequestInit) => Response | Promise<Response> };

/**
 * A device with its own ES256 key that signs real DPoP proofs, like the Go client.
 * `fetcher` is the in-process app or a wrapper around fetch for a remote base URL.
 */
export class TestDevice {
    accessToken: string | null = null;
    refreshToken: string | null = null;
    deviceId: string | null = null;

    private constructor(
        private readonly fetcher: Fetcher,
        private readonly apiUrl: string,
        private readonly privateKey: CryptoKey,
        readonly jwk: JWK,
        readonly jkt: string,
    ) {}

    static async create(fetcher: Fetcher, apiUrl: string) {
        const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
        const jwk = await exportJWK(publicKey);
        return new TestDevice(fetcher, apiUrl, privateKey, jwk, await calculateJwkThumbprint(jwk));
    }

    async proof(method: string, path: string, options: { accessToken?: string; jti?: string; iat?: number; htu?: string } = {}) {
        const payload = {
            htm: method,
            htu: options.htu ?? `${this.apiUrl}${path}`,
            iat: options.iat ?? Math.floor(Date.now() / 1000),
            jti: options.jti ?? crypto.randomUUID(),
            ...(options.accessToken ? { ath: await computeATH(options.accessToken) } : {}),
        };
        return new SignJWT(payload)
            .setProtectedHeader({ typ: "dpop+jwt", alg: "ES256", jwk: this.jwk })
            .sign(this.privateKey);
    }

    /** Raw request with DPoP (and the access token, when the device has one). */
    async call(method: string, path: string, init: { body?: unknown; headers?: Record<string, string>; auth?: boolean; dpop?: string } = {}) {
        const headers = new Headers(init.headers);
        const useAuth = init.auth ?? true;
        if (useAuth && this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);
        headers.set("DPoP", init.dpop ?? (await this.proof(method, path, { accessToken: useAuth ? this.accessToken ?? undefined : undefined })));
        if (init.body !== undefined) headers.set("Content-Type", "application/json");
        return this.fetcher.request(path, {
            method,
            headers,
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
    }

    async enroll(enrollmentToken: string, name: string, options: { deviceId?: string } = {}) {
        const body = { name, jkt: this.jkt, ...(options.deviceId ? { device_id: options.deviceId } : {}) };
        const response = await this.call("POST", "/enroll", { body, auth: false, headers: { "enrollment-token": enrollmentToken } });
        if (response.status === 201) {
            const json = await response.clone().json();
            this.accessToken = json.tokens.access_token;
            this.refreshToken = json.tokens.refresh_token;
            this.deviceId = json.device_id;
        }
        return response;
    }

    async refresh() {
        const response = await this.call("POST", "/token/refresh", { body: { refresh_token: this.refreshToken }, auth: false });
        if (response.ok) {
            const json = await response.clone().json();
            this.accessToken = json.tokens.access_token;
            this.refreshToken = json.tokens.refresh_token;
        }
        return response;
    }
}
