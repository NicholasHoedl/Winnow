"use client"

import * as React from "react"
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

/**
 * One draggable row. The handle is a real button, not the whole row — dragging the row
 * itself would swallow the taps and clicks inside it, and on touch there is no hover
 * state to disambiguate the two.
 */
function SortableRow({
  id,
  label,
  children,
}: {
  id: string
  /** Names the thing being moved, for the handle's accessible name. */
  label: string
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
    >
      {/* items-start, not items-center: an item can be tall (a task with its checklist
          expanded), and centring drops the handle level with the middle of the card
          instead of the row it belongs to. The padding lines it up with the first line. */}
      <div className="flex items-start gap-1">
        <button
          type="button"
          // dnd-kit's keyboard sensor drives reordering from this button: space to lift,
          // arrows to move, space to drop. That is the entire reason this is a dependency
          // rather than hand-rolled pointer handlers — see ADR-0006.
          aria-label={`Reorder ${label}`}
          className="text-muted-foreground/40 hover:text-muted-foreground focus-visible:ring-ring mt-3.5 shrink-0 cursor-grab touch-none rounded p-1 focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

/**
 * A drag-reorderable vertical list. Used for tasks within a date section and for goals.
 *
 * Each rendered instance is its own DndContext, which is what keeps a to-do section
 * self-contained: dragging a task into a neighbouring section would have to rewrite its
 * due date, which is drag-to-reschedule — a different feature the calendar tranche owns.
 * `restrictToParentElement` enforces that physically rather than by convention, so a row
 * can't be dropped somewhere it would silently snap back from.
 *
 * See ADR-0006 for why @dnd-kit rather than native drag or a hand-rolled implementation.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  labelFor,
  renderItem,
  layout = "list",
  className = "flex flex-col gap-2",
}: {
  items: T[]
  onReorder: (ids: string[]) => void
  /** Names an item for its drag handle's accessible name. */
  labelFor: (item: T) => string
  renderItem: (item: T) => React.ReactNode
  /**
   * `"list"` is a single column and constrains dragging to the vertical axis. `"grid"`
   * is for a wrapping multi-column layout, where locking the axis would make half the
   * positions unreachable.
   */
  layout?: "list" | "grid"
  /** Container classes — must match the layout (a flex column, or a grid).  */
  className?: string
}) {
  const sensors = useSensors(
    // A small distance threshold so a tap on the handle still behaves like a tap and
    // only a deliberate drag starts one.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  /**
   * What a screen reader actually hears. dnd-kit's DEFAULT announcements read out the
   * item's id — "Draggable item 224f524e-d876-4768-… was moved over droppable area
   * 224f524e-…" — which for uuid keys is useless noise. Since the keyboard/screen-reader
   * path is half the reason this dependency was taken at all (ADR-0006), leaving the
   * default in place would have quietly voided that argument.
   */
  const nameOf = (id: string | number) =>
    items.find((item) => item.id === String(id))
      ? labelFor(items.find((item) => item.id === String(id))!)
      : "item"
  const positionOf = (id: string | number) =>
    items.findIndex((item) => item.id === String(id)) + 1

  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      `Picked up ${nameOf(active.id)}, position ${positionOf(active.id)} of ${items.length}.`,
    // Returning undefined skips the announcement. dnd-kit fires onDragOver immediately
    // after onDragStart with the item over ITSELF, which otherwise announces a move that
    // hasn't happened and overwrites "Picked up …" before it can be read.
    onDragOver: ({
      active,
      over,
    }: {
      active: { id: string | number }
      over: { id: string | number } | null
    }) => {
      if (!over) return "Moved outside the list."
      if (over.id === active.id) return undefined
      return `Moved to position ${positionOf(over.id)} of ${items.length}.`
    },
    onDragEnd: ({
      active,
      over,
    }: {
      active: { id: string | number }
      over: { id: string | number } | null
    }) =>
      over
        ? `Dropped ${nameOf(active.id)} at position ${positionOf(over.id)} of ${items.length}.`
        : `Dropped ${nameOf(active.id)}. Position unchanged.`,
    onDragCancel: ({ active }: { active: { id: string | number } }) =>
      `Cancelled. ${nameOf(active.id)} returned to position ${positionOf(active.id)}.`,
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = items.findIndex((item) => item.id === active.id)
    const to = items.findIndex((item) => item.id === over.id)
    if (from < 0 || to < 0) return
    onReorder(arrayMove(items, from, to).map((item) => item.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={
        layout === "grid"
          ? [restrictToParentElement]
          : [restrictToVerticalAxis, restrictToParentElement]
      }
      onDragEnd={handleDragEnd}
      accessibility={{ announcements }}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={
          layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy
        }
      >
        <div className={className}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id} label={labelFor(item)}>
              {renderItem(item)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
