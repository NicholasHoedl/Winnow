/**
 * `#tag` in a quick-add line — the budget's `#category` and a task's `#list` share it.
 *
 * One matcher, so a tag means the same thing on every capture surface: `#` followed by
 * letters, digits, `_` or `-`, which is enough for a name typed as one word and stops at
 * the first space. Each parser decides for itself what the word resolves against, and
 * both strip it from the text whether or not it resolved — a `#` is an instruction, not a
 * word, and leaving an unmatched one behind would make it sometimes one and sometimes the
 * other.
 */
export const TAG = /#([\p{L}\p{N}_-]+)/u

/** Remove non-overlapping [start, end) ranges from `text`, joining the gaps. */
export function stripSpans(
  text: string,
  spans: Array<[number, number]>,
): string {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  let out = ""
  let cursor = 0
  for (const [start, end] of sorted) {
    if (start < cursor) continue
    out += text.slice(cursor, start)
    cursor = end
  }
  return out + text.slice(cursor)
}

/**
 * A name or a tag, as the thing it is matched by: case-folded, with runs of spaces,
 * underscores and hyphens read as one hyphen — so `#home-projects` and `#Home_projects`
 * both find "Home projects". A tag cannot contain a space, and a list name usually does.
 */
export function tagKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
}
