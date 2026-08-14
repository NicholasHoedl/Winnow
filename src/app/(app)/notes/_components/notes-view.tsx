"use client"

import * as React from "react"
import {
  MoreVertical,
  NotebookPen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { deleteNote, restoreNote, setNotePinned } from "@/modules/notes/actions"
import type { NoteRow } from "@/modules/notes/queries"
import { excerpt, groupNotes, noteTitle } from "@/modules/notes/service"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { formatEntryDate } from "./format"
import { NoteEditorDialog } from "./note-editor-dialog"

const EXCERPT_CHARS = 180

type EditorTarget = { note: NoteRow | null; entryDate: string | null }

function NoteCard({
  note,
  onEdit,
}: {
  note: NoteRow
  onEdit: (target: EditorTarget) => void
}) {
  const [busy, startTransition] = React.useTransition()

  // Deleting a note is cleanly reversible — `restoreNote` puts every column back,
  // timestamps included — so this offers undo rather than a confirm step, the same call
  // goals makes for a milestone.
  function remove() {
    startTransition(async () => {
      const result = await deleteNote(note.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const restorable = result.note ?? note
      toast("Note deleted", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const restored = await restoreNote(restorable)
              if (!restored.ok) toast.error(restored.error)
            }),
        },
      })
    })
  }

  function togglePin() {
    startTransition(async () => {
      const result = await setNotePinned(note.id, !note.pinned)
      if (!result.ok) toast.error(result.error)
    })
  }

  const preview = excerpt(note.body, EXCERPT_CHARS)
  const heading = noteTitle(note)

  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{heading}</h3>
          {note.entryDate && (
            <p className="text-muted-foreground text-xs">
              {formatEntryDate(note.entryDate)}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${heading}`}
                aria-busy={busy}
              />
            }
          >
            {/* Pinning is the reason this is here: the menu closes, then the card
                physically MOVES between the pinned and unpinned sections after a full
                round trip, with nothing on screen changing in between. The flag also
                covers delete, which is honest — it is one transition. */}
            {busy ? (
              <Spinner className="size-4" />
            ) : (
              <MoreVertical className="size-4" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onEdit({ note, entryDate: note.entryDate })}
            >
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            {/* Journal entries are ordered by their date, so pinning one would list it
                twice — the control is only meaningful on a free-form note. */}
            {!note.entryDate && (
              <DropdownMenuItem onClick={togglePin}>
                {note.pinned ? (
                  <PinOff className="size-4" />
                ) : (
                  <Pin className="size-4" />
                )}
                {note.pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={remove}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {preview && (
        <p className="text-muted-foreground line-clamp-3 text-sm">{preview}</p>
      )}
    </div>
  )
}

function Section({
  title,
  notes,
  onEdit,
}: {
  title: string
  notes: NoteRow[]
  onEdit: (target: EditorTarget) => void
}) {
  if (notes.length === 0) return null
  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} onEdit={onEdit} />
        ))}
      </div>
    </section>
  )
}

export function NotesView({
  notes,
  today,
}: {
  notes: NoteRow[]
  today: string
}) {
  const [open, setOpen] = React.useState(false)
  // Kept when the dialog closes rather than cleared: nulling it here would swap the
  // dialog's contents out mid-exit-animation.
  const [target, setTarget] = React.useState<EditorTarget>({
    note: null,
    entryDate: null,
  })

  function openEditor(next: EditorTarget) {
    setTarget(next)
    setOpen(true)
  }

  const { journal, pinned, other } = groupNotes(notes)
  const todayEntry = notes.find((note) => note.entryDate === today) ?? null

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      {/* Stacked below 640px: two buttons plus a heading squeezed the description into
          three lines on a phone. */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Free-form notes, and one journal entry a day.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => openEditor({ note: todayEntry, entryDate: today })}
          >
            <NotebookPen className="size-4" />
            {todayEntry ? "Today's entry" : "Write today"}
          </Button>
          <Button onClick={() => openEditor({ note: null, entryDate: null })}>
            <Plus className="size-4" />
            New note
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          Nothing written down yet.
        </div>
      ) : (
        <div className="space-y-8">
          <Section title="Journal" notes={journal} onEdit={openEditor} />
          <Section title="Pinned" notes={pinned} onEdit={openEditor} />
          <Section title="Notes" notes={other} onEdit={openEditor} />
        </div>
      )}

      <NoteEditorDialog
        note={target.note}
        entryDate={target.entryDate}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  )
}
