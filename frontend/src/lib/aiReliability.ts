import type { ApiInferenceRun } from '../types';

/**
 * Two checks on whether an AI result can be read at face value.
 *
 * Both exist because of one real case: a 512×512 microscope capture where
 * segmentation found Gleason 3 and 4 glands and no benign epithelium at all
 * (cancer area 100%), while the classification model returned `benign` at 93%
 * confidence — so `primary_pattern` came back null and the screen showed a
 * green "Lành tính" chip next to "Tỷ lệ vùng ung thư 100,0%". Running all four
 * classification checkpoints on that same patch gave four different answers,
 * each above 88% confidence, which is the signature of an input outside the
 * distribution the models were trained on.
 */

export type AiReadingProblem =
  | 'no_tissue'
  | 'pattern_not_assigned';

export interface ModelVerdict {
  arch: string;
  label: string;
  percentage: number;
}

const CLASS_LABELS: Record<string, string> = {
  benign: 'Lành tính',
  gleason_3: 'Pattern 3',
  gleason_4: 'Pattern 4',
  gleason_5: 'Pattern 5',
};

export function classLabel(key: string): string {
  return CLASS_LABELS[key] ?? key;
}

/**
 * Why the AI result must not be read as a finding, or null when it can be.
 *
 * - `no_tissue`: nothing usable was found (blurry, mostly background).
 * - `pattern_not_assigned`: segmentation marked cancerous tissue but
 *   classification assigned no Gleason pattern. The two models contradict each
 *   other, so neither answer stands on its own.
 *
 * A null pattern with **zero** cancer area is not a problem: both stages agree
 * there is no cancer, which is a genuine benign reading.
 */
export function aiReadingProblem(run: ApiInferenceRun | null): AiReadingProblem | null {
  if (!run || run.status !== 'completed' || !run.segmentation) return null;
  const seg = run.segmentation;
  if (!seg.total_tissue_area_px) return 'no_tissue';
  if ((seg.cancer_area_px ?? 0) > 0 && run.classification?.primary_pattern == null) {
    return 'pattern_not_assigned';
  }
  return null;
}

/**
 * The two classification architectures Stage 3 already runs over every tissue
 * patch, when their top class differs — an out-of-distribution signal that costs
 * nothing to compute because the distributions are stored with every run.
 *
 * The trigger is deliberately "the top-1 labels differ" rather than a distance
 * threshold: it needs no arbitrary cutoff to justify, and showing both verdicts
 * lets the doctor judge a near-tie for themselves. Returns null when the models
 * agree, or when fewer than two reported a distribution.
 */
export function crossModelDisagreement(
  pct: Record<string, Record<string, number>> | null | undefined,
): ModelVerdict[] | null {
  if (!pct) return null;
  const verdicts: ModelVerdict[] = [];
  for (const [arch, dist] of Object.entries(pct)) {
    const entries = Object.entries(dist ?? {});
    if (entries.length === 0) continue;
    const [label, percentage] = entries.reduce((best, e) => (e[1] > best[1] ? e : best));
    verdicts.push({ arch, label, percentage });
  }
  if (verdicts.length < 2) return null;
  const distinct = new Set(verdicts.map((v) => v.label));
  return distinct.size > 1 ? verdicts : null;
}
