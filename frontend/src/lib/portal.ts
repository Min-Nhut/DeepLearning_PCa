/**
 * Portal (cổng) — which of the two front doors this build/dev-server is.
 *
 * Doctor and admin used to share one origin (http://localhost:5173) and one
 * localStorage key, so logging into one role silently evicted the other: a
 * doctor with a case open would be kicked to the login screen the moment an
 * admin logged in from another tab, because browsers scope localStorage by
 * ORIGIN, not by tab. Splitting into two ports gives each role its own origin,
 * which is what actually makes the two sessions independent — the separate
 * storage key below is only belt-and-braces for a future single-origin
 * reverse-proxy deployment.
 *
 * This is a UX/session boundary, NOT access control. The real enforcement is
 * still `require_admin` on the backend (`backend/app/deps.py`) — hiding a nav
 * item or refusing a login here would never stop a hand-crafted request.
 */
export type Portal = 'doctor' | 'admin';

const configured = (import.meta.env.VITE_PORTAL as string | undefined)?.trim().toLowerCase();

export const PORTAL: Portal = configured === 'admin' ? 'admin' : 'doctor';

/** Backend role vocabulary is 'user'|'admin' (schema.sql); the UI's own is 'doctor'|'admin'. */
export const PORTAL_BACKEND_ROLE = PORTAL === 'admin' ? 'admin' : 'user';

export const PORTAL_LABEL = PORTAL === 'admin' ? 'Cổng Quản trị' : 'Cổng Bác sĩ';
export const OTHER_PORTAL_LABEL = PORTAL === 'admin' ? 'Cổng Bác sĩ' : 'Cổng Quản trị';

export const OTHER_PORTAL_URL =
  (import.meta.env.VITE_OTHER_PORTAL_URL as string | undefined) ||
  (PORTAL === 'admin' ? 'http://localhost:5173' : 'http://localhost:5174');

/** Per-portal key so the two never collide even if both are ever served from one origin. */
export const TOKEN_STORAGE_KEY = `prostaai_token_${PORTAL}`;

export function roleMatchesPortal(role: string): boolean {
  return (role === 'admin') === (PORTAL === 'admin');
}
