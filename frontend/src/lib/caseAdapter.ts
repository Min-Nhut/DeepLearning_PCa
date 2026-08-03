import type { ApiCase, Case } from '../types';

/**
 * Adapts a real backend case into the `Case` shape the existing UI (CaseRow,
 * Cases/CaseDetail/DoctorDashboard) already knows how to render. AI-derived
 * fields (gleason/primary/.../regionsCount) have no backing data yet — they
 * stay null/placeholder until the AI pipeline exists, matching CLAUDE.md's
 * documented scope boundary. `dbId` (here and on slides/images) carries the
 * real numeric id through for API calls the mock data never needed.
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
    status: 'new',
    gleason: null,
    primary: null,
    secondary: null,
    confidence: null,
    tumorArea: '—',
    regionsCount: 0,
    slides: c.slides
      .slice()
      .sort((a, b) => a.slide_number - b.slide_number)
      .map((s) => ({
        id: `S${s.slide_number}`,
        dbId: s.id,
        label: `Slide ${s.slide_number}`,
        images: s.images
          .slice()
          .sort((a, b) => a.image_number - b.image_number)
          .map((im) => ({
            id: `H${im.image_number}`,
            dbId: im.id,
            desc: im.description ?? '',
          })),
      })),
  };
}

function formatDate(iso: string): string {
  // Backend timestamps are "YYYY-MM-DD HH:MM:SS" (SQLite datetime('now')).
  const datePart = iso.split(' ')[0];
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
