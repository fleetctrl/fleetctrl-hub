"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

// Zod schema for sign in/sign up form
const authFormSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    name: z.string().optional(),
});

type AuthFormValues = z.infer<typeof authFormSchema>;

export default function SignInPage() {
    const router = useRouter();
    const [step, setStep] = useState<"signIn" | "signUp">("signIn");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: session, isPending } = authClient.useSession();

    const form = useForm<AuthFormValues>({
        resolver: zodResolver(authFormSchema),
        defaultValues: {
            email: "",
            password: "",
            name: "",
        },
        mode: "onBlur",
    });

    // Redirect when authenticated
    useEffect(() => {
        if (session?.user) {
            router.push("/admin");
        }
    }, [session, router]);

    const onSubmit = async (data: AuthFormValues) => {
        setIsSubmitting(true);
        setError(null);

        try {
            if (step === "signUp") {
                const result = await authClient.signUp.email({
                    email: data.email,
                    password: data.password,
                    name: data.name || data.email.split("@")[0],
                });

                if (result.error) {
                    setError(result.error.message || "Failed to create account");
                    setIsSubmitting(false);
                    return;
                }
            } else {
                const result = await authClient.signIn.email({
                    email: data.email,
                    password: data.password,
                });

                if (result.error) {
                    setError(result.error.message || "Invalid email or password");
                    setIsSubmitting(false);
                    return;
                }
            }

            // Redirect will happen via useEffect when session updates
        } catch {
            setError(
                step === "signIn"
                    ? "Invalid email or password"
                    : "Failed to create account"
            );
            setIsSubmitting(false);
        }
    };

    // Show loading while checking session
    if (isPending) {
        return (
            <div className="flex min-h-svh w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                <div className="text-white">Loading...</div>
            </div>
        );
    }

    return (
        <div className="flex min-h-svh w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 md:p-10">
            <div className="w-full max-w-sm">
                <Card className="backdrop-blur-sm bg-background/95 border-slate-700/50 shadow-2xl">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl font-bold tracking-tight">
                            {step === "signIn" ? "Welcome back" : "Create an account"}
                        </CardTitle>
                        <CardDescription>
                            {step === "signIn"
                                ? "Enter your credentials to access the admin panel"
                                : "Enter your details to create a new account"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)}>
                                <div className="flex flex-col gap-4">
                                    {step === "signUp" && (
                                        <FormField
                                            control={form.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Name</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="text"
                                                            placeholder="Your name"
                                                            disabled={isSubmitting}
                                                            className="bg-background/50"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="email"
                                                        placeholder="admin@example.com"
                                                        disabled={isSubmitting}
                                                        className="bg-background/50"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Password</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="password"
                                                        disabled={isSubmitting}
                                                        className="bg-background/50"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {error && (
                                        <p className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-md">
                                            {error}
                                        </p>
                                    )}
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting
                                            ? step === "signIn"
                                                ? "Signing in..."
                                                : "Creating account..."
                                            : step === "signIn"
                                                ? "Sign in"
                                                : "Create account"}
                                    </Button>
                                </div>
                                <div className="mt-4 text-center text-sm text-muted-foreground">
                                    {step === "signIn" ? (
                                        <>
                                            Don&apos;t have an account?{" "}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setStep("signUp");
                                                    setError(null);
                                                    form.clearErrors();
                                                }}
                                                className="text-primary hover:underline underline-offset-4"
                                            >
                                                Sign up
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            Already have an account?{" "}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setStep("signIn");
                                                    setError(null);
                                                    form.clearErrors();
                                                }}
                                                className="text-primary hover:underline underline-offset-4"
                                            >
                                                Sign in
                                            </button>
                                        </>
                                    )}
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                    <Link href="/" className="hover:underline">
                        ← Back to home
                    </Link>
                </p>
            </div>
        </div>
    );
}
