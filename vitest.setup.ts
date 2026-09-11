import "@testing-library/jest-dom/vitest"

// jsdom has no PointerEvent, and base-ui's pointer-driven controls — the Checkbox, the
// Select trigger — construct one on click. Without this a `fireEvent.click` on a checkbox
// throws "PointerEvent is not a constructor" from inside React's event dispatch and the
// toggle never happens (found by `import-proposal.test.tsx`, T33). A MouseEvent carrying
// the pointer fields is all the library reads.
if (
  typeof window !== "undefined" &&
  typeof window.PointerEvent === "undefined"
) {
  class PointerEvent extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? "mouse"
      this.isPrimary = init.isPrimary ?? true
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    value: PointerEvent,
    writable: true,
    configurable: true,
  })
}
