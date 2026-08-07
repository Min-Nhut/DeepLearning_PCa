import { describe, expect, it } from 'vitest';
import { caseFromApi } from './caseAdapter';
import type { ApiCase } from '../types';

/**
 * The seam between the real API and the UI: every screen that lists cases
 * renders whatever this returns. Two things must hold — the display id and the
 * database id stay separate (they are different values used for different
 * things, and confusing them breaks every API call made from a row), and no
 * AI-derived field is invented for a case that has no AI result.
 */
function apiCase(overrides: Partial<ApiCase> = {}): ApiCase {
  return {
    id: 42,
    case_code: '7',
    case_year: '2026',
    patient_name: 'Nguyen Van A',
    patient_age: 65,
    conclusion: null,
    source: 'new',
    is_anonymized: false,
    created_by: 1,
    created_at: '2026-08-07 09:15:00',
    updated_at: '2026-08-07 09:15:00',
    slides: [],
    ...overrides,
  } as ApiCase;
}

function apiSlide(number: number, label: string | null = null, images: unknown[] = []) {
  return { id: 100 + number, case_id: 42, slide_number: number, legacy_slide_label: label, images };
}

function apiImage(number: number) {
  return {
    id: 900 + number, slide_id: 101, image_number: number, description: null,
    width_px: 600, height_px: 400, format: 'png', source: 'upload',
    magnification: '40x', created_at: '2026-08-07 09:20:00',
  };
}

describe('caseFromApi', () => {
  it('builds the display id without losing the database id', () => {
    const c = caseFromApi(apiCase());
    expect(c.id).toBe('PA-2026-0007');
    expect(c.dbId).toBe(42);
  });

  it('pads the case code to the house format', () => {
    expect(caseFromApi(apiCase({ case_code: '1' })).id).toBe('PA-2026-0001');
    expect(caseFromApi(apiCase({ case_code: '1234' })).id).toBe('PA-2026-1234');
  });

  it('never invents an AI result', () => {
    const c = caseFromApi(apiCase());
    expect(c.gleason).toBeNull();
    expect(c.primary).toBeNull();
    expect(c.secondary).toBeNull();
    expect(c.confidence).toBeNull();
  });

  it('says a name is missing rather than showing an empty cell', () => {
    expect(caseFromApi(apiCase({ patient_name: null })).hoTen).toBe('(chưa nhập họ tên)');
  });

  it('orders slides by slide number, not by the order the API happened to return', () => {
    const c = caseFromApi(apiCase({
      slides: [apiSlide(3), apiSlide(1), apiSlide(2)] as never,
    }));
    expect(c.slides.map((s) => s.id)).toEqual(['S1', 'S2', 'S3']);
  });

  it('prefers the real lab label over the generic one', () => {
    const c = caseFromApi(apiCase({ slides: [apiSlide(2, 'Slide 3-4')] as never }));
    expect(c.slides[0].label).toBe('Slide 3-4');
  });

  it('falls back to a generic label when the slide has none', () => {
    const c = caseFromApi(apiCase({ slides: [apiSlide(2, null)] as never }));
    expect(c.slides[0].label).toBe('Slide 2');
  });

  it('orders images and carries their database ids through', () => {
    const c = caseFromApi(apiCase({
      slides: [apiSlide(1, null, [apiImage(2), apiImage(1)])] as never,
    }));
    expect(c.slides[0].images.map((im) => im.id)).toEqual(['H1', 'H2']);
    expect(c.slides[0].images.map((im) => im.dbId)).toEqual([901, 902]);
  });

  it('survives a case with no slides at all', () => {
    expect(caseFromApi(apiCase({ slides: [] })).slides).toEqual([]);
  });
});
