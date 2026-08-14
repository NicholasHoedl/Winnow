"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Calendar as CalendarIcon } from "lucide-react"

import { localDateToString, localStringToDate } from "@/lib/date"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/**
 * A calendar-icon button that opens a date picker and navigates on select. Reusable for
 * day granularity (meals → `?date=`) or month granularity (budget → `?month=`): the
 * caller's `hrefFor` decides what to do with the picked 'YYYY-MM-DD'.
 */
export function DateJumpButton({
  selected,
  hrefFor,
  ariaLabel,
}: {
  /** 'YYYY-MM-DD' anchoring the calendar (the current view date / month start). */
  selected: string
  hrefFor: (dateStr: string) => string
  ariaLabel: string
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [open, setOpen] = React.useState(false)
  const anchor = localStringToDate(selected)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" aria-label={ariaLabel} />}
      >
        {pending ? (
          <Spinner className="size-4" />
        ) : (
          <CalendarIcon className="size-4" />
        )}
      </PopoverTrigger>
      <PopoverContent align="center" className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={anchor}
          defaultMonth={anchor}
          onSelect={(picked) => {
            if (!picked) return
            setOpen(false)
            // The popover closing is partial acknowledgement, but the trigger stays
            // mounted right there and the round trip is a full page change.
            startTransition(() => {
              router.push(hrefFor(localDateToString(picked)))
            })
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
