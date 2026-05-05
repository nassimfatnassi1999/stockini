/**
 * Frontend date utilities — single source of truth for date handling.
 *
 * Rules:
 * - Always work with "YYYY-MM-DD" strings for input[type=date] fields
 * - Always send ISO strings or null to the API (never "Invalid Date", never "")
 * - Display dates in fr-FR locale (DD/MM/YYYY)
 */

/** Returns true only if value is a well-formed, parseable YYYY-MM-DD string. */
export function isValidDateValue(value: unknown): value is string {
  if (!value || typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

/**
 * Converts any date-like value to a YYYY-MM-DD ISO string suitable for the API,
 * or returns null for empty/invalid values.
 */
export function toApiDateOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return !Number.isNaN(new Date(trimmed).getTime()) ? trimmed : null;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Converts any date-like value to the "YYYY-MM-DD" string required by
 * <input type="date" value={...}>.
 * Returns "" (empty string) for null/invalid values so the input shows as empty.
 */
export function formatDateForInput(value: unknown): string {
  if (!value) return '';
  const s =
    typeof value === 'string'
      ? value
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Formats a date for display in the UI (DD/MM/YYYY).
 * Returns "—" for null/invalid values.
 */
export function formatDateForDisplay(value: unknown): string {
  if (!value) return '—';
  const s =
    typeof value === 'string'
      ? value
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
