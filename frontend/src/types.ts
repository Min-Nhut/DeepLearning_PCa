// Domain types for the ProstaAI frontend prototype.
// Field names follow the Vietnamese labels used throughout the UI mockup;
// the comment on each field notes the corresponding `schema.sql` column so
// wiring this up to the real FastAPI backend later is a straight mapping.

export type GleasonPattern = '3' | '4' | '5' | 'benign';

export interface CaseImage {
  id: string; // display label, "H{image_number}"
  desc: string; // images.description
  dbId?: number; // real images.id — present once backed by the real API (see lib/caseAdapter.ts)
}

export interface CaseSlide {
  id: string; // display label, "S{slide_number}"
  label: string; // derived from slides.slide_number
  images: CaseImage[];
  dbId?: number; // real slides.id
}

// Case/Slide/Image base fields are wired to the real backend (see lib/caseAdapter.ts,
// lib/api.ts); the AI-derived fields below (status/gleason/primary/.../regionsCount)
// stay null/placeholder for real cases until the AI pipeline exists — Viewer/Pipeline/
// Report still render off these as mock-only screens, see CLAUDE.md.
export interface Case {
  id: string; // display case id, e.g. "PA-2026-0142"
  maSo: string; // cases.case_code
  maNam: string; // cases.case_year
  hoTen: string; // cases.patient_name
  tuoi: number | ''; // cases.patient_age
  ketLuan: string; // cases.conclusion
  ngayTao: string; // cases.created_at (dd/mm/yyyy)
  status: 'new' | 'processing' | 'review' | 'reviewed';
  gleason: GleasonPattern | null; // classification_results summary
  primary: 3 | 4 | 5 | null; // classification_results.primary_pattern
  secondary: 3 | 4 | 5 | null; // classification_results.secondary_pattern
  confidence: number | null; // classification_results.primary_confidence (%)
  tumorArea: string; // segmentation_results.cancer_area_px (formatted)
  regionsCount: number;
  slides: CaseSlide[];
  dbId?: number; // real cases.id — present once backed by the real API
}

export interface Region {
  id: string;
  pattern: Exclude<GleasonPattern, null>;
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

export type PipelineStep = [name: string, description: string, icon: string];

export type Role = 'doctor' | 'admin';

export type Nav =
  | 'dashboard' | 'cases' | 'caseDetail' | 'caseForm' | 'upload' | 'pipeline' | 'viewer' | 'report'
  | 'annotate'
  | 'adashboard' | 'alog' | 'models' | 'users' | 'migration' | 'library';

export interface ReviewFields {
  pni?: boolean;
  lvi?: boolean;
  note?: string;
}

// ---------------------------------------------------------------------------
// Backend API types — field names copied 1:1 from backend/app/schemas.py.
// Used by the Admin screens, which are wired to the real backend (unlike the
// Case/mock types above, still used by the not-yet-backed doctor screens).
// ---------------------------------------------------------------------------

export type ApiRole = 'user' | 'admin';

export interface MeResponse {
  id: number;
  username: string;
  full_name: string | null;
  role: ApiRole;
  is_active: boolean;
}

export interface ApiUser {
  id: number;
  username: string;
  full_name: string | null;
  role: ApiRole;
  is_active: boolean;
  run_count: number;
  last_activity: string | null;
}

export interface AdminStats {
  total_cases: number;
  active_users: number;
  avg_processing_seconds: number | null;
  pipeline_error_rate: number | null;
}

export interface LogEntryApi {
  id: number;
  created_at: string;
  username: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: string | null;
}

export interface ModelMetricApi {
  name: string;
  value: string;
}

export interface ModelInfoApi {
  name: string;
  task: string;
  encoder: string;
  version: string;
  trained_at: string;
  status: string;
  metrics: ModelMetricApi[];
}

export interface MigrationPreview {
  columns: string[];
  row_count: number;
  field_mapping: Record<string, string>;
  unmapped_columns: string[];
}

export interface MigrationImportResult {
  imported: number;
  skipped: number;
  skipped_reasons: string[];
}

// ---------- cases / slides / images (backend/app/schemas.py) ----------
export interface ApiImage {
  id: number;
  slide_id: number;
  image_number: number;
  description: string | null;
  width_px: number | null;
  height_px: number | null;
  format: string | null;
  source: 'upload' | 'live_capture' | 'legacy_import';
  created_at: string;
}

export interface ApiSlide {
  id: number;
  case_id: number;
  slide_number: number;
  images: ApiImage[];
}

// ---------- manual annotations (backend/app/schemas.py) ----------
export interface Point {
  x: number;
  y: number;
}

export interface ApiAnnotation {
  id: number;
  image_id: number;
  points: Point[];
  gleason_pattern: 3 | 4 | 5 | null;
  note: string | null;
  area_percentage: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApiCase {
  id: number;
  case_code: string;
  case_year: string | null;
  patient_name: string | null;
  patient_age: number | null;
  conclusion: string | null;
  is_anonymized: boolean;
  source: string;
  created_at: string;
  updated_at: string;
  slides: ApiSlide[];
}
