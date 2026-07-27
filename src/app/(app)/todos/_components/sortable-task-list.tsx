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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

import type { TaskWithSeries } from "@/modules/todos/queries"

/**
 * One draggable row. The handle is a real button, not the whole card — dragging the card
 * would swallow the taps that toggle a task, and on touch there is no hover to disambiguate.
 */
function SortableRow({
  task,
  children,
}: {
  task: TaskWithSeries
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          // dnd-kit's keyboard sensor drives reordering from this button: space to lift,
          // arrows to move, space to drop. That is the entire reason this is a dependency
          // rather than hand-rolled pointer handlers — see ADR-0006.
          aria-label={`Reorder ${task.title}`}
          className="text-muted-foreground/40 hover:text-muted-foreground focus-visible:ring-ring shrink-0 cursor-grab touch-none rounded p-1 focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing"
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
 * A drag-reorderable list of tasks, scoped to ONE date section.
 *
 * Sections are separate contexts on purpose: dragging between them would have to rewrite
 * the task's due date, which is drag-to-reschedule — a different feature, and one the
 * calendar tranche owns. `restrictToParentElement` enforces that physically, so a row
 * can't be dropped into a neighbouring section and silently snap back.
 */
export function SortableTaskList({
  tasks,
  onReorder,
  renderTask,
}: {
  tasks: TaskWithSeries[]
  onReorder: (ids: string[]) => void
  renderTask: (task: TaskWithSeries) => React.ReactNode
}) {
  const sensors = useSensors(
    // A small distance threshold so a tap on the handle still behaves like a tap and
    // only a deliberate drag starts one.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = tasks.findIndex((task) => task.id === active.id)
    const to = tasks.findIndex((task) => task.id === over.id)
    if (from < 0 || to < 0) return
    onReorder(arrayMove(tasks, from, to).map((task) => task.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <SortableRow key={task.id} task={task}>
              {renderTask(task)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
