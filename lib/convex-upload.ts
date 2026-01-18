import { Id } from "@/convex/_generated/dataModel";

export interface StoredFile {
    storageId: Id<"_storage">;
    name: string;
    size: number;
    type: string;
    hash: string;
}

export async function uploadFileToConvex(
    file: File,
    generateUploadUrl: () => Promise<string>
): Promise<StoredFile> {
    // 1. Calculate SHA256 hash
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // 2. Get Upload URL
    const postUrl = await generateUploadUrl();

    // 3. Upload File
    const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
    });

    if (!result.ok) {
        throw new Error(`Upload failed: ${result.statusText}`);
    }

    const { storageId } = await result.json();

    return {
        storageId: storageId as Id<"_storage">,
        name: file.name,
        size: file.size,
        type: file.type,
        hash,
    };
}
