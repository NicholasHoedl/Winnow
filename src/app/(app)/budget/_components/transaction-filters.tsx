"use client"

// Narrowing controls for the transaction list. State lives in the URL (the same
// convention as `?month=`), so a filtered view is linkable and the server does the
// filtering — nothing is filtered client-side.

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, X } from "lucide-react"

import type { Category } from "@/modules/budget/queries"
import {
  UNCATEGORIZED,
  type TransactionFilters as Filters,
} from "@/modules/budget/service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ANY = "any"
const SEARCH_DEBOUNCE_MS = 300

// "date:desc" style values keep the two-part sort in a single Select.
const SORTS = [
  { value: "date:desc", label: "Newest first" },
  { value: "date:asc", label: "Oldest first" },
  { value: "amount:desc", label: "Largest first" },
  { value: "amount:asc", label: "Smallest first" },
] as const

export function TransactionFilters({
  categories,
  filters,
}: {
  categories: Category[]
  filters: Filters
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [text, setText] = React.useState(filters.q ?? "")
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const push = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      router.replace(`/budget?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  function onSearchChange(value: string) {
    setText(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(
      () => push({ q: value.trim() || undefined }),
      SEARCH_DEBOUNCE_MS,
    )
  }

  function clearAll() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setText("")
    push({
      q: undefined,
      cat: undefined,
      type: undefined,
      sort: undefined,
      dir: undefined,
    })
  }

  const sortValue = `${filters.sort ?? "date"}:${filters.dir ?? "desc"}`
  const active =
    !!filters.q || !!filters.categoryId || !!filters.type || !!filters.sort

  const categoryLabel = (value: string | undefined) => {
    if (!value || value === ANY) return "All categories"
    if (value === UNCATEGORIZED) return "Uncategorized"
    return categories.find((c) => c.id === value)?.name ?? "All categories"
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={text}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search payee or description"
          aria-label="Search transactions"
          className="pl-8"
        />
      </div>

      <Select
        value={filters.categoryId ?? ANY}
        onValueChange={(value) =>
          push({ cat: !value || value === ANY ? undefined : value })
        }
      >
        <SelectTrigger aria-label="Filter by category" className="w-44">
          <SelectValue>{(value) => categoryLabel(value as string)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All categories</SelectItem>
          <SelectItem value={UNCATEGORIZED}>Uncategorized</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.type ?? ANY}
        onValueChange={(value) =>
          push({ type: !value || value === ANY ? undefined : value })
        }
      >
        <SelectTrigger aria-label="Filter by type" className="w-32">
          <SelectValue>
            {(value) =>
              value === "income"
                ? "Income"
                : value === "expense"
                  ? "Expenses"
                  : "All types"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All types</SelectItem>
          <SelectItem value="expense">Expenses</SelectItem>
          <SelectItem value="income">Income</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={sortValue}
        onValueChange={(value) => {
          if (!value) return
          const [sort, dir] = value.split(":")
          // The default ordering needs no params in the URL.
          const isDefault = sort === "date" && dir === "desc"
          push({
            sort: isDefault ? undefined : sort,
            dir: isDefault ? undefined : dir,
          })
        }}
      >
        <SelectTrigger aria-label="Sort transactions" className="w-40">
          <SelectValue>
            {(value) =>
              SORTS.find((s) => s.value === value)?.label ?? "Newest first"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORTS.map((sort) => (
            <SelectItem key={sort.value} value={sort.value}>
              {sort.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {active && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="size-4" />
          Clear
        </Button>
      )}
    </div>
  )
}
