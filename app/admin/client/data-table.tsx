"use client";

import { useMemo, useState } from "react";
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { Upload, Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { columns, type ClientUpdateRow, type ClientUpdatesTableMeta } from "./columns";
import { api } from "@/trpc/react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const formatDateTime = (isoDate: string) =>
    new Date(isoDate).toLocaleString("cs-CZ", {
        dateStyle: "medium",
        timeStyle: "short",
    });

export function ClientUpdatesTable() {
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [version, setVersion] = useState("");
    const [notes, setNotes] = useState("");

    const { data: clientUpdates, refetch } = api.clientUpdate.getAll.useQuery(undefined, {
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
    });

    const createMutation = api.clientUpdate.create.useMutation({
        onSuccess: () => {
            toast.success("Client version uploaded successfully");
            setUploadDialogOpen(false);
            resetForm();
            refetch();
        },
        onError: (error) => {
            toast.error("Failed to create version: " + error.message);
        },
    });

    const resetForm = () => {
        setUploadFile(null);
        setVersion("");
        setNotes("");
    };

    const handleUpload = async () => {
        if (!uploadFile || !version.trim()) {
            toast.error("Please provide a file and version");
            return;
        }

        setIsUploading(true);

        try {
            const supabase = createClient();

            // Calculate SHA256 hash
            const arrayBuffer = await uploadFile.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

            // Upload to Supabase storage
            const storagePath = `client-updates/${version}/${uploadFile.name}`;
            const { error: uploadError } = await supabase.storage
                .from("internal")
                .upload(storagePath, uploadFile, {
                    cacheControl: "3600",
                    upsert: false,
                });

            if (uploadError) {
                throw new Error("Storage upload failed: " + uploadError.message);
            }

            // Create database record
            createMutation.mutate({
                version: version.trim(),
                storage_path: storagePath,
                hash,
                byte_size: uploadFile.size,
                notes: notes.trim() || undefined,
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Upload failed");
        } finally {
            setIsUploading(false);
        }
    };

    // Compare semantic versions (returns negative if a < b, positive if a > b, 0 if equal)
    const compareSemver = (a: string, b: string): number => {
        // Normalize versions: remove 'v' prefix and split by dots/hyphens
        const normalize = (v: string) => v.replace(/^v/i, "").split(/[.-]/).map(p => parseInt(p, 10) || 0);
        const partsA = normalize(a);
        const partsB = normalize(b);
        const maxLen = Math.max(partsA.length, partsB.length);

        for (let i = 0; i < maxLen; i++) {
            const numA = partsA[i] ?? 0;
            const numB = partsB[i] ?? 0;
            if (numA !== numB) return numA - numB;
        }
        return 0;
    };

    const rows: ClientUpdateRow[] = useMemo(() => {
        if (!clientUpdates) return [];
        return clientUpdates
            .map((update) => ({
                id: update.id,
                version: update.version,
                hash: update.hash,
                byte_size: update.byte_size,
                is_active: update.is_active,
                notes: update.notes,
                createdAtFormatted: formatDateTime(update.created_at),
            }))
            .sort((a, b) => compareSemver(b.version, a.version)); // Descending: highest first
    }, [clientUpdates]);

    const table = useReactTable<ClientUpdateRow>({
        data: rows,
        columns,
        getCoreRowModel: getCoreRowModel(),
        meta: {
            onActionComplete: () => refetch(),
        } satisfies ClientUpdatesTableMeta,
    });

    const hasVersions = rows.length > 0;
    const activeVersion = rows.find((r) => r.is_active);

    return (
        <div className="flex w-full flex-col gap-4 pb-10">
            <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold">FleetCtrl Client Updates</h2>
                    <p className="text-sm text-muted-foreground">
                        Manage client versions for automatic updates on enrolled computers.
                        {activeVersion && (
                            <span className="ml-2 font-medium text-green-600">
                                Active: {activeVersion.version}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" asChild>
                        <a
                            href="https://github.com/fleetctrl/fleetctrl-client/releases"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Github className="mr-2 h-4 w-4" />
                            GitHub Releases
                        </a>
                    </Button>
                    <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Upload className="mr-2 h-4 w-4" />
                                Upload Version
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Upload Client Version</DialogTitle>
                                <DialogDescription>
                                    Upload a new FleetCtrl client binary. The hash will be calculated
                                    automatically for integrity verification.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="version">Version</Label>
                                    <Input
                                        id="version"
                                        placeholder="v0.4.1"
                                        value={version}
                                        onChange={(e) => setVersion(e.target.value)}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="file">Binary File</Label>
                                    <Input
                                        id="file"
                                        type="file"
                                        accept=".exe,.msi"
                                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                                    />
                                    {uploadFile && (
                                        <p className="text-sm text-muted-foreground">
                                            Selected: {uploadFile.name} (
                                            {(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                                        </p>
                                    )}
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="notes">Release Notes (optional)</Label>
                                    <Textarea
                                        id="notes"
                                        placeholder="What's new in this version..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setUploadDialogOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleUpload}
                                    disabled={isUploading || createMutation.isPending || !uploadFile || !version.trim()}
                                >
                                    {isUploading ? "Uploading..." : "Upload"}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
                <CardContent className="py-3">
                    <CardDescription>
                        Clients report their version via <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">X-Client-Version</code> header.
                        When outdated, they receive update instructions via <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">X-Client-Update</code> response header.
                    </CardDescription>
                </CardContent>
            </Card>

            {hasVersions ? (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => (
                                            <TableHead key={header.id}>
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {table.getRowModel().rows.map((row) => (
                                    <TableRow key={row.id}>
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                        <div className="text-sm text-muted-foreground">
                            No client versions uploaded yet. Upload one to enable automatic updates.
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
