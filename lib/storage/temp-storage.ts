import { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { createBrowserClient } from "@supabase/ssr";

export type StoredFileReference = {
  bucket: string;
  path: string;
  name: string;
  size: number;
  type?: string | null;
  hash?: string;
};

export type ReleaseAssetCategory = "installers" | "requirements" | string;

export const APP_STORAGE_BUCKET = "internal";
export const TEMP_STORAGE_PREFIX = "temp";
const RELEASE_STORAGE_PREFIX = "releases";

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
};

const sanitizeSegment = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
};

export const buildTempStoragePath = (
  category: ReleaseAssetCategory,
  filename: string
) => {
  const cleanedCategory = sanitizeSegment(category || "misc");
  const cleanedFile = sanitizeSegment(filename || "file.bin") || "file.bin";
  const uniquePart = generateId();

  return `${TEMP_STORAGE_PREFIX}/${cleanedCategory}/${uniquePart}-${cleanedFile}`;
};

export const buildReleaseAssetPath = (params: {
  appId: string | number;
  releaseId: string | number;
  filename: string;
  category?: ReleaseAssetCategory;
}) => {
  const cleanedCategory = sanitizeSegment(params.category ?? "assets");
  const cleanedFile = sanitizeSegment(params.filename) || "file.bin";
  return `${RELEASE_STORAGE_PREFIX}/${sanitizeSegment(
    String(params.appId)
  )}/${sanitizeSegment(String(params.releaseId))}/${cleanedCategory}/${cleanedFile}`;
};

type UploadOptions = {
  file: File;
  category: ReleaseAssetCategory;
};

export const uploadFileToTempStorage = async ({
  file,
  category,
}: UploadOptions): Promise<StoredFileReference> => {
  const path = buildTempStoragePath(category, file.name);
  const supabase = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await supabase.storage
    .from(APP_STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  let hashHex: string;
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } else {
      // Fallback for insecure contexts (http)
      hashHex = await sha256Fallback(file);
    }
  } catch (e) {
    console.error("Hashing failed", e);
    // Fallback or re-throw? For now we re-throw as hash is required
    throw new Error("Unable to calculate file hash");
  }

  return {
    bucket: APP_STORAGE_BUCKET,
    path,
    name: file.name,
    size: file.size,
    type: file.type,
    hash: hashHex,
  };
};

// Minimal SHA-256 implementation for fallback
async function sha256Fallback(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  // Pre-processing
  const len = bytes.length * 8;
  const newLen = ((bytes.length + 8) >>> 6) + 1 << 6; // Pad to 512-bit block
  const padded = new Uint8Array(newLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  // Append length in bits as big-endian 64-bit integer
  const view = new DataView(padded.buffer);
  view.setUint32(newLen - 4, len, false); // Low 32 bits (big endian is default for DataView? No, default is big endian, wait. DataView methods take littleEndian boolean. Default is Big Endian.)
  // Actually, SHA-256 uses Big Endian for length.
  // JS bitwise ops are 32-bit. 
  // Let's handle length carefully.
  // We need to write 64-bit integer.
  // High 32 bits
  view.setUint32(newLen - 8, Math.floor(len / 0x100000000), false);
  // Low 32 bits
  view.setUint32(newLen - 4, len >>> 0, false);

  const w = new Uint32Array(64);

  for (let i = 0; i < newLen; i += 64) {
    const chunk = padded.subarray(i, i + 64);
    for (let j = 0; j < 16; j++) {
      w[j] = (chunk[j * 4] << 24) | (chunk[j * 4 + 1] << 16) | (chunk[j * 4 + 2] << 8) | chunk[j * 4 + 3];
    }
    for (let j = 16; j < 64; j++) {
      const s0 = ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^ ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^ (w[j - 15] >>> 3);
      const s1 = ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^ ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h_val] = h;

    for (let j = 0; j < 64; j++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h_val + S1 + ch + k[j] + w[j]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h_val = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + h_val) >>> 0;
  }

  return h.map(x => x.toString(16).padStart(8, '0')).join('');
}

export const deleteStoredFile = async ({
  file,
}: {
  file?: StoredFileReference | null;
}) => {
  if (!file) {
    return;
  }
  const supabase = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await supabase.storage
    .from(file.bucket)
    .remove([file.path]);

  if (error) {
    throw new Error(error.message);
  }
};

export const moveStoredFileWithinBucket = async ({
  supabase,
  file,
  destinationPath,
}: {
  supabase: SupabaseClient;
  file: StoredFileReference;
  destinationPath: string;
}) => {
  const cleanedDestination = destinationPath.replace(/^\/+/, "");
  const { error } = await supabase.storage
    .from(file.bucket)
    .move(file.path, cleanedDestination);

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...file,
    path: cleanedDestination,
  };
};
