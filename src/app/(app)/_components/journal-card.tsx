import Link from "next/link"
import { NotebookPen } from "lucide-react"

import type { NoteRow } from "@/modules/notes/queries"
import { excerpt } from "@/modules/notes/service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Today's journal entry, or a prompt to write one.
 *
 * Unlike `GoalsSummary`, this renders when it is empty rather than hiding: an empty goals
 * list means "you have no goals", which is not worth a card, but an empty journal means
 * "you haven't written today", which is the entire thing the card is for.
 */
export function JournalCard({ entry }: { entry: NoteRow | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Journal</span>
          <Link
            href="/notes"
            className="text-muted-foreground hover:text-foreground text-xs font-normal underline-offset-4 hover:underline"
          >
            All →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entry ? (
          <p className="text-muted-foreground line-clamp-3 text-sm">
            {excerpt(entry.body, 200)}
          </p>
        ) : (
          <Link
            href="/notes"
            className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm"
          >
            <NotebookPen className="size-4" />
            Write today&apos;s entry
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
