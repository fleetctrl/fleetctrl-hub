import { z } from "zod";

/** Response of `PUT /admin/files`. */
export const uploadedFileSchema = z.object({
    fileId: z.string(),
    sha256: z.string(),
    size: z.number(),
    contentType: z.string(),
    name: z.string(),
});

export type UploadedFile = z.infer<typeof uploadedFileSchema>;

/** Header carrying the URI-encoded original file name of an upload. */
export const FILE_NAME_HEADER = "X-File-Name";
