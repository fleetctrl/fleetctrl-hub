"use client";

import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const formSchema = z.object({
    display_name: z.string().min(2, {
        message: "Name must be at least 2 characters.",
    }),
    description: z.string().optional(),
    publisher: z.string().min(2, {
        message: "Publisher must be at least 2 characters.",
    }),
});

interface EditAppSheetProps {
    app: {
        id: string;
        display_name: string;
        description?: string | null;
        publisher?: string | null;
    };
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function EditAppSheet({ app, open, onOpenChange }: EditAppSheetProps) {
    const router = useRouter();
    const updateApp = useMutation(api.apps.update);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            display_name: app.display_name,
            description: app.description || "",
            publisher: app.publisher || "",
        },
    });

    // Reset form when app prop changes
    useEffect(() => {
        form.reset({
            display_name: app.display_name,
            description: app.description || "",
            publisher: app.publisher || "",
        });
    }, [app, form]);

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            setIsSubmitting(true);
            await updateApp({
                id: app.id as Id<"apps">,
                data: values,
            });
            toast.success("App updated successfully");
            onOpenChange(false);
            router.refresh();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            toast.error(`Error updating app: ${message}`);
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleOpenChange(isOpen: boolean) {
        if (!isOpen) {
            form.reset({
                display_name: app.display_name,
                description: app.description || "",
                publisher: app.publisher || "",
            });
        }
        onOpenChange(isOpen);
    }

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Edit App Details</SheetTitle>
                    <SheetDescription>
                        Make changes to the app profile here. Click save when you&apos;re done.
                    </SheetDescription>
                </SheetHeader>
                <Form {...form}>
                    <form id="edit-app-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-4">
                        <FormField
                            control={form.control}
                            name="display_name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="App name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="publisher"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Publisher</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Publisher name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="App description"
                                            className="resize-none min-h-[100px]"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                <SheetFooter>
                    <Button type="submit" form="edit-app-form" disabled={isSubmitting}>
                        {isSubmitting ? "Saving..." : "Save changes"}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
