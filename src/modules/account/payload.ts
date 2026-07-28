// The shape of the export/import JSON, in one place.
//
// Client-safe: no `server-only`, no DB imports. It is read by the exporter, the importer,
// the coverage guard and the e2e export spec — four places that have to agree on what a
// backup file looks like, and previously agreed by coincidence.

/**
 * Bumped when the payload shape changes incompatibly.
 *
 * It was a bare literal in the exporter with no writer and no reader until an import
 * existed to have an opinion about it. A file from a future version is refused rather
 * than half-applied.
 */
export const EXPORT_VERSION = 1

/**
 * The key a table appears under in the JSON, where it differs from its drizzle export
 * name. Exactly one does, and it predates all of this.
 *
 * Shared rather than repeated: this fact lived in both `coverage.test.ts` and
 * `e2e/export.spec.ts`, and the importer would have been a third copy — three places to
 * update the day a second exception appears, and nothing to notice if only two are.
 */
export const EXPORT_KEY: Record<string, string> = {
  userPreferences: "preferences",
}

/** The JSON key for a drizzle table export name. */
export function exportKeyFor(exportName: string): string {
  return EXPORT_KEY[exportName] ?? exportName
}
