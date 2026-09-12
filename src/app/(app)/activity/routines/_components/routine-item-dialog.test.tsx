import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { addRoutineItem, updateRoutineItem } from "@/modules/routines/actions"
import type { RoutineItemRow } from "@/modules/routines/queries"
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/preferences"
import { PreferencesProvider } from "@/components/preferences/preferences-provider"

import { RoutineItemDialog } from "./routine-item-dialog"

// `"use server"` — see the note in `transaction-dialog.test.tsx`.
vi.mock("@/modules/routines/actions", () => ({
  addRoutineItem: vi.fn(),
  updateRoutineItem: vi.fn(),
}))

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
)
vi.mock("sonner", () => ({ toast }))

const LIST_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_LIST_ID = "22222222-2222-4222-8222-222222222222"
const LISTS = [
  { id: LIST_ID, name: "Errands" },
  { id: OTHER_LIST_ID, name: "Home" },
]

/** Only the columns the dialog reads — see the note in `transaction-dialog.test.tsx`. */
function item(over: Record<string, unknown> = {}): RoutineItemRow {
  return {
    id: "item-1",
    routineId: "routine-1",
    title: "Book the kennel",
    notes: null,
    dueOffsetDays: -3,
    priority: "low",
    listId: null,
    ...over,
  } as unknown as RoutineItemRow
}

function show(
  props: Partial<React.ComponentProps<typeof RoutineItemDialog>> = {},
  preferences: Partial<UserPreferences> = {},
) {
  return render(
    <PreferencesProvider value={{ ...DEFAULT_PREFERENCES, ...preferences }}>
      <RoutineItemDialog
        routineId="routine-1"
        item={null}
        lists={LISTS}
        open
        onOpenChange={vi.fn()}
        {...props}
      />
    </PreferencesProvider>,
  )
}

/**
 * A routine item becomes a task when the routine runs, so the two dialogs should ask for
 * the same thing in the same way. This one hard-coded "medium" and no list while the task
 * dialog had been reading the Defaults settings since T6.
 */
describe("RoutineItemDialog", () => {
  beforeEach(() => {
    vi.mocked(addRoutineItem).mockReset()
    vi.mocked(updateRoutineItem).mockReset()
    toast.error.mockReset()
    toast.success.mockReset()
  })

  it("opens a new item on the default priority and list", async () => {
    vi.mocked(addRoutineItem).mockResolvedValue({ ok: true })
    show({}, { defaultTaskPriority: "high", defaultListId: LIST_ID })

    expect(screen.getByLabelText("Priority")).toHaveTextContent("High")
    expect(screen.getByLabelText("List")).toHaveTextContent("Errands")

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Book the kennel" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => expect(addRoutineItem).toHaveBeenCalledTimes(1))
    expect(vi.mocked(addRoutineItem).mock.calls[0][1]).toMatchObject({
      priority: "high",
      listId: LIST_ID,
    })
  })

  // base-ui's SelectValue needs a function child; a bare one renders the raw stored
  // value, so this trigger read "medium" while the List beside it read "No list".
  it("names the priority rather than showing its stored value", () => {
    show()

    expect(screen.getByLabelText("Priority")).toHaveTextContent("Medium")
  })

  it("keeps an existing item's own priority and list when editing", () => {
    show(
      { item: item({ priority: "low", listId: null }) },
      { defaultTaskPriority: "high", defaultListId: LIST_ID },
    )

    expect(screen.getByLabelText("Priority")).toHaveTextContent("Low")
    expect(screen.getByLabelText("List")).toHaveTextContent("No list")
  })
})
