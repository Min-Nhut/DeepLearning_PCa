// The mockup's CASES/USERS/LOG/MODELS/REGIONS/PIPELINE sample data has all
// been removed now that Cases/CaseDetail/CaseForm/Upload, the Admin screens,
// and Pipeline/Viewer/Report all call the real backend (see src/lib/api.ts,
// src/lib/caseAdapter.ts). `grade()` is a real ISUP formula (not sample
// data) — it mirrors `_grade_group()` in backend/app/routers/reviews.py.

export function grade(p: number | null, s: number | null): number {
  const t = (p || 0) + (s || 0);
  if (t <= 6) return 1;
  if (p === 3 && s === 4) return 2;
  if (p === 4 && s === 3) return 3;
  if (t === 8) return 4;
  return 5;
}
