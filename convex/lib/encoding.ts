/**
 * Encoding utilities for Convex runtime (where Node Buffer is not available).
 */

/**
 * Converts ArrayBuffer or Uint8Array to Base64URL string.
 * This replaces: Buffer.from(buffer).toString("base64url")
 */
export function arrayBufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    // btoa is available in Convex runtime
    const base64 = btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decodes Base64URL string to UTF-8 String.
 * This replaces: Buffer.from(base64Url, "base64url").toString("utf-8")
 */
export function base64UrlToString(base64Url: string): string {
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    const padded = pad ? base64 + "=".repeat(4 - pad) : base64;

    const binary = atob(padded);

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}
