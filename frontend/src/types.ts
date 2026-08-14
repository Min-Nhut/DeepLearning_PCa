// Domain types for the ProstaAI frontend prototype.
// Field names follow the Vietnamese labels used throughout the UI mockup;
// the comment on each field notes the corresponding `schema.sql` column so
// wiring this up to the real FastAPI backend later is a straight mapping.

export type GleasonPattern = '3' | '4' | '5' | 'benign';

export interface CaseImage {
  id: string; // display label, "H{image_number}"
  desc: string; // images.description
  dbId?: number; // real images.id — present once backed by the real API (see lib/caseAdapter.ts)
  magnification?: string | null; // images.magnification
}

export interface CaseSlide {
  id: string; // display label, "S{slide_number}"
  label: string; // derived from slides.slide_number
  images: CaseImage[];
  dbId?: number; // real slides.id
}

// Every field here is wired to the real backend (see lib/caseAdapter.ts,
// lib/api.ts). The summary fields below are computed per request by the
// backend, not stored — a case that has nothing signed off keeps them null,
// which is how the list renders an honest "—" rather than a made-up grade.
export interface Case {
  id: string; // display case id, e.g. "PA-2026-0142"
  maSo: string; // cases.case_code
  maNam: string; // cases.case_year
  hoTen: string; // cases.patient_name
  tuoi: number | ''; // cases.patient_age
  ketLuan: string; // cases.conclusion
  ngayTao: string; // cases.created_at (dd/mm/yyyy)
  status: 'new' | 'processing' | 'review' | 'reviewed';
  gleason: GleasonPattern | null; // case-level primary pattern, 'benign' when confirmed benign
  primary: 3 | 4 | 5 | null;
  secondary: 3 | 4 | 5 | null;
  gleasonScore: string | null; // "4+3=7", null when nothing is confirmed or all benign
  confidence: number | null; // the AI's confidence (%), never the doctor's
  /** ISUP grade from Stage 3 ML fusion (0-5). Available as soon as inference
   *  completes, no doctor review required. Null when no run has produced a
   *  Stage 3 result yet. */
  isupGrade: number | null;
  isupConfidence: number | null;
  slides: CaseSlide[];
  dbId?: number; // real cases.id — present once backed by the real API
}

export type Role = 'doctor' | 'admin';

export type Nav =
  | 'dashboard' | 'cases' | 'caseDetail' | 'caseForm' | 'upload' | 'pipeline' | 'viewer' | 'report'
  | 'annotate' | 'caseReport'
  | 'adashboard' | 'alog' | 'models' | 'users' | 'migration' | 'library';

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
  arch_key: string;
  task_type: 'segmentation' | 'classification';
  name: string;
  task_label: string;
  encoder: string;
  metrics: ModelMetricApi[];
  trained_at: string | null;
  status: string;
  checkpoint_available: boolean;
  /** Best available model for this task by its own recorded evaluation. */
  recommended: boolean;
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

// ---------- migration — legacy ImageCapture SQLite connector ----------
export interface SqliteCasePreview {
  case_code: string;
  case_year: string | null;
  patient_name: string | null;
  slide_count: number;
  image_count: number;
}

export interface SqliteMigrationPreview {
  case_count: number;
  slide_count: number;
  image_count: number;
  magnifications_found: string[];
  cases: SqliteCasePreview[];
}

export interface SqliteMigrationImportResult {
  cases_imported: number;
  cases_skipped: number;
  slides_imported: number;
  images_imported: number;
  images_skipped: number;
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
  magnification: '4x' | '10x' | '20x' | '40x' | null;
  created_at: string;
}

export interface ApiPreprocessing {
  image_id: number;
  is_blurry: boolean;
  quality_score: number | null;
  has_normalized_image: boolean;
  has_tissue_mask: boolean;
  processed_at: string;
}

export interface ApiSlide {
  id: number;
  case_id: number;
  slide_number: number;
  legacy_slide_label: string | null;
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
  /** Computed per request by the backend from inference runs + reviews. */
  status: 'new' | 'processing' | 'review' | 'reviewed';
  /** Case-level Gleason over the confirmed reviews (see _attach_derived).
   *  Null score + images_confirmed > 0 means "confirmed, all benign", which is
   *  a finding — not the same as nothing having been signed off yet. */
  primary_pattern: number | null;
  secondary_pattern: number | null;
  total_score: number | null;
  images_confirmed: number;
  /** The AI's confidence (0-100), not the doctor's — label it as AI wherever
   *  it is shown. Averaged over the latest completed run per image. */
  ai_confidence: number | null;
  /** ISUP grade (0-5) from Stage 3 ML fusion — averaged over the latest
   *  completed run per image in the case, rounded to the nearest integer.
   *  Null when no Stage 3 result exists for any image. */
  isup_grade: number | null;
  isup_confidence: number | null;
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

// ---------- AI inference (backend/app/schemas/inference.py) ----------
export interface ApiSegmentationResult {
  id: number;
  run_id: number;
  cancer_area_px: number | null;
  total_tissue_area_px: number | null;
  cancer_area_percentage: number | null;
  has_mask: boolean;
  created_at: string;
}

export interface ApiClassificationResult {
  id: number;
  run_id: number;
  primary_pattern: 3 | 4 | 5 | null;
  primary_confidence: number | null;
  secondary_pattern: 3 | 4 | 5 | null;
  secondary_confidence: number | null;
  created_at: string;
}

// Stage 3 — WSI-level ML fusion (MLPClassifier trained on 8 classification-only
// features from densenet121+efficientnet_b0, predicts ISUP grade 0-5 directly).
export interface ApiStage3Result {
  id: number;
  run_id: number;
  isup_grade: 0 | 1 | 2 | 3 | 4 | 5 | null;
  confidence: number | null;
  classification_pct: Record<string, Record<string, number>> | null;
  created_at: string;
}

export type InferenceStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ApiInferenceRun {
  id: number;
  image_id: number;
  status: InferenceStatus;
  segmentation_model_version: string | null;
  classification_model_version: string | null;
  error_message: string | null;
  triggered_by: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  segmentation: ApiSegmentationResult | null;
  classification: ApiClassificationResult | null;
  stage3: ApiStage3Result | null;
}

export interface InferenceTriggerRequest {
  segmentation_model?: string;
  classification_model?: string;
}

// ---------- diagnostic review (backend/app/schemas/reviews.py) ----------
export interface ApiDiagnosticReview {
  id: number;
  image_id: number;
  run_id: number | null;
  primary_pattern: 3 | 4 | 5 | null;
  secondary_pattern: 3 | 4 | 5 | null;
  total_score: number | null;
  grade_group: number | null;
  cancer_area_percentage: number | null;
  biopsy_location: string | null;
  pni_present: boolean;
  pni_notes: string | null;
  lvi_present: boolean;
  lvi_notes: string | null;
  free_notes: string | null;
  tumor_length_mm: number | null;
  needs_second_opinion: boolean;
  second_opinion_notes: string | null;
  status: 'draft' | 'confirmed';
  reviewed_by: number | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagnosticReviewUpdate {
  primary_pattern?: 3 | 4 | 5 | null;
  secondary_pattern?: 3 | 4 | 5 | null;
  biopsy_location?: string | null;
  pni_present?: boolean | null;
  pni_notes?: string | null;
  lvi_present?: boolean | null;
  lvi_notes?: string | null;
  free_notes?: string | null;
  tumor_length_mm?: number | null;
  needs_second_opinion?: boolean | null;
  second_opinion_notes?: string | null;
  cancer_area_percentage?: number | null;
}

export interface FlaggedReview {
  review_id: number;
  image_id: number;
  case_id: number;
  case_label: string;
  slide_label: string;
  second_opinion_notes: string | null;
  created_at: string;
}

export interface Calibration {
  magnification: '4x' | '10x' | '20x' | '40x';
  um_per_pixel: number;
  updated_at: string;
}

// ---------- doctor dashboard stats (backend/app/schemas/stats.py) ----------
export interface PatternCount {
  label: string;
  pattern: 3 | 4 | 5 | null;
  count: number;
  percentage: number;
}

export interface DoctorStats {
  new_cases_today: number;
  pending_reviews: number;
  confirmed_reviews: number;
  avg_ai_confidence: number | null;
  pattern_distribution: PatternCount[];
}

// ---------- case-level Gleason aggregation (backend/app/schemas/cases.py) ----------
export interface CaseGleasonPerImage {
  image_id: number;
  primary_pattern: 3 | 4 | 5 | null;
  secondary_pattern: 3 | 4 | 5 | null;
  cancer_area_percentage: number | null;
}

export interface CaseGleason {
  case_id: number;
  primary_pattern: 3 | 4 | 5 | null;
  secondary_pattern: 3 | 4 | 5 | null;
  total_score: number | null;
  grade_group: number | null;
  images_confirmed: number;
  images_total: number;
  per_image: CaseGleasonPerImage[];
}

export interface CaseReportImage {
  image_id: number;
  slide_label: string;
  image_number: number;
  magnification: string | null;
  primary_pattern: 3 | 4 | 5 | null;
  secondary_pattern: 3 | 4 | 5 | null;
  total_score: number | null;
  grade_group: number | null;
  cancer_area_percentage: number | null;
  tumor_length_mm: number | null;
  biopsy_location: string | null;
  pni_present: boolean;
  pni_notes: string | null;
  lvi_present: boolean;
  lvi_notes: string | null;
  free_notes: string | null;
  needs_second_opinion: boolean;
  second_opinion_notes: string | null;
  confirmed_at: string | null;
  reviewed_by_name: string | null;
}

export interface CaseReport {
  case_id: number;
  case_code: string;
  case_year: string | null;
  patient_name: string | null;
  patient_age: number | null;
  conclusion: string | null;
  created_at: string;
  gleason: CaseGleason;
  images: CaseReportImage[];
  images_total: number;
  signed_by: string[];
}

