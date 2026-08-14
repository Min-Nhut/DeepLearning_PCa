import type {
  AdminStats,
  ApiAnnotation,
  ApiCase,
  ApiDiagnosticReview,
  ApiImage,
  ApiInferenceRun,
  ApiPreprocessing,
  ApiSlide,
  ApiUser,
  Calibration,
  CaseGleason,
  CaseReport,
  DiagnosticReviewUpdate,
  DoctorStats,
  FlaggedReview,
  InferenceTriggerRequest,
  LogEntryApi,
  MeResponse,
  MigrationImportResult,
  MigrationPreview,
  ModelInfoApi,
  Point,
  SqliteMigrationImportResult,
  SqliteMigrationPreview,
} from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Không thể kết nối tới máy chủ backend.');
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') message = data.detail;
    } catch {
      // response body wasn't JSON — keep statusText
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return (await res.json()) as T;
  return undefined as T;
}

export function login(username: string, password: string): Promise<{ access_token: string; token_type: string }> {
  return apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function getMe(token: string): Promise<MeResponse> {
  return apiFetch('/api/auth/me', {}, token);
}

export function getStats(token: string): Promise<AdminStats> {
  return apiFetch('/api/admin/stats', {}, token);
}

export function getUsers(token: string): Promise<ApiUser[]> {
  return apiFetch('/api/admin/users', {}, token);
}

export function createUser(
  token: string,
  payload: { username: string; password: string; full_name?: string; role: string },
): Promise<ApiUser> {
  return apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }, token);
}

export function updateUser(
  token: string,
  id: number,
  payload: Partial<{ is_active: boolean; role: string; full_name: string }>,
): Promise<ApiUser> {
  return apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
}

export function getLogs(token: string, limit = 50): Promise<LogEntryApi[]> {
  return apiFetch(`/api/admin/logs?limit=${limit}`, {}, token);
}

export function getModels(token: string): Promise<ModelInfoApi[]> {
  return apiFetch('/api/admin/models', {}, token);
}

// Same data as getModels(), just not admin-gated — for the doctor-facing
// model-selector on Pipeline.tsx (doctors aren't admins).
export function getAvailableModels(token: string): Promise<ModelInfoApi[]> {
  return apiFetch('/api/models', {}, token);
}

/** Drops this architecture's loaded weights server-side so the next run reads
 *  the checkpoint file again — replacing a .pt on disk otherwise has no effect
 *  until the backend restarts. */
export function reloadModel(token: string, taskType: string, archKey: string): Promise<ModelInfoApi> {
  return apiFetch(`/api/admin/models/${taskType}/${archKey}/reload`, { method: 'POST' }, token);
}

export async function exportLibrary(
  token: string,
  format: 'csv' | 'json',
  scope: 'all' | 'reviewed',
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/admin/library/export?format=${format}&scope=${scope}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function migrationPreview(token: string, file: File): Promise<MigrationPreview> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('/api/admin/migration/preview', { method: 'POST', body: form }, token);
}

export function migrationImport(token: string, file: File, anonymize: boolean): Promise<MigrationImportResult> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch(`/api/admin/migration/import?anonymize=${anonymize}`, { method: 'POST', body: form }, token);
}

export function migrationSqlitePreview(token: string, dbFile: File): Promise<SqliteMigrationPreview> {
  const form = new FormData();
  form.append('db_file', dbFile);
  return apiFetch('/api/admin/migration/sqlite-preview', { method: 'POST', body: form }, token);
}

export function migrationSqliteImport(
  token: string,
  dbFile: File,
  imageFiles: File[],
  anonymize: boolean,
): Promise<SqliteMigrationImportResult> {
  const form = new FormData();
  form.append('db_file', dbFile);
  imageFiles.forEach((f) => form.append('image_files', f));
  form.append('anonymize', String(anonymize));
  return apiFetch('/api/admin/migration/sqlite-import', { method: 'POST', body: form }, token);
}

// ---------- cases / slides / images ----------
export function getCases(token: string, q?: string): Promise<ApiCase[]> {
  return apiFetch(`/api/cases${q ? `?q=${encodeURIComponent(q)}` : ''}`, {}, token);
}

export function getCase(token: string, caseId: number): Promise<ApiCase> {
  return apiFetch(`/api/cases/${caseId}`, {}, token);
}

export function getCaseGleason(token: string, caseId: number): Promise<CaseGleason> {
  return apiFetch(`/api/cases/${caseId}/gleason`, {}, token);
}

/** Everything the case-level (signed) report needs, in one call. */
export function getCaseReport(token: string, caseId: number): Promise<CaseReport> {
  return apiFetch(`/api/cases/${caseId}/report`, {}, token);
}

export function createCase(
  token: string,
  payload: { case_code: string; case_year?: string; patient_name?: string; patient_age?: number; conclusion?: string },
): Promise<ApiCase> {
  return apiFetch('/api/cases', { method: 'POST', body: JSON.stringify(payload) }, token);
}

export function updateCase(
  token: string,
  caseId: number,
  payload: Partial<{ case_code: string; case_year: string; patient_name: string; patient_age: number; conclusion: string }>,
): Promise<ApiCase> {
  return apiFetch(`/api/cases/${caseId}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
}

export function deleteCase(token: string, caseId: number): Promise<void> {
  return apiFetch(`/api/cases/${caseId}`, { method: 'DELETE' }, token);
}

export function addSlide(token: string, caseId: number): Promise<ApiSlide> {
  return apiFetch(`/api/cases/${caseId}/slides`, { method: 'POST', body: JSON.stringify({}) }, token);
}

export function deleteSlide(token: string, slideId: number): Promise<void> {
  return apiFetch(`/api/cases/slides/${slideId}`, { method: 'DELETE' }, token);
}

/** Swaps the slide with its neighbour. Only the position changes — the slide
 *  keeps its own label, which names a real piece of glass. */
export function moveSlide(token: string, slideId: number, direction: 'up' | 'down'): Promise<ApiSlide> {
  return apiFetch(`/api/cases/slides/${slideId}/move`, { method: 'POST', body: JSON.stringify({ direction }) }, token);
}

export function uploadImage(
  token: string,
  slideId: number,
  file: File | Blob,
  opts: {
    description?: string;
    source?: 'upload' | 'live_capture';
    filename?: string;
    magnification?: '4x' | '10x' | '20x' | '40x';
  } = {},
): Promise<ApiImage> {
  const form = new FormData();
  form.append('file', file, opts.filename ?? (file instanceof File ? file.name : 'capture.jpg'));
  if (opts.description) form.append('description', opts.description);
  form.append('source', opts.source ?? 'upload');
  if (opts.magnification) form.append('magnification', opts.magnification);
  return apiFetch(`/api/cases/slides/${slideId}/images`, { method: 'POST', body: form }, token);
}

// ---------- manual annotations ----------
export function listAnnotations(token: string, imageId: number): Promise<ApiAnnotation[]> {
  return apiFetch(`/api/images/${imageId}/annotations`, {}, token);
}

export function createAnnotation(
  token: string,
  imageId: number,
  payload: { points: Point[]; gleason_pattern?: 3 | 4 | 5 | null; note?: string | null },
): Promise<ApiAnnotation> {
  return apiFetch(`/api/images/${imageId}/annotations`, { method: 'POST', body: JSON.stringify(payload) }, token);
}

export function updateAnnotation(
  token: string,
  imageId: number,
  annotationId: number,
  payload: Partial<{ points: Point[]; gleason_pattern: 3 | 4 | 5 | null; note: string | null }>,
): Promise<ApiAnnotation> {
  return apiFetch(`/api/images/${imageId}/annotations/${annotationId}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
}

export function deleteAnnotation(token: string, imageId: number, annotationId: number): Promise<void> {
  return apiFetch(`/api/images/${imageId}/annotations/${annotationId}`, { method: 'DELETE' }, token);
}

export function deleteImage(token: string, imageId: number): Promise<void> {
  return apiFetch(`/api/images/${imageId}`, { method: 'DELETE' }, token);
}

export async function getImageBlobUrl(
  token: string,
  imageId: number,
  size: 'thumb' | 'view' | 'original' = 'thumb',
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/images/${imageId}/file?size=${size}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ---------- AI inference ----------
export function triggerInference(
  token: string,
  imageId: number,
  payload: InferenceTriggerRequest = {},
): Promise<ApiInferenceRun> {
  return apiFetch(`/api/images/${imageId}/inference`, { method: 'POST', body: JSON.stringify(payload) }, token);
}

// A 404 here just means "no run yet" — resolve to null instead of throwing so
// callers (useApiData) treat it as normal data, not an error banner.
export async function getInference(token: string, imageId: number): Promise<ApiInferenceRun | null> {
  try {
    return await apiFetch<ApiInferenceRun>(`/api/images/${imageId}/inference`, {}, token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

async function getBlobUrl(token: string, path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function getMaskBlobUrl(token: string, runId: number): Promise<string> {
  return getBlobUrl(token, `/api/inference-runs/${runId}/mask`);
}

// ---------- diagnostic review ----------
export async function getReview(token: string, imageId: number): Promise<ApiDiagnosticReview | null> {
  try {
    return await apiFetch<ApiDiagnosticReview>(`/api/images/${imageId}/review`, {}, token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function updateReview(
  token: string,
  imageId: number,
  payload: DiagnosticReviewUpdate,
): Promise<ApiDiagnosticReview> {
  return apiFetch(`/api/images/${imageId}/review`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
}

export function confirmReview(token: string, imageId: number): Promise<ApiDiagnosticReview> {
  return apiFetch(`/api/images/${imageId}/review/confirm`, { method: 'POST' }, token);
}

export function getFlaggedReviews(token: string): Promise<FlaggedReview[]> {
  return apiFetch('/api/reviews/flagged', {}, token);
}

// ---------- preprocessing (blur/tissue quality check) ----------
export async function getPreprocessing(token: string, imageId: number): Promise<ApiPreprocessing | null> {
  try {
    return await apiFetch<ApiPreprocessing>(`/api/images/${imageId}/preprocessing`, {}, token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function getImage(token: string, imageId: number): Promise<ApiImage> {
  return apiFetch(`/api/images/${imageId}`, {}, token);
}

// ---------- magnification calibration (µm/pixel, for the ruler tool) ----------
export function getCalibration(token: string): Promise<Calibration[]> {
  return apiFetch('/api/calibration', {}, token);
}

export function setCalibration(token: string, magnification: string, umPerPixel: number): Promise<Calibration> {
  return apiFetch(`/api/admin/calibration/${magnification}`, { method: 'PUT', body: JSON.stringify({ um_per_pixel: umPerPixel }) }, token);
}

// ---------- doctor dashboard stats ----------
export function getDoctorStats(token: string): Promise<DoctorStats> {
  return apiFetch('/api/stats/doctor', {}, token);
}
