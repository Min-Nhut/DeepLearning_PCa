import { describe, expect, it } from 'vitest';
import { aiReadingProblem, classLabel, crossModelDisagreement } from './aiReliability';
import type { ApiInferenceRun } from '../types';

/**
 * Written from a real failing case, not an imagined one: a 512×512 microscope
 * capture where segmentation reported 100% cancer area and classification
 * returned benign at 93% confidence, which the UI rendered as a green "Lành
 * tính" chip. The numbers below are that run's actual values.
 */
function run(over: Partial<ApiInferenceRun> = {}): ApiInferenceRun {
  return {
    id: 34, image_id: 67, status: 'completed',
    segmentation_model_version: 'unet_densenet121',
    classification_model_version: 'efficientnet_b0',
    error_message: null, triggered_by: 1,
    started_at: null, completed_at: null, created_at: '2026-08-08 18:35:43',
    segmentation: {
      id: 30, run_id: 34, cancer_area_px: 58117, total_tissue_area_px: 58117,
      cancer_area_percentage: 100, has_mask: true, created_at: '',
    },
    classification: {
      id: 34, run_id: 34, primary_pattern: null, primary_confidence: null,
      secondary_pattern: null, secondary_confidence: null, created_at: '',
    },
    stage3: null,
    ...over,
  } as ApiInferenceRun;
}

describe('aiReadingProblem', () => {
  it('flags a null pattern sitting on top of a real cancer area', () => {
    // The reported bug. Segmentation says the epithelium is entirely cancerous,
    // classification assigns nothing — neither answer stands alone.
    expect(aiReadingProblem(run())).toBe('pattern_not_assigned');
  });

  it('does not flag a genuine benign reading', () => {
    // No pattern *and* no cancer area: both stages agree, so the benign chip is
    // the honest rendering.
    expect(aiReadingProblem(run({
      segmentation: {
        id: 1, run_id: 1, cancer_area_px: 0, total_tissue_area_px: 9000,
        cancer_area_percentage: 0, has_mask: true, created_at: '',
      },
    }))).toBeNull();
  });

  it('does not flag a result that did assign a pattern', () => {
    expect(aiReadingProblem(run({
      classification: {
        id: 1, run_id: 1, primary_pattern: 4, primary_confidence: 0.9,
        secondary_pattern: 3, secondary_confidence: 0.5, created_at: '',
      },
    } as Partial<ApiInferenceRun>))).toBeNull();
  });

  it('keeps reporting no_tissue separately from an unassigned pattern', () => {
    expect(aiReadingProblem(run({
      segmentation: {
        id: 1, run_id: 1, cancer_area_px: 0, total_tissue_area_px: 0,
        cancer_area_percentage: null, has_mask: true, created_at: '',
      },
    }))).toBe('no_tissue');
  });

  it('says nothing about a run that has not finished or has no segmentation', () => {
    expect(aiReadingProblem(null)).toBeNull();
    expect(aiReadingProblem(run({ status: 'running' }))).toBeNull();
    expect(aiReadingProblem(run({ segmentation: null }))).toBeNull();
  });
});

describe('crossModelDisagreement', () => {
  const disagreeing = {
    // Real values from run 34.
    densenet121: { benign: 8.09, gleason_3: 86.29, gleason_4: 4.88, gleason_5: 0.75 },
    efficientnet_b0: { benign: 91.98, gleason_3: 5.11, gleason_4: 1.38, gleason_5: 1.53 },
  };

  it('reports both verdicts when the two models pick different classes', () => {
    const verdicts = crossModelDisagreement(disagreeing)!;
    expect(verdicts).toHaveLength(2);
    expect(verdicts.map((v) => v.label)).toEqual(['gleason_3', 'benign']);
    expect(verdicts[0].percentage).toBeCloseTo(86.29);
  });

  it('stays quiet when the models agree, even if the margins differ', () => {
    // Real values from run 32: both call it benign, one much more strongly.
    expect(crossModelDisagreement({
      densenet121: { benign: 57.29, gleason_3: 35.33, gleason_4: 5.88, gleason_5: 1.51 },
      efficientnet_b0: { benign: 77.67, gleason_3: 16.07, gleason_4: 3.19, gleason_5: 3.07 },
    })).toBeNull();
  });

  it('stays quiet when both agree on a cancer pattern', () => {
    // Real values from run 29 on a PANDA slide — the in-domain case.
    expect(crossModelDisagreement({
      densenet121: { benign: 27.4, gleason_3: 6.76, gleason_4: 53.93, gleason_5: 11.91 },
      efficientnet_b0: { benign: 31.37, gleason_3: 7.77, gleason_4: 54.09, gleason_5: 6.77 },
    })).toBeNull();
  });

  it('needs two models before it can claim they disagree', () => {
    expect(crossModelDisagreement({ densenet121: { benign: 90, gleason_3: 10 } })).toBeNull();
    expect(crossModelDisagreement(null)).toBeNull();
    expect(crossModelDisagreement(undefined)).toBeNull();
  });
});

describe('classLabel', () => {
  it('translates the model class keys the doctor sees', () => {
    expect(classLabel('benign')).toBe('Lành tính');
    expect(classLabel('gleason_4')).toBe('Pattern 4');
  });

  it('passes an unknown key through rather than hiding it', () => {
    expect(classLabel('gleason_9')).toBe('gleason_9');
  });
});
