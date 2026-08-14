import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The portal split exists because both roles used to share one origin and one
 * localStorage key, so an admin logging in evicted a doctor mid-case. `PORTAL`
 * is read once at module load, so each case here re-imports the module under a
 * different env — mirroring how a build actually bakes the value in.
 */
async function loadPortal(value?: string) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv('VITE_PORTAL', '');
  else vi.stubEnv('VITE_PORTAL', value);
  return import('./portal');
}

afterEach(() => vi.unstubAllEnvs());

describe('portal identity', () => {
  it('defaults to the doctor portal when nothing is configured', async () => {
    const p = await loadPortal(undefined);
    expect(p.PORTAL).toBe('doctor');
  });

  it('reads the admin portal from the build env', async () => {
    const p = await loadPortal('admin');
    expect(p.PORTAL).toBe('admin');
    expect(p.PORTAL_LABEL).toBe('Cổng Quản trị');
    expect(p.OTHER_PORTAL_LABEL).toBe('Cổng Bác sĩ');
  });

  it('ignores casing and stray whitespace', async () => {
    expect((await loadPortal('  ADMIN ')).PORTAL).toBe('admin');
  });

  it('treats an unrecognised value as the doctor portal rather than failing', async () => {
    expect((await loadPortal('supervisor')).PORTAL).toBe('doctor');
  });
});

describe('token storage key', () => {
  it('differs per portal, so the two can never overwrite each other', async () => {
    const doctor = (await loadPortal('doctor')).TOKEN_STORAGE_KEY;
    const admin = (await loadPortal('admin')).TOKEN_STORAGE_KEY;

    expect(doctor).toBe('prostaai_token_doctor');
    expect(admin).toBe('prostaai_token_admin');
    expect(doctor).not.toBe(admin);
  });
});

describe('roleMatchesPortal', () => {
  it('lets only the admin role into the admin portal', async () => {
    const { roleMatchesPortal } = await loadPortal('admin');
    expect(roleMatchesPortal('admin')).toBe(true);
    expect(roleMatchesPortal('user')).toBe(false);
  });

  it('lets only non-admin roles into the doctor portal', async () => {
    const { roleMatchesPortal } = await loadPortal('doctor');
    expect(roleMatchesPortal('user')).toBe(true);
    expect(roleMatchesPortal('admin')).toBe(false);
  });

  it('uses the backend role vocabulary, not the UI one', async () => {
    // The schema stores 'user'|'admin'; the UI calls the first one 'doctor'.
    const { roleMatchesPortal } = await loadPortal('doctor');
    expect(roleMatchesPortal('user')).toBe(true);
  });
});

describe('link to the other portal', () => {
  it('points at the other port by default', async () => {
    expect((await loadPortal('doctor')).OTHER_PORTAL_URL).toContain('5174');
    expect((await loadPortal('admin')).OTHER_PORTAL_URL).toContain('5173');
  });
});
