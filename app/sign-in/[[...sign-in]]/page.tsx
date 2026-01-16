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
import { env } from "@/lib/env";

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

    // Check if registration is allowed
    const allowRegistration = process.env.NEXT_PUBLIC_ALLOW_REGISTRATION !== "false";

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
                if (!allowRegistration) {
                    setError("Registration is disabled");
                    setIsSubmitting(false);
                    return;
                }

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

    if (isPending) {
        return null; // Don't show anything while checking session to avoid flicker
    }

    return (
        <div className="flex h-screen w-full items-center justify-center px-4">
            <Card className="mx-auto max-w-sm w-full">
                <CardHeader>
                    <CardTitle className="text-2xl">
                        {step === "signIn" ? "Login" : "Sign Up"}
                    </CardTitle>
                    <CardDescription>
                        {step === "signIn"
                            ? "Enter your email below to login to your account"
                            : "Enter your information to create an account"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
                            {step === "signUp" && (
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Name</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="John Doe"
                                                    disabled={isSubmitting}
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
                                                placeholder="m@example.com"
                                                disabled={isSubmitting}
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
                                        <div className="flex items-center justify-between">
                                            <FormLabel>Password</FormLabel>
                                            {step === "signIn" && (
                                                <Link
                                                    href="#"
                                                    className="ml-auto inline-block text-sm underline"
                                                >
                                                    Forgot your password?
                                                </Link>
                                            )}
                                        </div>
                                        <FormControl>
                                            <Input
                                                type="password"
                                                disabled={isSubmitting}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {error && (
                                <div className="text-sm text-red-500 font-medium">{error}</div>
                            )}
                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting
                                    ? step === "signIn"
                                        ? "Logging in..."
                                        : "Creating account..."
                                    : step === "signIn"
                                        ? "Login"
                                        : "Sign Up"}
                            </Button>
                        </form>
                    </Form>

                    {/* Only show sign up toggle if registration is allowed */}
                    {allowRegistration && (
                        <div className="mt-4 text-center text-sm">
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
                                        className="underline"
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
                                        className="underline"
                                    >
                                        Login
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
