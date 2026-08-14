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
    status: 'new',
    primary_pattern: null,
    secondary_pattern: null,
    total_score: null,
    images_confirmed: 0,
    ai_confidence: null,
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
    expect(c.gleasonScore).toBeNull();
    expect(c.confidence).toBeNull();
  });

  it('carries a real case-level score through instead of showing a dash', () => {
    const c = caseFromApi(apiCase({
      primary_pattern: 4, secondary_pattern: 3, total_score: 7, images_confirmed: 2,
    }));
    expect(c.gleason).toBe('4');
    expect(c.gleasonScore).toBe('4+3=7');
    expect(c.primary).toBe(4);
    expect(c.secondary).toBe(3);
  });

  it('shows a confirmed benign case as benign, not as no result', () => {
    // Both leave the score null; only one of them means "nothing signed off".
    const benign = caseFromApi(apiCase({ images_confirmed: 1 }));
    expect(benign.gleason).toBe('benign');
    expect(benign.gleasonScore).toBeNull();

    expect(caseFromApi(apiCase({ images_confirmed: 0 })).gleason).toBeNull();
  });

  it('rounds the AI confidence for display without losing a real zero', () => {
    expect(caseFromApi(apiCase({ ai_confidence: 87.0976 })).confidence).toBe(87);
    expect(caseFromApi(apiCase({ ai_confidence: 0 })).confidence).toBe(0);
    expect(caseFromApi(apiCase({ ai_confidence: null })).confidence).toBeNull();
  });

  it('passes the workflow status through rather than defaulting it', () => {
    expect(caseFromApi(apiCase({ status: 'reviewed' })).status).toBe('reviewed');
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
