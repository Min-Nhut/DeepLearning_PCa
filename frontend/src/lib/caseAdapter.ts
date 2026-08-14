import type { ApiCase, Case, GleasonPattern } from '../types';

/**
 * Adapts a real backend case into the `Case` shape the existing UI (CaseRow,
 * Cases/CaseDetail/DoctorDashboard) already knows how to render. `dbId` (here
 * and on slides/images) carries the real numeric id through for API calls the
 * mock data never needed.
 *
 * The summary fields are passed through, never invented: a case with no
 * confirmed review has no score, and the confidence is the model's own.
 */
export function caseFromApi(c: ApiCase): Case {
  return {
    id: `PA-${c.case_year ?? '----'}-${c.case_code.padStart(4, '0')}`,
    dbId: c.id,
    maSo: c.case_code,
    maNam: c.case_year ?? '',
    hoTen: c.patient_name ?? '(chưa nhập họ tên)',
    tuoi: c.patient_age ?? '',
    ketLuan: c.conclusion ?? '',
    ngayTao: formatDate(c.created_at),
    status: c.status,
    gleason: gleasonOf(c),
    primary: (c.primary_pattern as Case['primary']) ?? null,
    secondary: (c.secondary_pattern as Case['secondary']) ?? null,
    gleasonScore:
      c.primary_pattern != null && c.secondary_pattern != null
        ? `${c.primary_pattern}+${c.secondary_pattern}=${c.total_score}`
        : null,
    confidence: c.ai_confidence != null ? Math.round(c.ai_confidence) : null,
    isupGrade: c.isup_grade ?? null,
    isupConfidence: c.isup_confidence != null ? Math.round(c.isup_confidence) : null,
    slides: c.slides
      .slice()
      .sort((a, b) => a.slide_number - b.slide_number)
      .map((s) => ({
        id: `S${s.slide_number}`,
        dbId: s.id,
        label: s.legacy_slide_label ?? `Slide ${s.slide_number}`,
        images: s.images
          .slice()
          .sort((a, b) => a.image_number - b.image_number)
          .map((im) => ({
            id: `H${im.image_number}`,
            dbId: im.id,
            desc: im.description ?? '',
            magnification: im.magnification,
          })),
      })),
  };
}

function gleasonOf(c: ApiCase): GleasonPattern | null {
  if (c.primary_pattern != null) return String(c.primary_pattern) as GleasonPattern;
  return c.images_confirmed > 0 ? 'benign' : null;
}

function formatDate(iso: string): string {
  // Backend timestamps are "YYYY-MM-DD HH:MM:SS" (SQLite datetime('now')).
  const datePart = iso.split(' ')[0];
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
