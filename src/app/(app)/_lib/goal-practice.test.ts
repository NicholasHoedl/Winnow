import { describe, expect, it } from "vitest"

import { groupPracticeByGoal } from "./goal-practice"

const goal = (id: string) => ({ id, title: id })
const habit = (id: string, goalId: string | null) => ({ id, goalId })

describe("groupPracticeByGoal", () => {
  it("puts each habit under the goal it serves", () => {
    const groups = groupPracticeByGoal(
      [goal("kanji"), goal("belt")],
      [habit("words", "kanji"), habit("class", "belt"), habit("deck", "kanji")],
    )

    expect(groups).toHaveLength(2)
    expect(groups[0].goal?.id).toBe("kanji")
    expect(groups[0].habits.map((h) => h.id)).toEqual(["words", "deck"])
    expect(groups[1].habits.map((h) => h.id)).toEqual(["class"])
  })

  it("follows the goals' own order, not the order habits appear", () => {
    // The distinction from `buildTodayAgenda`, which groups by first appearance. A goal has
    // its own position — `[sortOrder, createdAt]`, written by a drag on /goals — and a card
    // that reordered goals to match whichever habit happened to come first would undo it.
    const groups = groupPracticeByGoal(
      [goal("first"), goal("second")],
      [habit("b", "second"), habit("a", "first")],
    )

    expect(groups.map((g) => g.goal?.id)).toEqual(["first", "second"])
  })

  it("keeps a goal with no habits at all", () => {
    // This is a goals card that shows practice, not a habits card that mentions goals — a
    // goal you have not attached anything to is still a goal you are working on.
    const groups = groupPracticeByGoal(
      [goal("kanji"), goal("untouched")],
      [habit("words", "kanji")],
    )

    expect(groups).toHaveLength(2)
    expect(groups[1].goal?.id).toBe("untouched")
    expect(groups[1].habits).toEqual([])
  })

  it("groups unattached habits last, under no goal", () => {
    const groups = groupPracticeByGoal(
      [goal("kanji")],
      [habit("walk", null), habit("words", "kanji")],
    )

    expect(groups).toHaveLength(2)
    expect(groups[1].goal).toBeNull()
    expect(groups[1].habits.map((h) => h.id)).toEqual(["walk"])
  })

  it("omits the unattached group entirely when there is nothing in it", () => {
    const groups = groupPracticeByGoal(
      [goal("kanji")],
      [habit("words", "kanji")],
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].goal?.id).toBe("kanji")
  })

  it("treats a habit pointing at an unknown goal as unattached", () => {
    // Rather than dropping it. A habit that vanishes from every surface because its goal id
    // no longer resolves is the worst outcome available — you would have no way to find it
    // and no reason to look. Degrading to the loose group matches what the agenda does with
    // a routine it cannot name.
    const groups = groupPracticeByGoal(
      [goal("kanji")],
      [habit("orphan", "deleted")],
    )

    expect(groups[groups.length - 1].goal).toBeNull()
    expect(groups[groups.length - 1].habits.map((h) => h.id)).toEqual([
      "orphan",
    ])
  })

  it("returns nothing at all for no goals and no habits", () => {
    expect(groupPracticeByGoal([], [])).toEqual([])
  })
})
