import type { Case } from '../types';

/**
 * The two quick filters on the case list. They live here rather than inside
 * Cases.tsx so they can be tested as plain functions — the week boundary and
 * the "no score means unknown, not low grade" rule are both easy to get subtly
 * wrong, and both were previously not implemented at all (the chips were
 * decorative).
 */

/** Monday 00:00 of the current week — "tuần này" in the calendar sense, not
 *  "the last 7 days". `now` is injectable so the boundary can be tested. */
export function startOfWeek(now: Date = new Date()): Date {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7));
  return monday;
}

/** `ngayTao` is already formatted dd/mm/yyyy for display; day granularity is
 *  all this filter needs, so it is parsed back rather than carrying a second
 *  copy of the timestamp through the adapter. */
export function createdOn(c: Pick<Case, 'ngayTao'>): Date | null {
  const [d, m, y] = c.ngayTao.split('/').map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

/** Gleason ≥ 7 across the case's confirmed reviews. A case nobody has signed
 *  off has no score at all — that is unknown, not "below 7", so it is excluded
 *  rather than assumed benign. The UI says so next to the chip. */
export function hasHighGradeScore(c: Pick<Case, 'primary' | 'secondary'>): boolean {
  return c.primary != null && c.secondary != null && c.primary + c.secondary >= 7;
}

export function createdSince(c: Pick<Case, 'ngayTao'>, since: Date): boolean {
  const created = createdOn(c);
  return created != null && created >= since;
}
