// About this file: the server-side entry point to the bundled reference foods, which the
// Meals food search and the quick-add bar use to look up foods by name.
//
// What you'll find here:
// - `FOODS`, `INDEX`, `BY_ID`: the decoded foods, their search index, a map by id.
// - `REFERENCE_SOURCE`: the dataset's source, for attribution.
// - `findReferenceFoods`: the foods matching a search query, six at most by default.
// - `getReferenceFood`: one food by its id, or null.
// - `resolveReferenceFood`: the single food a name clearly refers to, or null.
//
// Related: `actions.ts`, whose `searchReferenceFoods` and `logReferenceFood` use this.

import "server-only"

// The bundled reference foods, loaded once per server process. `server-only` because the
// file is about two megabytes, which is fine in a server bundle and not something to send
// to a phone on every visit to /meals; the dialog asks through a Server Action instead.
// The pure parts — the shape, the scorer, the scaling — live in `reference-foods.ts`.

import raw from "./reference/sr-legacy.json"
import {
  bestReferenceFood,
  buildReferenceIndex,
  decodeReferenceFoods,
  searchReferenceFoods,
  type ReferenceFile,
  type ReferenceFood,
} from "./reference-foods"

const FILE = raw as ReferenceFile
const FOODS = decodeReferenceFoods(FILE)
const INDEX = buildReferenceIndex(FOODS)
const BY_ID = new Map(FOODS.map((food) => [food.id, food]))

/** Where the figures came from, for the attribution line. */
export const REFERENCE_SOURCE = FILE.source

export function findReferenceFoods(query: string, limit = 6): ReferenceFood[] {
  return searchReferenceFoods(INDEX, query, limit)
}

export function getReferenceFood(id: number): ReferenceFood | null {
  return BY_ID.get(id) ?? null
}

/** The one food a bare name means, or null when the name is not clearly one food. */
export function resolveReferenceFood(name: string): ReferenceFood | null {
  return bestReferenceFood(INDEX, name)
}
