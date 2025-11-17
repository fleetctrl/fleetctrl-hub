import { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { createBrowserClient } from "@supabase/ssr";

export type StoredFileReference = {
  bucket: string;
  path: string;
  name: string;
  size: number;
  type?: string | null;
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

  return {
    bucket: APP_STORAGE_BUCKET,
    path,
    name: file.name,
    size: file.size,
    type: file.type,
  };
};

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
