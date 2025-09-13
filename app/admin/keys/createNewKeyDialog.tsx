"use client"
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@/components/ui/dialog";
import { ChevronDownIcon, Copy, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import { b64urlSHA256, generateKey } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { on } from "events";
import { useRouter } from "next/navigation";

const createNewKeySchema = z.object({
    name: z.string().min(1, { message: "Key name is required" }),
    expires_at: z
        .string()
        .refine((val) => {
            const t = Date.parse(val);
            return Number.isFinite(t) && t >= Date.now();
        }, { message: "Expiration must be in the future" }),
    remaining_uses: z.coerce
        .number({ message: "Must be a number" })
        .int({ message: "Must be an integer" })
        .refine((n) => n === -1 || n >= 0, {
            message: "Use -1 for unlimited or a non-negative number",
        }),
});
type CreateNewKeyFormRaw = z.input<typeof createNewKeySchema>;

export default function CreateNewKeyDialog() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [openCalendar, setOpenCalendar] = useState(false)
    const [date, setDate] = useState<Date | undefined>(new Date(Date.now() + 24 * 60 * 60 * 1000))
    const [time, setTime] = useState<string>(() => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    })
    const [usesText, setUsesText] = useState<string>("1")
    const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
    const [generatedToken, setGeneratedToken] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    // no local state for uses; rely on RHF

    const form = useForm<CreateNewKeyFormRaw>({
        resolver: zodResolver(createNewKeySchema),
        defaultValues: {
            name: "",
            expires_at: date?.toISOString(),
            remaining_uses: 1
        }
    });

    useEffect(() => {
        router.refresh();
    }, [open, setOpen])

    async function onSubmit(values: CreateNewKeyFormRaw) {
        // generate token
        const token = generateKey()
        const token_fragment = token.slice(0, 8) + " ... " + token.slice(token.length - 4, token.length)

        const keyData = {
            name: values.name,
            token_hash: b64urlSHA256(token),
            expires_at: values.expires_at,
            token_fragment: token_fragment,
            remaining_uses: values.remaining_uses,
        };

        const supabase = createClient();
        const { error } = await supabase.from("enrollment_tokens").insert([keyData]);

        if (error) {
            toast.error("Error creating key")
            return
        }
        toast.success("Key was created")

        setOpen(false);
        setGeneratedToken(token)
        setTokenDialogOpen(true)
        setCopied(false)
        form.reset();
    }

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant={"secondary"}>Create Enrollment Key</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Enrollment Key</DialogTitle>
                        <DialogDescription asChild>
                            <Form {...form}>
                                <form
                                    onSubmit={form.handleSubmit(onSubmit)}
                                    className="space-y-4"
                                >
                                    {/* Name */}
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Name</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        onBlur={field.onBlur}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {/* remaining uses */}
                                    <FormField
                                        control={form.control}
                                        name="remaining_uses"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Uses</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="-?[0-9]*"
                                                        placeholder="e.g. 5 or -1"
                                                        value={usesText}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            // Allow only optional leading '-' and digits
                                                            if (/^-?\d*$/.test(v)) {
                                                                setUsesText(v);
                                                                if (v !== "" && v !== "-") {
                                                                    field.onChange(Number(v));
                                                                }
                                                            }
                                                        }}
                                                        onBlur={(e) => {
                                                            field.onBlur();
                                                            let v = e.target.value;
                                                            if (v === "" || v === "-") {
                                                                v = "0";
                                                            }
                                                            const n = Number(v);
                                                            setUsesText(String(n));
                                                            field.onChange(n);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {/* Expires at */}
                                    <FormField
                                        control={form.control}
                                        name="expires_at"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Expires At</FormLabel>
                                                <div className="flex items-center gap-4">
                                                    {/* Hidden field bound to RHF */}
                                                    <FormControl>
                                                        <Input
                                                            type="text"
                                                            className="hidden"
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                            onBlur={field.onBlur}
                                                        />
                                                    </FormControl>
                                                    {/* Date */}
                                                    <div className="flex flex-col gap-2">
                                                        <Label htmlFor="expires-date" className="px-1">Date</Label>
                                                        <Popover open={openCalendar} onOpenChange={setOpenCalendar}>
                                                            <PopoverTrigger asChild>
                                                                <Button
                                                                    variant="outline"
                                                                    id="expires-date"
                                                                    className="w-32 justify-between font-normal"
                                                                >
                                                                    {date ? date.toLocaleDateString() : "Select date"}
                                                                    <ChevronDownIcon />
                                                                </Button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                                                                <Calendar
                                                                    mode="single"
                                                                    selected={date}
                                                                    captionLayout="dropdown"
                                                                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                                                                    onSelect={(d) => {
                                                                        setOpenCalendar(false)
                                                                        if (!d) return
                                                                        const [hh = "00", mm = "00", ss = "00"] = time.split(":")
                                                                        const combined = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(hh), Number(mm), Number(ss))
                                                                        // If today, clamp to now
                                                                        const now = new Date()
                                                                        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                                                                        if (combined >= todayStart && combined < now) {
                                                                            const pad = (n: number) => String(n).padStart(2, "0")
                                                                            const nowStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
                                                                            setTime(nowStr)
                                                                            const fixed = new Date(d.getFullYear(), d.getMonth(), d.getDate(), now.getHours(), now.getMinutes(), now.getSeconds())
                                                                            setDate(fixed)
                                                                            field.onChange(fixed.toISOString())
                                                                            return
                                                                        }
                                                                        setDate(combined)
                                                                        field.onChange(combined.toISOString())
                                                                    }}
                                                                />
                                                            </PopoverContent>
                                                        </Popover>
                                                    </div>
                                                    {/* Time */}
                                                    <div className="flex flex-col gap-2">
                                                        <Label htmlFor="expires-time" className="px-1">Time</Label>
                                                        <Input
                                                            type="time"
                                                            id="expires-time"
                                                            step="1"
                                                            value={time}
                                                            min={(date && (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() === new Date(new Date().setHours(0, 0, 0, 0)).getTime())) ? (() => { const n = new Date(); const p = (x: number) => String(x).padStart(2, "0"); return `${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}` })() : undefined}
                                                            onChange={(e) => {
                                                                let val = e.target.value
                                                                const now = new Date()
                                                                const pad = (n: number) => String(n).padStart(2, "0")
                                                                const nowStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
                                                                if (date) {
                                                                    const isToday = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() === new Date(new Date().setHours(0, 0, 0, 0)).getTime()
                                                                    if (isToday && val < nowStr) {
                                                                        val = nowStr
                                                                    }
                                                                    setTime(val)
                                                                    const [hh = "00", mm = "00", ss = "00"] = val.split(":")
                                                                    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(hh), Number(mm), Number(ss))
                                                                    setDate(next)
                                                                    field.onChange(next.toISOString())
                                                                } else {
                                                                    setTime(val)
                                                                }
                                                            }}
                                                            className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                                        />
                                                    </div>
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <Button type="submit" className="w-full">
                                        Create Enrollment Key
                                    </Button>
                                </form>
                            </Form>
                        </DialogDescription>
                    </DialogHeader>
                </DialogContent>
            </Dialog>
            {/* Enrollment token dialog */}
            <Dialog
                open={tokenDialogOpen}
                onOpenChange={(v) => {
                    setTokenDialogOpen(v)
                    if (!v) {
                        setGeneratedToken(null)
                        setCopied(false)
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Enrollment Token</DialogTitle>
                        <DialogDescription>
                            Token was created successfully. Click the button below to copy it.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2">
                        <Input
                            type="text"
                            readOnly
                            value={generatedToken ?? ""}
                            onFocus={(e) => e.currentTarget.select()}
                            className="font-mono"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={async () => {
                                if (!generatedToken) return
                                try {
                                    await navigator.clipboard.writeText(generatedToken)
                                    setCopied(true)
                                    toast.success("Token zkopírován do schránky")
                                    setTimeout(() => setCopied(false), 2000)
                                } catch (e) {
                                    toast.error("Kopírování se nezdařilo")
                                }
                            }}
                        >
                            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                        </Button>
                    </div>
                    <div className="flex justify-end">
                        <Button type="button" onClick={() => setTokenDialogOpen(false)}>
                            Close
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
