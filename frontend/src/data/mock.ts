import type { PipelineStep, Region } from '../types';

// REGIONS/PIPELINE are ported from the ProstaAI.dc.html mockup and still
// power Viewer/Pipeline (mock-only pages — see CLAUDE.md's scope boundary).
// The mockup's CASES/USERS/LOG/MODELS mock data has all been removed now
// that Cases/CaseDetail/CaseForm/Upload and the Admin screens call the real
// backend (see src/lib/api.ts, src/lib/caseAdapter.ts).

export const REGIONS: Region[] = [
  { id: 'R1', pattern: '4', x: 22, y: 28, w: 26, h: 22, conf: 94 },
  { id: 'R2', pattern: '4', x: 55, y: 20, w: 18, h: 20, conf: 89 },
  { id: 'R3', pattern: '3', x: 30, y: 58, w: 22, h: 24, conf: 91 },
  { id: 'R4', pattern: '3', x: 62, y: 60, w: 20, h: 22, conf: 86 },
  { id: 'R5', pattern: '5', x: 44, y: 44, w: 14, h: 14, conf: 77 },
];

export const PIPELINE: PipelineStep[] = [
  ['Image Acquisition', 'Nhận ảnh vi trường H&E', 'image'],
  ['Preprocessing', 'Chuẩn hóa màu Macenko', 'wand-2'],
  ['Tissue Detection', 'Tách vùng mô khỏi nền', 'scan-line'],
  ['Gland Segmentation', 'Mặt nạ vùng nghi ngờ (ResNeXt50)', 'git-fork'],
  ['Gleason Classification', 'Phân loại Pattern 3/4/5', 'grid-2x2'],
  ['Score Aggregation', 'Tổng hợp Primary + Secondary → ISUP', 'calculator'],
  ['Visualization', 'Sinh overlay + heatmap', 'layers'],
];

export function grade(p: number | null, s: number | null): number {
  const t = (p || 0) + (s || 0);
  if (t <= 6) return 1;
  if (p === 3 && s === 4) return 2;
  if (p === 4 && s === 3) return 3;
  if (t === 8) return 4;
  return 5;
}
