"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
    value?: string // ISO date string YYYY-MM-DD
    onChange?: (value: string) => void
    disabled?: boolean
    placeholder?: string
}

export function DatePicker({
    value,
    onChange,
    disabled,
    placeholder = "Pick a date",
}: DatePickerProps) {
    const [open, setOpen] = React.useState(false)

    // Parse the string value to Date
    const date = value ? new Date(value) : undefined

    const handleSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            // Format as YYYY-MM-DD for the database
            const formatted = format(selectedDate, "yyyy-MM-dd")
            onChange?.(formatted)
        }
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                    )}
                    disabled={disabled}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : placeholder}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleSelect}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    )
}
