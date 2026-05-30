/** Validates a person's name: 3–50 chars, letters/spaces/dots/hyphens/apostrophes, starts & ends with a letter, no consecutive specials, min 3 letters. */
export function validateName(name: string): string | null {
  const t = name.trim()
  const valid =
    t.length >= 3 &&
    t.length <= 50 &&
    /^[a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F .'\\-]*[a-zA-Z\u0900-\u097F]$/.test(t) &&
    !/[ .'\\-]{2,}/.test(t) &&
    (t.match(/[a-zA-Z\u0900-\u097F]/g) ?? []).length >= 3
  return valid
    ? null
    : 'Enter a valid name (3-50 letters; only spaces, dots, hyphens, apostrophes allowed).'
}
