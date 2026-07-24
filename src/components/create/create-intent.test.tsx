import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import {
  type CreateIntent,
  type CreateKind,
  CreateIntentProvider,
  useCreateIntent,
  useCreateIntentListener,
} from "./create-intent"

function Producer() {
  const requestCreate = useCreateIntent()
  return (
    <button
      onClick={() =>
        requestCreate({ kind: "task", text: "call mom", date: "2026-07-25" })
      }
    >
      fire task
    </button>
  )
}

function Listener({
  kind,
  onIntent,
}: {
  kind: CreateKind
  onIntent: (intent: CreateIntent) => void
}) {
  useCreateIntentListener(kind, onIntent)
  return null
}

describe("create-intent bus", () => {
  it("delivers an intent (with text + date) to a matching-kind listener", () => {
    const onTask = vi.fn()
    render(
      <CreateIntentProvider>
        <Producer />
        <Listener kind="task" onIntent={onTask} />
      </CreateIntentProvider>
    )

    fireEvent.click(screen.getByText("fire task"))

    expect(onTask).toHaveBeenCalledTimes(1)
    expect(onTask).toHaveBeenCalledWith({
      kind: "task",
      text: "call mom",
      date: "2026-07-25",
    })
  })

  it("does not deliver to a listener of a different kind", () => {
    const onEvent = vi.fn()
    render(
      <CreateIntentProvider>
        <Producer />
        <Listener kind="event" onIntent={onEvent} />
      </CreateIntentProvider>
    )

    fireEvent.click(screen.getByText("fire task"))

    expect(onEvent).not.toHaveBeenCalled()
  })

  it("stops delivering after a listener unmounts", () => {
    const onTask = vi.fn()

    function Harness() {
      const [mounted, setMounted] = React.useState(true)
      return (
        <>
          <Producer />
          {mounted && <Listener kind="task" onIntent={onTask} />}
          <button onClick={() => setMounted(false)}>unmount</button>
        </>
      )
    }

    render(
      <CreateIntentProvider>
        <Harness />
      </CreateIntentProvider>
    )

    fireEvent.click(screen.getByText("fire task"))
    expect(onTask).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText("unmount"))
    fireEvent.click(screen.getByText("fire task"))
    expect(onTask).toHaveBeenCalledTimes(1) // no further delivery
  })

  it("throws when the producer hook is used outside a provider", () => {
    // The uncaught render error is expected; keep it out of the test log.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    function Bare() {
      useCreateIntent()
      return null
    }

    expect(() => render(<Bare />)).toThrow(/CreateIntentProvider/)
    spy.mockRestore()
  })
})
