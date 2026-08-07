# ProstaAI — CLAUDE.md

Thesis project (Vietnamese CS/IT graduation thesis): an AI-assisted web prototype for
Gleason grading of prostate biopsy images (H&E). **Research/decision-support prototype
only — not a certified medical device.** Full requirements: [docs/PRD.md](docs/PRD.md)
("PRD_ProstaAI_v3_Thesis_2.md", v3 — thesis-scoped; §12 is future/production vision, not
in scope).

## Current status

- ✅ **Frontend** (`frontend/`): fully scaffolded, ported screen-for-screen from a Claude
  Design mockup (see [Design source](#design-source) below). **Admin screens,
  Cases/CaseDetail/CaseForm/Upload, and — as of 2026-08-04 — Pipeline/Viewer/Report are all
  wired to the real backend** (see below). All mock diagnostic data (`REGIONS`, the fake
  7-step `PIPELINE` timer, the generated fake-tissue `Histology` renderer) has been removed.
- ✅ **Database** (`database/`): SQLite database initialized from `docs/schema.sql`, all
  11 tables + indexes + CHECK/FK constraints verified. `users` has 4 real accounts (1
  admin, 3 doctor); `cases`/`slides`/`images` are real and populated through normal use of
  the app (created via the UI, not seeded); `audit_logs`/`inference_runs`/etc. still empty
  — see [database/README.md](database/README.md).
- 🟡 **Backend** (`backend/`): FastAPI app covering **Admin** (auth, dashboard stats, user
  management, system log, model info, library export, CSV-based legacy migration),
  **Case/Slide/Image CRUD + image upload/live-capture + automatic preprocessing**,
  **diagnostic review CRUD**, and **manual freehand annotation CRUD** (see
  [Backend architecture](#backend-architecture)). Every mutating endpoint writes
  `audit_logs`. `reports` still declined (not needed for this thesis).
- ✅ **AI inference pipeline** (`backend/app/inference/`): **real checkpoints for both
  tasks, first full end-to-end run verified 2026-08-04.** Classification: all 4
  architectures have real checkpoints in `backend/models/classification/`. Segmentation:
  **3 of the 4 candidate architectures** kept (plain `DeepLabV3` without the `+` was
  trained but deliberately dropped by the user) — real checkpoints in `backend/models/
  segmentation/`, all load with `strict=True` (no key mismatch). `POST /api/images/{id}
  /inference` ran a real image through tile→segment→classify→aggregate and reached
  `status='completed'`: a real stitched mask PNG was generated (dimensions matched the
  original exactly) and served back via `GET /api/inference-runs/{id}/mask`; classifying
  a synthetic non-tissue test image correctly found no cancer patches (primary/secondary
  stayed `null`, not a fabricated pattern) — the "no result" path works as honestly as
  the "found a pattern" path would. See
  [AI inference pipeline](#ai-inference-pipeline-backendappinference) below.
  **`Pipeline.tsx`/`Viewer.tsx`/`Report.tsx` are now wired to this pipeline**
  (2026-08-04) — see [Frontend↔backend integration](#frontendbackend-integration).
- ✅ **Frontend ↔ backend wiring**: Admin (all 6 screens), Cases/CaseDetail/CaseForm/
  Upload, Annotate, and — as of 2026-08-04 — Pipeline/Viewer/Report all verified
  end-to-end through the actual UI (not just curl) — see
  [Frontend↔backend integration](#frontendbackend-integration). There is no longer any
  screen rendering off mock/fabricated AI data.

## Data model

SQLite schema at [docs/schema.sql](docs/schema.sql). Hierarchy: **users → cases → slides
→ images**, with AI results layered on top:

- `cases` — Ca bệnh (mã số, mã năm, họ tên, tuổi, kết luận free-text). `source` marks
  `'new'` vs `'legacy_import'` (from the old desktop WinForms app); `is_anonymized` gates
  use of real patient data.
- `slides` — up to 12 per case (`slide_number`), enforced by `backend/app/routers/cases.py`.
- `images` — up to 8 per slide (`image_number`, also enforced), plus `preprocessing_results`
  (color normalization, tissue mask, blur/quality check — **not implemented**, still
  future work) 1:1 per image. `source` distinguishes `'upload'` (file picker) vs
  `'live_capture'` (microscope camera capture) vs `'legacy_import'` — see
  [Case/Slide/Image API](#caseslideimage-api). `magnification` (added 2026-08-05,
  `'4x'|'10x'|'20x'|'40x'`, nullable) records the objective used at capture time — see the
  Legacy desktop app integration subsection under
  [Frontend↔backend integration](#frontendbackend-integration).
- `inference_runs` — one row per AI pipeline execution on an image (`status`:
  pending/running/completed/failed), fanning out to `segmentation_results` (6-class
  tissue mask + per-class area — **not binary**, see
  [AI models](#ai-models--training-methodology-colab-notebooks) below) and
  `classification_results` (primary/secondary Gleason pattern + confidence + heatmap),
  both 1:1 per run.
- `diagnostic_reviews` — the doctor's editable copy of the AI output, plus **manual-only**
  fields not produced by the model: `biopsy_location`, `pni_present`/`pni_notes`,
  `lvi_present`/`lvi_notes`, `free_notes`, and (added 2026-08-05, see the dated bullet
  under [Frontend↔backend integration](#frontendbackend-integration)) `tumor_length_mm`
  (from the ruler tool), `needs_second_opinion`/`second_opinion_notes` (the "cần hội
  chẩn" flag). `status` draft→confirmed with `confirmed_at` acting as a soft lock (no
  real legal e-signature — see PRD §8.6).
- `reports`, `audit_logs` — export history and a basic action log (not a tamper-proof
  enterprise audit log — out of scope per PRD §5/§12).
- `magnification_calibration` (added 2026-08-05) — admin-entered µm/pixel per objective
  (4x/10x/20x/40x), measured against a real stage micrometer on the physical microscope.
  Empty by default = "not calibrated for this magnification yet". Powers the ruler tool
  in `Viewer.tsx` — see the dated bullet under
  [Frontend↔backend integration](#frontendbackend-integration).

The live database file lives at `database/prostaai.db`, regenerated from `schema.sql` via
`bash database/init_db.sh` (drops and recreates — empty, no seed data). **Foreign keys
are off by default per SQLite connection** — any backend code opening this file must run
`PRAGMA foreign_keys = ON` itself; see [database/README.md](database/README.md) for the
SQLAlchemy snippet.

## AI models — training methodology (Colab notebooks)

Read directly from the two training notebooks (`PANDA_classification_training_colab_9.ipynb`,
`PANDA_segmentation_training_colab_2.ipynb` — kept outside this repo, on the user's machine/
Drive, not checked in here) so the eventual inference pipeline matches what was actually
trained, not guesswork. **This supersedes older SICAPv2/ResNeXt50 wording still present in
`docs/PRD.md`** — `backend/app/ai_models_config.py` has already been corrected (see
[AI inference pipeline](#ai-inference-pipeline-backendappinference)); the PRD rewrite is
a separate, larger pending pass (see Next steps — the wording appears in ~8 sections, not
just §8.5/§10).

### Dataset — not SICAPv2

Both notebooks train on the **PANDA** dataset (Kaggle "Prostate cANcer graDe Assessment"),
not SICAPv2 as earlier docs assumed, driven by a `manifest.csv` (3,170 cases / WSIs,
151,596 patches, **500×500px** each) referencing methodology paper *10278_2025_Article_1429*.
Each patch has a paired mask (also 500×500) with **6 raw pixel values**:
`0=background, 1=stroma, 2=benign, 3=gleason_3, 4=gleason_4, 5=gleason_5`. Both notebooks
keep all 6 values during training (no merging background+stroma — visually too different,
would blur the decision boundary for the other classes); reported metrics just exclude
classes 0/1 to match the paper's Table 4/6.

**Case source & filtering (upstream of `manifest.csv`, confirmed by the user — not visible
in the training notebooks themselves, which start from an already-built manifest):**
- **Radboud University Medical Center slides only** — PANDA is sourced from two institutions
  (Radboud + Karolinska) with *different* annotation protocols; Karolinska's masks are
  coarser (background/benign/cancer only), so restricting to Radboud is what makes the
  6-class mask (stroma vs benign vs G3/G4/G5) possible at all. Any future retraining/
  data-expansion work must preserve this — mixing in Karolinska slides would silently
  degrade or invalidate the mask semantics.
- **Multi-stage QC** before a case entered the manifest: (1) drop missing/empty masks,
  (2) cross-check each slide's Gleason/ISUP label against the paper's Table 1, (3) drop
  slides on a known noisy-label list (`FAM_TARO`), (4) manual visual QC pass.
- **Final clean case list: 3,204 cases** (`final_case_list_after_visual_qc.csv`) — note
  this is slightly higher than the `manifest.csv` cell's own stated "3,170 cases" (see
  Dataset paragraph above); the two numbers come from different points in the pipeline
  and haven't been reconciled — flag this discrepancy rather than silently picking one
  if it matters for the thesis's data-section writeup.

**Patch extraction parameters (finalized, confirmed by the user):**
- **Patch size 500×500**, matching the paper.
- **Read at WSI pyramid level 0** (i.e. the scanner's native/full resolution, no
  downsampling) — **changed from an earlier level 1 attempt**. This is the number that
  answers the microscope-calibration question from earlier: level 0 has a fixed
  µm/pixel determined by the scanner (stored in each WSI file's own metadata, e.g.
  OpenSlide's `openslide.mpp-x`/`mpp-y` properties — not yet pulled into this repo's
  docs; confirm the actual µm/pixel value from the source WSI files before using it to
  calibrate real microscope-camera patches against training scale).
- **Edge handling**: windows are shifted inward to stay fully in-bounds, rather than
  padded — so every extracted patch is a genuine 500×500 crop of real tissue/background,
  never a padded/blank edge patch.
- **Labeling rule** (matches the paper, already noted above): `benign` requires 100% of
  the epithelium in the patch to be benign; `gleason_3/4/5` requires ≥50% area overlap
  of that pattern — patches meeting neither threshold get no classification label (hence
  classification training only uses the subset with `label` non-null, per the notebook).
- **Storage**: patch image as **JPEG** (lossy is fine — texture/color, not discrete
  values), mask as **PNG (lossless required)** — a corrupted/interpolated mask pixel
  would silently relabel tissue class. This is the same discipline this repo's own
  `preprocessing.py` already follows (tissue mask saved as PNG, not JPEG) — good
  precedent to carry into any future patch-extraction code written for real uploaded
  images.

**Split discipline (important for any future re-training or fine-tuning)**: the
classification notebook computes the canonical train/val/test split — **80/10/10,
subject-wise by `image_id`** (stratified by each case's majority patch label), saved to
`classification_manifest_with_split.csv`. The segmentation notebook **reuses that exact
split** (joined by `image_id`, not recomputed) specifically so no case ever ends up in
different splits across the two branches — prevents leakage if a later stage combines
features from both models per case. **Segmentation notebook cannot run standalone** — it
asserts `classification_manifest_with_split.csv` exists first.

### Classification model

- **4 architectures** (via `torchvision.models`, ImageNet-pretrained): DenseNet121,
  **EfficientNet_b0** (best per the paper: F1=83.83%, Acc=90.13%), Inception_v3
  (`aux_logits` disabled — 224px input doesn't suit the aux classifier), **ViT-B/16**.
- **Input**: patches resized 500×500 → **224×224**, bilinear, ImageNet mean/std
  normalization. Train-only augmentation: horizontal/vertical flip, rotate90, **plus
  minority-class oversampling** (not in the paper — flagged as a Methodology addition).
- **4 output classes** (only patches with a non-null label — i.e. ≥50% single-class area
  per the paper's patch-labeling rule): `benign, gleason_3, gleason_4, gleason_5`. No
  background/stroma class here (classification only runs on tissue-labeled patches).
- **Training**: AdamW (`lr=1e-4, weight_decay=1e-4`), `CrossEntropyLoss` with
  `label_smoothing=0.1`, dropout 0.3 on the classifier head, batch 32, up to 100 epochs,
  `ReduceLROnPlateau`, early-stop patience 5 on val F1. Weight decay + label smoothing are
  both flagged as additions beyond the paper.
- **Metrics** (macro-averaged): accuracy, F1, precision, sensitivity/recall, specificity
  (one-vs-rest confusion matrix) — matches the paper's Table 4 columns. **Deviation from
  the paper, must be stated in any Methodology writeup**: the paper used 5-fold
  subject-wise CV; this notebook uses a single static 80/10/10 split (speed/resource
  tradeoff) — **don't directly compare these Accuracy/F1 numbers to the paper's Table 4**.
- **Explainability** (not in the paper, useful for the thesis defense and directly
  relevant to what `classification_results.heatmap_file_path` should eventually hold):
  Grad-CAM for the 3 CNN architectures, **Attention Rollout** for ViT-B/16 (via a
  monkey-patched `forward` on `torchvision`'s `vit_b_16` attention blocks — version-
  fragile, notebook prints a clear error instead of crashing if `torchvision`'s internal
  `EncoderBlock` shape changes).
- **Checkpoints** (on Google Drive, not in this repo): `{model_name}.pt` (latest, for
  resume) + `{model_name}_best.pt` (best val F1, used for test-set eval and for
  Grad-CAM/error-analysis) under `checkpoints_classification/`.

### Segmentation model

- **4 architectures trained** (via `segmentation_models_pytorch`): U-Net (DenseNet121
  encoder), U-Net (EfficientNet_b0), DeepLabV3 (EfficientNet_b0), **DeepLabV3+
  (EfficientNet_b0)** — best of the 4 per the paper. **Only 3 deployed**: the user
  dropped plain DeepLabV3 (kept DeepLabV3+) — see Production architecture below for the
  real per-architecture eval metrics and which ones actually have checkpoints.
- **Input**: 500×500 → **256×256** (different resize target than classification's 224 —
  keep this straight when building a shared patch-preprocessing step later). Image resize
  bilinear, **mask resize nearest-neighbor** (mandatory — bilinear would invent
  intermediate class values on a discrete label map).
- **Output: 6-class semantic segmentation** (background/stroma/benign/G3/G4/G5) — **not**
  a binary cancer-vs-not mask, correcting the "binary cancer-region mask" wording still in
  `docs/PRD.md` §8.5 (already fixed in `backend/app/ai_models_config.py`). Segmentation
  trains on **every** patch that has a mask (no label-confidence filtering, since it's
  pixel-wise, not patch-wise like classification).
- **Loss**: `CrossEntropyLoss` (weight 0.5) + SMP's multiclass `DiceLoss` (weight 0.5) —
  not specified by the paper, notebook's own choice, flagged as such.
- **Metrics**: pixel accuracy, mean IoU, mean DSC over the 4 tissue classes only
  (`REPORT_CLASSES=[2,3,4,5]`, background/stroma excluded from the score — matches the
  paper's Table 6) — computed from an **accumulated confusion matrix over the whole
  split**, not averaged per-batch. Plus FNR/FPR/specificity per class (paper's Eq. 8-9,
  not in Table 6 but described in its Methodology) — **`fnr_gleason_5` is the metric to
  watch clinically**: it's the miss rate on the single most dangerous tissue class.
- **Checkpoints**: same `{model}.pt`/`{model}_best.pt` (best val DSC) pattern, under
  `checkpoints_segmentation/`.
- **WSI-level area-% MAE (notebook §14, not in the paper)**: after per-patch prediction,
  pixel counts are summed across every patch belonging to the same `image_id` (i.e. one
  whole slide), converted to a % of the 4 tissue classes, and compared predicted-vs-actual
  by MAE. The notebook's own rationale: DSC/IoU measure *pixel-level* error, but what
  actually feeds the next stage is *% area per class per case* — a pixel error can matter
  a lot or very little for that downstream number depending on where it occurs, so this is
  a more directly relevant sanity check.

### "Stage 3" — reversed 2026-08-06: now built

The segmentation notebook's §14 comment mentions per-class area-% output feeding "Stage 3
(kết hợp feature → ISUP grade)", raising the question of whether a third fusion
model/step combines segmentation + classification into a case-level ISUP grade. **User
confirmed (2026-08-04): no — only the 2 existing models (segmentation + classification)
are used for now.** That call was **reversed 2026-08-06**: the user supplied a real
trained Stage 3 artifact (`backend/models/machine_learning_fusion/`) and a spec doc, and
asked for it deployed. See the dated "Stage 3 ML-fusion + case-level Gleason aggregation"
subsection under [Frontend↔backend integration](#frontendbackend-integration) for the
full writeup — notably, the *actual* trained model turned out to need only 8
classification-only features, not the 16 (classification+segmentation) the spec doc
described; the real artifact was trusted over the doc. Case-level score aggregation
(across a case's confirmed reviews) still uses the existing `_grade_group()` formula
(`backend/app/routers/reviews.py`) — Stage 3 is a separate, additional per-image ML
signal, not a replacement for that formula.

### Inference order for a new (non-training) image: Segmentation → Classification

Confirmed by the user. For a real uploaded/captured image: run **segmentation first** to
get the 6-class tissue mask, then run **classification only on the patches segmentation
identified as containing tissue/cancer-relevant classes** (not background/stroma-only
patches) — mirrors how `preprocessing.py`'s tissue-detection step already exists to avoid
wasting the Macenko step on blank regions; same principle, now extended to gate
classification compute too. Case-level primary/secondary pattern then comes from
aggregating classification results across those patches (by area, per the paper's own
Gleason-scoring convention) — **not yet fully speced**, but this ordering is settled.

### Production architecture — confirmed decisions, still open items

- **Which architectures go to production — resolved for segmentation, still open for
  classification**: schema never blocked either deployment shape —
  `inference_runs.segmentation_model_version`/`classification_model_version` are
  free-text columns, not FKs to a fixed enum. **Segmentation: the user picked "deploy
  multiple" — 3 of the 4 trained architectures** (dropped plain DeepLabV3, kept U-Net×2 +
  DeepLabV3+), confirmed 2026-08-04, based on their own real eval results
  (`segmentation_results.csv`), not the paper's winner. **Classification: still deploying
  all 4** (no architecture dropped yet). A model-selector UI now exists (2026-08-04, see
  [Frontend↔backend integration](#frontendbackend-integration)'s Pipeline/Viewer/Report
  subsection) — the doctor picks an architecture per task per run on the `Pipeline` screen
  before triggering; the trigger endpoint's own "first available architecture per task"
  default only kicks in if the request omits a choice (still the behavior for any direct
  API caller).
- **Checkpoint files**: real `.pt` files now present — `backend/models/classification/
  {densenet121,efficientnet_b0,inception_v3,vit_b_16}_best.pt` (4) and `backend/models/
  segmentation/{unet_densenet121,unet_efficientnet_b0,deeplabv3plus_efficientnet_b0}
  _best.pt` (3) — all 7 verified to `registry.load()` successfully with `strict=True`
  (exact architecture match, no key mismatch) via a real forward pass, not just file
  presence. Gitignored (`backend/.gitignore`'s `models/**/*.pt` rule), same treatment as
  `backend/uploads/`.
- **First full pipeline run, verified 2026-08-04**: `POST /api/images/{id}/inference` on
  a real uploaded image reached `status='completed'` — segmentation produced a real
  stitched mask PNG (dimensions matched the original exactly, served correctly via
  `GET /api/inference-runs/{id}/mask`), classification correctly found zero cancer
  patches on a synthetic non-tissue test image and left `primary_pattern`/
  `secondary_pattern` as `null` rather than forcing a fake pattern. Confirms the
  tile→segment→classify→aggregate wiring is genuinely correct end-to-end, not just
  each piece in isolation.
- **Microscope calibration**: the training WSIs are literally scans from the **PANDA
  challenge dataset itself** (not a separate/unrelated scanner) — so "Level 0" (see
  Dataset section above) is that scanner's native resolution. The user's real microscope
  camera supports **3 objective magnifications: 4x, 10x, 40x**. **Measured 2026-08-07 and
  it overturns what this bullet used to say**: every one of the 35 PANDA TIFFs carries
  `XResolution = 20568.19 px/cm` (`ResolutionUnit = 3`), identical across all of them →
  **0.48619 µm/pixel at level 0**, i.e. roughly a **20x** scan scale. The old reasoning
  here ("PANDA/Radboud slides are typically scanned near their scanner's maximum
  objective, so 40x is the closest practical match — default live capture to 40x") was
  therefore wrong: a 40x objective (~0.25 µm/px) is off by **1.95x** and a 10x objective
  (~1.0 µm/px) by **2.06x** — near-equally wrong in opposite directions, so 40x is not
  meaningfully "closest". Note the true µm/px of a camera on a microscope depends on
  sensor pixel size and the C-mount adapter, not the objective alone, so the real number
  must still come from the stage-micrometer calibration the app already supports
  (`magnification_calibration`) — what changed is that the **target** to calibrate
  against is now known — and patch extraction now uses it: the grid is sized so every
  patch covers the training span of 243.1µm (`backend/app/inference/scale.py`, built the
  same day — see the 2026-08-07 patch-extraction audit subsection).
- **`ai_models_config.py` corrected (2026-08-04)**: no longer a single fake entry per
  task — now **7 real `ModelInfo` entries** (4 classification + 3 segmentation, one per
  deployed architecture, see
  [AI inference pipeline](#ai-inference-pipeline-backendappinference)). All 7 carry the
  user's real evaluation metrics from their own training runs (`classification_
  results.csv` / `segmentation_results.csv` — not the paper's numbers); segmentation
  metrics show the aggregate columns (accuracy/IoU/DSC/FNR/FPR/specificity) plus
  `fnr_gleason_5` specifically (flagged as the clinically-relevant one), not all 22 CSV
  columns — the raw CSV stays the source of truth for the thesis write-up. `docs/PRD.md`
  still has the old SICAPv2/ResNeXt50/binary-mask wording — turns out it's spread across
  ~8 sections (§0, §3, §4, §8.3, §8.5, §9.3, §10, §11, §13), not just §8.5/§10 as first
  thought — left as a separate, larger pass pending the user's go-ahead (it's the
  thesis's own requirements doc, more sensitive to rewrite than a config file).

## Frontend architecture

`frontend/` — Vite + React 19 + TypeScript, plain inline-style components (no CSS
framework layer between the ported design and the DOM; Tailwind v4 is wired in via
`@tailwindcss/vite` for any *new* screens but the ported ones intentionally keep the
mockup's inline `style={{...}}` objects for pixel fidelity — see
[Design source](#design-source)). Icons: `lucide-react`, resolved by kebab-case name
through `src/lib/icon.tsx` (mirrors how the mockup referenced Lucide).

```
frontend/src/
  styles/tokens.css       CSS custom properties: colors, type scale, spacing/radius/shadow/motion
  index.css               Google Fonts @import (must stay first) + Tailwind + tokens.css
  types.ts                Case/Slide/Image/Region/Nav/Role mock types + API types (ApiUser,
                           AdminStats, LogEntryApi, ModelInfoApi, MigrationPreview/Result, MeResponse)
  lib/icon.tsx             kebab-case -> lucide-react component resolver
  lib/nav.ts               Sidebar nav items per role, nav->title map, nav->parent-sidebar-item map
  lib/portal.ts            Which of the two portals (doctor=5173 / admin=5174) this build is:
                            PORTAL, labels, per-portal token key, roleMatchesPortal()
                            (added 2026-08-07, see Frontend↔backend integration)
  lib/api.ts               fetch wrapper (ApiError, apiFetch) + typed calls to every backend
                           endpoint, incl. multipart uploads/migration calls, downloadBlob()
                           and getImageBlobUrl() (auth-gated image fetch -> object URL)
  lib/useApiData.ts        Shared load/error/data hook used by every real-backed screen
  lib/dzi.ts                Deep-zoom (Google Maps-style) OpenSeadragon viewer helper,
                             shared by Viewer.tsx/Annotate.tsx (added 2026-08-06, see
                             Frontend↔backend integration)
  lib/caseAdapter.ts        caseFromApi(): ApiCase -> the existing mock-shaped `Case` type,
                            so Cases/CaseDetail/CaseRow/DoctorDashboard etc. render real
                            data unchanged; AI-derived fields (gleason/primary/...) stay
                            null/placeholder since there's no AI pipeline yet
  components/ui/           Button, IconButton, Input, Select, Badge, Tag, Card, StatCard, Checkbox,
                           Switch, StateMessage (loading/error placeholder)
  components/pathology/    GleasonChip, ConfidenceMeter, CaseRow, AIOverlayToggle
  components/Histology.tsx Just Disclaimer now — the generated placeholder "H&E tissue"
                            background + clickable AI region renderer was removed once Viewer
                            started rendering the real slide image + real mask/heatmap PNGs
  components/ImageThumb.tsx Real uploaded-image thumbnail: fetches /api/images/{id}/file as
                            an authed blob (an <img src> can't carry a bearer token) ->
                            object URL; used by CaseDetail and Upload's image grid
  pages/                   One file per screen (14 total, see below)
  App.tsx                  Owns session (JWT + /me), the real `cases` fetch + reload, and
                           nav state; renders sidebar+topbar shell + active page
```

### Screens (`pages/`)

Doctor, **real backend**: `Cases` (list/search/filter), `CaseDetail` (slides/images, add
slide, real thumbnails, per-image "Đánh dấu"/"Kết quả AI" buttons), `CaseForm`
(create/edit). `Upload` — case/slide picker + real file upload (JPG/PNG/TIFF) **and live
microscope-camera capture** (`getUserMedia` + canvas frame grab), both hitting the same
image-upload endpoint with different `source`. `Annotate` — freehand polygon marking
directly on a real image, independent of any AI pipeline (see **Manual annotation** in
[Backend architecture](#backend-architecture)); reached via `CaseDetail`'s per-image
"Đánh dấu" button. **`Pipeline`/`Viewer`/`Report`** (real backend as of 2026-08-04) —
**image-scoped, not case-scoped** (`{token, imageId}`, same pattern as `Annotate`): `Pipeline`
triggers/polls `POST`+`GET /api/images/{id}/inference` and shows honest coarse status
(pending/running/completed/failed — no fake per-step animation, since the backend has no
granular progress signal); `Viewer` renders the real slide image with the real stitched
segmentation-mask/heatmap PNGs as togglable overlays (`AIOverlayToggle`, reused unchanged),
shows the AI's read-only primary/secondary/confidence/cancer-area, and a doctor-editable
review form (primary/secondary override, PNI/LVI, biopsy location, free notes) wired to
`PATCH`/`POST .../confirm`; `Report` renders the real confirmed review, with no fabricated
doctor signature (drops the mockup's hardcoded `"BS. Nguyễn Lâm"` — `reviewed_by` is a user
id with no name-lookup available to a doctor role, so the status/confirmed-at timestamp is
shown instead) and a working "In" (`window.print()`). See
[Frontend↔backend integration](#frontendbackend-integration) for the nav/data-flow details.
`DoctorDashboard`'s stat tiles are now real too (2026-08-06, see the dated bullet under
[Frontend↔backend integration](#frontendbackend-integration) — new `GET /api/stats/doctor`
endpoint). `CaseDetail`'s case-level Gleason header is now real too (2026-08-06, see the
dated "Stage 3 ML-fusion + case-level Gleason aggregation" subsection — new
`GET /api/cases/{id}/gleason` endpoint, computed live from confirmed reviews across every
image in the case, CAP-protocol style — not a schema rollup, still computed on read).
Admin (**real backend**): `AdminDashboard`, `Log`, `Models`, `Users`, `Migration`
(real 4-step legacy-data-import wizard), `Library` (real dataset export/download).
Plus `Login` (real JWT auth).

Navigation is a plain `useState<Nav>` switch in `App.tsx` (matching the original mockup's
behavior) — **not** `react-router`. No URL routing, no deep links yet; fine for a
single-session demo, but note this if the app grows (e.g. needing shareable case links).

`App.tsx` owns: the auth session (JWT in `localStorage`, hydrated via `GET /api/auth/me`
on load), the doctor-mock case/viewer/pipeline/review state (unchanged from before), and
nav. There's no context/store library — state is passed down as props, appropriate at
this size. **The sidebar no longer has a manual "Bác sĩ"/"Admin" role switcher** — that
was a pre-auth demo shortcut; role now comes from the logged-in account, and switching
means logging out and back in as the other bootstrap account (see below).

## Backend architecture

`backend/` — FastAPI + SQLAlchemy 2.0, plain `venv`/`pip` (no Poetry/uv). Talks directly
to `database/prostaai.db` — no ORM `create_all`/migrations; the schema is owned by
`docs/schema.sql` / `database/init_db.sh`.

```
backend/
  requirements.txt              incl. CPU-only torch/torchvision + segmentation-models-pytorch,
                                 pyvips + pyvips-binary (deep-zoom tile generation, see below),
                                 scikit-learn + joblib (Stage 3 ML fusion, see below)
  .env.example              copy to .env to override DATABASE_URL/JWT_SECRET/CORS_ORIGINS
  app/
    main.py                 FastAPI() + CORS + router registration
    config.py                pydantic-settings Settings (reads .env)
    database.py               engine + PRAGMA foreign_keys=ON connect listener + get_db()
    models.py                  SQLAlchemy models for all 11 schema.sql tables
    security.py                 bcrypt hash/verify, JWT encode/decode (PyJWT, HS256)
    deps.py                      get_current_user / require_admin FastAPI dependencies
    schemas/                      Pydantic request/response models, SPLIT by domain
                                   (auth.py, admin.py, cases.py, reviews.py,
                                   annotations.py, inference.py) — __init__.py re-exports
                                   everything so `from ..schemas import X` is unchanged
                                   everywhere; was one 235-line schemas.py before this split
    ai_models_config.py            Static metadata for the 8 candidate architectures (4
                                    seg + 4 classification) — NOT a DB table; classification
                                    entries carry the user's real eval metrics, segmentation
                                    entries are empty until a checkpoint exists (see below)
    audit.py                        write_audit_log() helper, shared by every mutating
                                     endpoint (see Frontend↔backend integration's audit gap note)
    preprocessing.py                 classical-CV preprocessing (blur/tissue/Macenko),
                                      no AI model — see Case/Slide/Image API below.
                                      normalize_stain() also used by inference/tiling.py
                                      (see the dated "Real PANDA-derived Macenko stain
                                      reference" subsection, added 2026-08-06)
    stain_reference.json              real Macenko reference (stain_matrix/max_concentration/
                                       luminosity_threshold), fit against a 300-image PANDA
                                       sample — see the same dated subsection
    dzi.py                            pyvips-based Deep Zoom (DZI) tile pyramid generation
                                       for Viewer.tsx/Annotate.tsx (see the dated "Deep-zoom"
                                       subsection under Frontend↔backend integration,
                                       added 2026-08-06)
    inference/                        the real AI pipeline (see AI inference section below)
      architectures.py                 get_segmentation_model()/get_classification_model()
                                        factories, ported from the training notebooks
      registry.py                       checkpoint discovery (backend/models/) + lazy-
                                         loaded model cache + ModelNotAvailableError
      tiling.py                         500x500 grid patch extraction (edge-shifted); each
                                         Patch carries the region it exclusively owns
                                         (w_valid/h_valid) — see the 2026-08-07 tiling/
                                         stitching-audit subsection
      pipeline.py                       orchestrates tile -> segment -> classify -> aggregate;
                                         also run_stage3_fusion() (added 2026-08-06, see below)
      fusion.py                         Stage 3 ML fusion — joblib model/scaler loader +
                                         predict_isup() (added 2026-08-06, see below)
    routers/auth.py                   POST /api/auth/login, GET /api/auth/me
    routers/admin.py                   everything under /api/admin/* (see below)
    routers/cases.py                    case/slide/image CRUD + upload/serve (see below)
    routers/reviews.py                   diagnostic review CRUD (see below)
    routers/annotations.py                manual freehand-annotation CRUD (see below)
    routers/inference.py                   trigger/poll/serve AI runs (see below)
    routers/calibration.py                  µm/pixel magnification calibration (see
                                             Frontend↔backend integration, added 2026-08-05)
    routers/stats.py                          GET /api/stats/doctor — real doctor-dashboard
                                               stats (see Frontend↔backend integration,
                                               added 2026-08-06)
    routers/dzi.py                              GET .../dzi + .../dzi_files/{level}/{col}_{row}.jpg
                                                 — deep-zoom tile serving (added 2026-08-06)
  models/                        gitignored except .gitkeep placeholders — where trained
                                  checkpoints go: classification/{arch}_best.pt,
                                  segmentation/{arch}_best.pt (now populated, see AI
                                  inference pipeline section). Also
                                  machine_learning_fusion/ (added 2026-08-06) —
                                  stage3_final_model.joblib/stage3_final_scaler.joblib/
                                  stage3_metadata.json, the real Stage 3 ML-fusion
                                  artifact, see the dated subsection below.
  scripts/create_user.py       one-off CLI to bootstrap a user — not an API endpoint
  uploads/                     local file storage for uploaded images (PRD §10), gitignored,
                               laid out as case_{id}/slide_{id}/{uuid}.{ext}; not seeded/
                               committed — regenerated by using the app
```

This repo now has a git working tree (`git init`, no commits made yet) specifically so the
schemas.py→schemas/ split above was a reviewable/revertable diff, not a blind file move —
there was no VCS at all before this pass.

`Pillow` (added alongside FastAPI/SQLAlchemy/etc.) validates every uploaded image by
actually decoding it (not trusting the filename extension) and converts TIFF to PNG on
the fly when serving, since browsers can't render `<img src=".tiff">` natively.

### Admin API (`/api/admin/*`, all require `role=admin` via `require_admin`)

- `GET /stats` — total cases, active users, avg pipeline processing time, error rate
  (all computed live; null/0 until there's real data — that's correct on a fresh DB).
- `GET /users`, `POST /users`, `PATCH /users/{id}` — list (with computed run-count +
  last-activity from `inference_runs`/`audit_logs`), create (bcrypt-hashes the password),
  update `is_active`/`role`/`full_name`.
- `GET /logs` — paginated `audit_logs` joined to `users.username`.
- `GET /models` — returns `ai_models_config.MODELS` (static, see above).
- `GET /library/export?format=csv|json&scope=all|reviewed` — streams an export with
  `patient_name` always dropped (anonymized per PRD §9.3 — not a toggle). **Extended
  2026-08-05** (see the dated bullet under [Frontend↔backend
  integration](#frontendbackend-integration)'s Legacy desktop app integration
  subsection): one row per **image** now, matching the legacy desktop app's own flat
  export shape, instead of one row per case — adds `slide_id`/`slide_label`/`image_id`/
  `image_number`/`magnification`/`description` plus the real `primary_pattern`/
  `secondary_pattern`/`review_status` from `diagnostic_reviews` where a review exists (a
  real improvement over the legacy export, which only ever had a free-text description).
  `scope=reviewed` now filters at image granularity (only images with a confirmed
  review) rather than pulling in every image of a case that has at least one reviewed
  image. A case with zero images still gets exactly one row under `scope=all` (slide/
  image fields blank) so it isn't silently dropped from the export.
- `POST /migration/preview` (multipart CSV) — detects columns via a Vietnamese
  diacritics-insensitive header matcher (`Mã số`→`case_code`, `Họ tên`→`patient_name`,
  etc.), returns the mapping + row count, **no DB writes**.
- `POST /migration/import` (multipart CSV, `anonymize: bool` query param) — actually
  inserts `cases` (+ one default `slides` row each) with `source='legacy_import'`; drops
  `patient_name` when `anonymize=true`. Per-row failures (e.g. duplicate
  `case_code`+`case_year`) are isolated with a SQL `SAVEPOINT`
  (`db.begin_nested()`) so one bad row doesn't roll back the whole import batch. Writes
  one `audit_logs` row summarizing the import. Case-only (no slides/images) — kept
  around as the fallback for whatever ad-hoc export an admin can produce by hand.
- `POST /migration/sqlite-preview`, `POST /migration/sqlite-import` (added 2026-08-05) —
  **the real connector PRD §8.3 flagged as an open question**, now resolved: the legacy
  desktop app ("ImageCapture", `D:\LV\Debug\`) turned out to be sitting right in the repo
  root, engine confirmed as plain SQLite via EF6 (`ImageCapture.exe.config`'s
  `System.Data.SQLite.EF6` provider). Full write-up under
  [Frontend↔backend integration](#frontendbackend-integration)'s Migration subsection.

### Case/Slide/Image API

`/api/cases/*` and `/api/images/*` — any authenticated user, not admin-only (PRD §6's
flat 2-role model has no per-doctor case ownership).

- `GET /api/cases`, `POST /api/cases`, `GET /api/cases/{id}`, `PATCH /api/cases/{id}` —
  standard CRUD; `POST`/`PATCH` reject a duplicate `case_code`+`case_year` with `409`.
- `GET /api/cases/{id}/gleason` (added 2026-08-06) — case-level Gleason/ISUP aggregation
  across every confirmed diagnostic review in the case (CAP protocol: 1 case can have up
  to 12 slides, but the signed report is per-case). Computed live, not persisted — see
  the dated "Stage 3 ML-fusion + case-level Gleason aggregation" subsection under
  [Frontend↔backend integration](#frontendbackend-integration).
- `POST /api/cases/{id}/slides` — adds a slide, auto-numbered (`max+1`), capped at 12/case
  (PRD §8.3). `legacy_slide_label` (added 2026-08-05, see Migration subsection below for
  the "legacy" it refers to) defaults to `"Slide {2N-1}-{2N}"` when the caller doesn't
  supply one — matches the real pairing convention found in the legacy desktop app's own
  data ("Slide1-2", "Slide3-4", ...), so every new slide (not just migrated ones) reads
  the way the hospital's lab already names them; still overridable via the request body.
- `POST /api/cases/slides/{slide_id}/images` — multipart image upload (`file` +
  optional `description` + `source` + `magnification` form fields — the last one added
  2026-08-05, `'4x'|'10x'|'20x'|'40x'`, optional, 400 on any other value). Capped at 8
  images/slide (PRD §8.4) and at `MAX_UPLOAD_BYTES` (200MB — microscope TIFFs can
  legitimately be several dozen MB, see below) with a `413`; rejects anything Pillow can't
  decode as JPEG/PNG/TIFF with `400`.
- `GET /api/images/{image_id}` (added 2026-08-05) — plain `ImageOut` JSON for one image
  (id/dimensions/`magnification`/etc.); previously the only per-image GETs were
  `/file` (binary), `/preprocessing`, `/review`, `/annotations` — nothing returned the
  image's own metadata directly. Added so `Viewer.tsx`'s ruler tool can look up
  `magnification` (see the dated bullet under
  [Frontend↔backend integration](#frontendbackend-integration)) without a separate
  case-tree fetch.
- `GET /api/images/{image_id}/file?size=thumb|view|original` (default `thumb`) —
  auth-gated like everything else (**not** a public static mount, since this can be real
  patient imagery); the frontend fetches it as an authenticated blob
  (`components/ImageThumb.tsx`), not a plain `<img src>`.
- `DELETE /api/images/{image_id}` (added 2026-08-05, for accidental captures — e.g. a
  webcam selfie saved by mistake during live-capture testing) — `204`, no per-doctor
  ownership check (matches the flat-role model everywhere else). DB-side cascade
  (`preprocessing_results`/`inference_runs`→`segmentation_results`/
  `classification_results`/`diagnostic_reviews`/`manual_annotations`, all `ON DELETE
  CASCADE` on `images.id`) needs nothing extra — `PRAGMA foreign_keys=ON` is already set
  per-connection. Files on disk are **not** cascaded by the DB, so the handler deletes them
  explicitly: every derivative and every inference-run output for one image shares that
  image's UUID stem as a filename prefix (`{stem}.jpg`, `{stem}_thumb.jpg`,
  `{stem}_view.jpg`, `{stem}_normalized.jpg`, `{stem}_tissuemask.png`,
  `{stem}_run{N}_segmask.png`, `{stem}_run{N}_heatmap.png`), so one
  `dest_dir.glob(f"{stem}*")` + `unlink()` catches all of them without touching other
  images in the same slide directory. Verified for real: deleted a test image through the
  actual UI, confirmed via `sqlite3` that all cascaded rows were gone and via the
  filesystem that every one of that image's files (not just the DB row) was actually
  removed, while a sibling image's files in the same directory were untouched.
- `GET /api/images/{image_id}/preprocessing` — returns the automatic preprocessing
  result for that image (see **Preprocessing** below): `is_blurry`, `quality_score`,
  and `has_normalized_image`/`has_tissue_mask` booleans (raw file paths never leave the
  server, same discipline as `ImageOut` never exposing `file_path`). `404` until the
  image has been processed (should be immediate — see below).
- `GET/PATCH /api/images/{image_id}/review`, `POST /api/images/{image_id}/review/confirm`
  — the doctor's diagnostic review (see **Diagnostic review** below). Not admin-only,
  same `get_current_user` gate as the rest of `/api/images/*`.
- `GET/POST /api/images/{image_id}/annotations`,
  `PATCH/DELETE /api/images/{image_id}/annotations/{annotation_id}` — manual freehand
  polygon annotations (see **Manual annotation** below). Same `get_current_user` gate,
  no per-doctor ownership check (any authenticated user can edit/delete any annotation,
  matching the flat-role model everywhere else).

**Preprocessing** (`backend/app/preprocessing.py`, PRD §8.4 — classical CV, no AI model
involved): runs automatically inside `upload_image`'s existing `run_in_threadpool` call,
against the just-written `_view` derivative (not the full-res original — Macenko's
matrix math on a multi-thousand-pixel TIFF would be slow for no accuracy benefit at this
scale, same "right-sized" reasoning as the thumb/view derivatives themselves). Three
checks, one `PreprocessingResult` row per image:
- **Blur**: `cv2.Laplacian(gray, cv2.CV_64F).var()` → `quality_score`; `is_blurry` if
  below a tunable heuristic constant (`BLUR_VARIANCE_THRESHOLD = 100`, not a calibrated
  clinical value).
- **Tissue detection**: Otsu threshold on the HSV saturation channel (stained tissue is
  saturated, slide background/glass is not) — same idea QuPath/Aiforia use for their
  tissue-detection step, saved as `{uuid}_tissuemask.png`.
- **Color normalization**: Macenko stain normalization (Macenko et al. 2009), implemented
  directly with numpy/OpenCV rather than pulling in `histolab` (its `openslide-python`
  dependency needs the native OpenSlide binary, which is painful to install on plain
  Windows/pip — OpenCV is the PRD's own listed alternative). **Reference values are real**
  (`backend/app/stain_reference.json`, fit against a 300-image PANDA/Radboud sample —
  added 2026-08-06, see the dated "Real PANDA-derived Macenko stain reference" subsection
  under [Frontend↔backend integration](#frontendbackend-integration); this call site was
  already here, only the reference values and background-pixel filter changed). Saved as
  `{uuid}_normalized.jpg`. `normalize_stain()` (the underlying function, public since
  2026-08-06) is **also** called per-patch inside `inference/tiling.py`, so this is no
  longer just a cosmetic upload-time derivative — real AI inference input is normalized
  too. **Best-effort**: wrapped in try/except on both the Macenko step itself (can raise
  on degenerate/near-blank images with too few tissue pixels — verified with an all-white
  test image: falls back to `normalized_image_path: null` instead of failing) and the
  preprocessing step as a whole (an upload must never fail because preprocessing
  hiccuped — the image itself was already validated and stored by Pillow before
  preprocessing even starts).
- New dependency: `opencv-python-headless` (not `opencv-python` — headless has no
  GTK/Qt system deps, installs cleanly via pip on Windows).

**Diagnostic review** (`backend/app/routers/reviews.py`, PRD §8.6): `diagnostic_reviews`
has no `UNIQUE(image_id)` constraint in `schema.sql`, so the router implements
get-or-create-latest itself (query the most recent row for that `image_id`) rather than
relying on a DB constraint that isn't there — matches the product intent of one working
copy per image (same assumption the mock `Viewer.tsx` already makes).
- `PATCH` upserts (creates the row on first call), computes `total_score` and
  `grade_group` server-side from `primary_pattern`/`secondary_pattern` whenever both are
  present, via `_grade_group()` in `reviews.py` (still the ISUP formula — kept in the API
  response and the DB for anyone who wants it, e.g. future export/analysis, but **no
  longer surfaced in the doctor-facing UI**, see the Pipeline/Viewer/Report subsection
  below: the user wants results framed strictly as Gleason grading, not ISUP Grade Group).
  **`cancer_area_percentage` was originally not settable via this endpoint** — PRD §8.6
  defines it as computed from segmentation mask/tissue area (an AI output), so
  fabricating a number by hand here would be exactly the kind of overclaim the design
  system's voice rules forbid elsewhere. **Corrected 2026-08-05**: it's now accepted in
  `DiagnosticReviewUpdate`, but the frontend is still the one enforcing the "never
  hand-entered" rule — `Viewer.tsx`'s `handleSave()` always sends the *real* value read
  straight from `run.segmentation.cancer_area_percentage`, never a doctor-typed number
  (closes a known gap: `Report.tsx` used to always show "Chưa có diện tích ung thư" even
  for a confirmed review, since nothing had ever written this field before). Also gained
  `tumor_length_mm` and `needs_second_opinion`/`second_opinion_notes` the same day — see
  the dated bullet under
  [Frontend↔backend integration](#frontendbackend-integration).
  Returns `423 Locked` if the review is already `status='confirmed'`.
- `POST .../confirm` sets `status='confirmed'` + `confirmed_at` + `reviewed_by` (soft
  lock, no real legal e-signature — PRD §8.6). `409` if already confirmed, `404` if no
  draft exists yet.
- `GET /api/reviews/flagged` (added 2026-08-05, `routers/reviews.py`'s separate
  `flagged_router`) — flat worklist of every review with `needs_second_opinion=1` and
  `status != 'confirmed'`, joined up to case/slide for display (`case_label`,
  `slide_label`). Deliberately **not** nested under `GET /api/cases` — patching that
  ORM-driven, `from_attributes=True` response just to surface one per-image flag would
  have been real extra complexity for a feature this size; a flat endpoint was cheaper
  and is arguably more useful anyway (a real cross-case worklist, not a flag buried
  inside whichever case's detail page a doctor happens to open).
- Both `PATCH` and `confirm` write an `audit_logs` entry.

**Audit log gap closed**: `create_user`/`update_user` (`admin.py`) and
`create_case`/`update_case`/`add_slide`/`upload_image` (`cases.py`) now all write
`audit_logs` via a shared `write_audit_log()` helper (`backend/app/audit.py`) — this was
a known gap (only `migration/import` used to log anything); verified via
`GET /api/admin/logs` showing entries for all of the above after exercising each
endpoint. `action`/`entity_type` values follow the vocabulary already suggested in
`docs/schema.sql`'s own comments (`"create_case"`, `"confirm_review"`, etc.).

**Explicitly out of scope for now** (confirmed with the user): `inference_runs`/
`segmentation_results`/`classification_results` (no trained model checkpoint exists yet
— training happens on Colab, outside this repo; the user chose not to build a
placeholder/stub inference and would rather wait for real `.pt` checkpoints), and
`reports`/PDF-HTML export (PRD §8.8 — the user said they don't need this feature).

**Manual annotation** (`backend/app/routers/annotations.py`, `frontend/src/pages/
Annotate.tsx`): a doctor-driven, AI-independent tool modeled on how real digital-
pathology software (Aiforia, QuPath) lets a pathologist mark up a slide directly —
freehand polygon regions on the **real** uploaded image (via the existing
`GET /api/images/{id}/file?size=view` endpoint), each optionally tagged with a Gleason
Pattern (3/4/5) plus a free-text note. Deliberately has **no `run_id`/FK to
`inference_runs` anywhere** — this is independent of and does not require the AI
pipeline to exist, unlike `diagnostic_reviews` which is the case-level aggregate score.
- New table `manual_annotations` (`docs/schema.sql` + applied directly to the live
  `database/prostaai.db` — see the migration note below): `image_id`, `points` (JSON
  array of `{x,y}` polygon vertices, 0-100 as % of the image, not pixels — stays
  correctly positioned regardless of which derivative size is displayed), optional
  `gleason_pattern`, optional `note`, `created_by`, timestamps.
- `AnnotationOut` includes a server-computed `area_percentage` (shoelace formula on the
  0-100 coordinate space) — a spatial estimate only, no physical calibration exists, so
  the frontend labels it as an estimate rather than a clinical measurement (same honesty
  standard as the PRD's own caution about the un-built digital caliper in §8.7).
- **Frontend interaction**: click-to-place-vertex polygon drawing (not continuous
  mouse-drag tracing) — the same technique professional tools like QuPath actually use
  for their polygon tool: produces fully arbitrary shapes while staying implementable/
  re-editable in a plain `<svg viewBox="0 0 100 100">` overlay sized to exactly match
  the rendered `<img>` (no letterboxing math needed since the image uses `width:100%;
  height:auto` and the container has no independent size). Reshaping an existing
  polygon's vertices is out of scope — editing only covers pattern/note; changing the
  shape means delete + redraw.
- Reached from `CaseDetail`'s per-image "Đánh dấu" button (only shown once an image has
  a real `dbId`) → `App.tsx`'s `annotateImageId` state + `goAnnotate()`, the same
  one-way-context pattern as `uploadContext`/`goUpload`. **Known pre-existing gap,
  unrelated to this feature**: once you navigate away from `CaseDetail` (e.g. via
  "Thêm ảnh"/"Chụp ảnh" into `Upload`), there is currently no button anywhere that
  returns to that same `CaseDetail` (`Cases`/`DoctorDashboard` row-clicks always open
  the mock `Viewer`, not `CaseDetail`; `CaseDetail` is normally only reached once, right
  after `CaseForm` saves). Worth fixing later — e.g. a "Xem chi tiết" affordance on the
  case row, or a real `caseId` deep-link — but out of scope for this pass.
- **Migration note** (precedent for any future schema addition against a live,
  non-empty database): `database/init_db.sh` drops and recreates `prostaai.db` from
  `docs/schema.sql`, which would destroy the real accounts/case data this file now has —
  **never run it against the live file**. Additive changes go two places by hand: the
  `CREATE TABLE`/`CREATE INDEX` appended to `docs/schema.sql` (source of truth for any
  future fresh setup), and the identical DDL applied directly —
  `sqlite3 database/prostaai.db "PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS ...;"`
  — against the live file. Verified with `PRAGMA foreign_key_check;` and a user count
  check before/after.

**Large-image handling**: researched how WSI software (Aiforia, QuPath, etc.) deals with
this — they never ship the original to the client, instead pre-generating a resolution
pyramid tiled via OpenSeadragon/OpenSlide. This section originally judged that "oversized
for our single-frame captures" and implemented a smaller thumb/view-derivative version
instead — **that call was reversed 2026-08-06** once real gigapixel-scale WSI files (the
PANDA training dataset's own TIFFs, `test_image/PANDA_image_test/train_images/*.tiff`)
were actually opened in `Viewer.tsx`/`Annotate.tsx` and their gland structure was
illegible when zoomed in — a real deep-zoom tile pyramid now exists for exactly this case,
see the dated "Deep-zoom (Google Maps-style) tile viewer" subsection under
[Frontend↔backend integration](#frontendbackend-integration). The thumb/view derivatives
described below are unaffected and still used as-is for thumbnail grids
(`CaseDetail`/`Upload`) — they were never the thing that needed replacing; only the
*Viewer/Annotate canvas* now bypasses them in favor of real per-tile detail:
- At upload time (`_process_and_store` in `routers/cases.py`), alongside the untouched
  original (`{uuid}.{ext}`), two JPEG derivatives are generated once and written next to
  it: `{uuid}_thumb.jpg` (≤320px, quality 82) and `{uuid}_view.jpg` (≤2400px, quality 88).
  `size=thumb`/`view` just reads that pre-made file — no Pillow work at request time.
  `size=original` keeps the on-the-fly TIFF→PNG conversion as a fallback for whenever
  full resolution is genuinely needed (rare — the AI pipeline will read the file on disk
  directly rather than through this HTTP endpoint).
- All of that decode/resize/write work runs via `fastapi.concurrency.run_in_threadpool`,
  not inline in the `async def` route — it used to block the whole event loop (freezing
  every other request) for as long as a large file took to decode. Verified with a real
  5000×3500 52.5MB TIFF: uploaded + processed (original + both derivatives written) in
  ~0.75s, thumb came back 320×224 / 1.7KB, view 2400×1680 / 63KB.
- `PILImage.MAX_IMAGE_PIXELS = 300_000_000` — raises Pillow's decompression-bomb bar for
  legitimately large microscopy images without disabling the check outright.
- `_read_capped()` reads uploads in 1MB chunks and 413s as soon as the running total
  passes `MAX_UPLOAD_BYTES`, instead of buffering an unbounded upload into memory first.
  The frontend (`pages/Upload.tsx`) duplicates the same 200MB figure as a client-side
  pre-check, just to skip a pointless network round-trip — keep both in sync by hand.

**Live camera capture** (PRD §8.4's "chụp trực tiếp" flow): the frontend's `Upload.tsx`
calls `navigator.mediaDevices.getUserMedia({ video: true })` to open whatever camera the
OS exposes — a USB microscope camera looking like a standard UVC webcam works exactly
like a laptop camera here, no special driver integration needed. The "Lưu" button grabs
the current `<video>` frame onto an offscreen `<canvas>`, exports it as a JPEG blob
(`canvas.toBlob`), and uploads it through the same endpoint as a file pick, tagged
`source: 'live_capture'` (a value the schema's `images.source` CHECK constraint already
anticipated). **Caveat**: this sandboxed dev environment has no camera device, so the
capture path itself could only be verified up to the permission/device-detection layer —
confirmed clean handling of "no camera found," "permission denied," and "browser doesn't
support it," with the file-upload path staying fully usable in every case. The actual
video-frame-to-upload path needs verification on a real machine with a camera attached.

### AI inference pipeline (`backend/app/inference/`)

Built as **scaffolding ahead of real checkpoints**, confirmed with the user: the endpoints
and pipeline logic are fully real, but `backend/models/{segmentation,classification}/` is
empty today, so every run currently ends in `status='failed'` with a clear message —
verified end-to-end via curl, not hypothetical. Order confirmed with the user:
**segmentation always runs first**, and its output gates which patches classification
even looks at (see [AI models](#ai-models--training-methodology-colab-notebooks) for the
"why" — this whole section assumes that context).

- `architectures.py` — `get_segmentation_model()`/`get_classification_model()` build the
  exact same module graph as the training notebooks (same encoder names, same class
  counts, dropout-wrapped heads where the notebook did) so a checkpoint's `state_dict`
  loads with `strict=True` and no key mismatch. `encoder_weights=None` (no ImageNet
  download at inference time — pointless since the checkpoint immediately overwrites it).
- `registry.py` — `MODEL_ROOT = backend/models/`. `list_available(task)` returns
  architecture names that actually have a `{arch}_best.pt` file on disk (this is what
  makes "deploy all 4, pick in the UI" work with zero extra code — the picker is just
  whatever files exist). `load(task, arch)` lazy-loads + caches in memory; raises
  `ModelNotAvailableError` (never a raw crash) if the checkpoint is missing.
  `torch.load(..., weights_only=False)` — deliberate: our checkpoints are a trusted local
  dict (model/optimizer state + a couple of scalars), not an arbitrary download, so
  torch≥2.6's stricter default is safe to opt out of.
- `tiling.py` — 500×500 grid patches, edge windows shifted inward (matches the training
  data's own convention, see Dataset section), tissue-only (reuses `preprocessing.py`'s
  `_tissue_mask` Otsu logic per-patch). **Tiles the full-resolution original**, not the
  `_view` derivative — training patches are 500×500px at the WSI's native resolution, so
  downscaling first would break the physical-scale match the whole patch approach
  depends on (a correction from an earlier high-level sketch of this pipeline). Each
  tissue patch is also Macenko-normalized (`preprocessing.py`'s `normalize_stain()`,
  added 2026-08-06 — see the dated "Real PANDA-derived Macenko stain reference"
  subsection under [Frontend↔backend integration](#frontendbackend-integration)) before
  being handed to segmentation/classification, falling back to the raw crop if a patch
  fails normalization.
- `pipeline.py` — `run_pipeline()`: tile → segment every tissue patch (500→256, argmax
  6-class, stitched into one full-size mask, saved as a colored PNG using the same
  palette as the notebooks) → classify only patches with predicted G3/G4/G5 pixels
  (500→224, softmax) → aggregate primary/secondary pattern by classified area (largest
  area wins primary; second-largest is secondary; single pattern → secondary = primary,
  standard ISUP convention) → `grade_group` via the **existing** `_grade_group()` from
  `routers/reviews.py` (reused, not reimplemented — confirmed no separate "Stage 3" model
  for now). Resize/normalize is **plain cv2 + numpy**, not `albumentations` — that
  library's `albucore` dependency pulled in a `numkong` native extension with a broken
  DLL on this Windows machine, so it was dropped entirely in favor of a ~10-line manual
  reimplementation of the exact same `Resize(bilinear) + Normalize(ImageNet mean/std)`
  the notebooks used via `albumentations`. **Heatmap generation removed (2026-08-05)**:
  `pipeline.py` used to also build a per-patch confidence heatmap
  (`classification_results.heatmap_file_path`) via `cv2.applyColorMap`, but this was only
  ever a v1 stand-in (color intensity by predicted-class confidence, not real Grad-CAM/
  Attention-Rollout) and the user asked for it dropped from the prediction output entirely
  rather than carried forward — see the dated bullet under
  [Frontend↔backend integration](#frontendbackend-integration) for the full removal
  (backend + frontend + the now-deleted `GET /api/inference-runs/{run_id}/heatmap`
  endpoint). `classification_results.heatmap_file_path` stays as a DB column (harmless,
  always `NULL` going forward) — dropping a live SQLite column wasn't worth the migration
  risk for a column nothing writes to anymore.

**Endpoints** (`routers/inference.py`, `Depends(get_current_user)`, not admin-only):
- `POST /api/images/{image_id}/inference` — body `{segmentation_model?, classification_model?}`
  (both optional; default to the first *available* checkpoint per task, or the first known
  architecture name if none are available — so the run still gets created and then fails
  informatively rather than being rejected outright). Creates an `InferenceRun` row
  (`status='pending'`), schedules `_execute()` via FastAPI `BackgroundTasks` (no
  Celery/Redis, per PRD), returns immediately. **`_execute()` opens its own fresh DB
  session** (`SessionLocal()`, not the request's `Depends(get_db)` one) — the
  request-scoped session is already closed by the time a background task actually runs
  (Starlette runs these after the response is sent), a real bug caught during
  verification, not a hypothetical. Any exception (including `ModelNotAvailableError`)
  → `status='failed'` + `error_message`, never leaves a run stuck at `running`.
- `GET /api/images/{image_id}/inference` — latest run for that image, with nested
  segmentation/classification results if present.
- `GET /api/inference-runs/{run_id}/mask` — auth-gated PNG serving, same blob-response
  pattern as `GET /api/images/{id}/file`. (`.../heatmap` existed here too until
  2026-08-05, removed alongside heatmap generation — see above.)
- `GET /api/admin/models` (admin-only) and **`GET /api/models`** (any authenticated user,
  added 2026-08-04 for the doctor-facing model-selector — see below) both report
  `checkpoint_available`/`trained_at`/`status` per architecture, computed live via the
  shared `ai_models_config.list_model_infos()` helper (`registry.is_available(task_type,
  arch_key)` + the checkpoint file's mtime) — never baked into `ai_models_config.MODELS`
  itself, so dropping a new checkpoint in changes the API response with zero file edits.
  Verified for real: all 4 classification entries and all 3 deployed segmentation entries show
  `checkpoint_available: true` with the user's actual metrics — all 7 checkpoints load
  successfully through `registry.load()` with `strict=True`, confirmed via a real forward
  pass, not just `state_dict` loading.

**First full pipeline run** (2026-08-04, curl-verified): with both tasks now having real
checkpoints, `POST /api/images/{id}/inference` on a real uploaded image reached
`status='completed'` end to end — tiled the original, ran every tissue patch through
segmentation, stitched a real colored mask PNG matching the original's exact dimensions,
gated classification correctly (zero cancer-flagged patches on a synthetic non-tissue
test image → classification never ran → `primary_pattern`/`secondary_pattern` correctly
`null`, not a fabricated pattern), and served the mask back via
`GET /api/inference-runs/{id}/mask`. This is the first real evidence the whole
tile→segment→classify→aggregate chain is wired correctly, not just each piece verified
in isolation.

**Frontend wiring, done 2026-08-04**: `Pipeline.tsx`/`Viewer.tsx`/`Report.tsx` now call
these endpoints for real — see [Frontend↔backend integration](#frontendbackend-integration)
for the nav restructuring and UI details.

### Running the backend

```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
python scripts/create_user.py --username you@example.com --password ... --role admin
uvicorn app.main:app --reload --port 8000
```

Bootstrap accounts that already exist in `database/prostaai.db` (password shown so you
can actually log in — change/remove before this ever leaves a local machine):
`admin@prostaai.vn` / `admin123` (admin), `lam.nguyen@benhvien.vn` / `doctor123` (user),
`ha.tran@benhvien.vn` / `pass123` (user), `son.pham@benhvien.vn` / `pass123` (user,
created through the Users admin screen during integration testing).

All endpoints verified end-to-end with `curl` first, then again through the real frontend
UI (see below). **Gotcha found during that testing**: native Windows `curl.exe` (the
mingw64 build Git Bash resolves to) cannot read Git-Bash-style `/tmp/...` paths for
`-F file=@...` uploads — use a real path like `D:/LV/...` for multipart file uploads when
testing from this shell.

## Frontend↔backend integration

The 6 Admin screens + `Login` call the backend via `frontend/src/lib/api.ts`
(`VITE_API_BASE_URL` in `frontend/.env`, defaults to `http://localhost:8000`). Each
screen follows the same shape: `useApiData(() => api.getX(token), [token])` returns a
`{status: 'loading'|'error'|'data', ...}` union rendered through `<StateMessage>` for the
non-happy paths.

- **Auth**: `Login.tsx` calls `POST /api/auth/login` then `GET /api/auth/me`; `App.tsx`
  stores the JWT in `localStorage` (key `prostaai_token_{doctor|admin}` — per-portal since
  2026-08-07, see the dated "Two-portal split" subsection below; it was a single shared
  `prostaai_token` before) and re-hydrates the session via `/me` on page load. There is
  **no role picker anymore** — the account's role decides doctor vs admin nav, and the
  portal the app was built/served as decides which roles may log in at all.
- **Users**: create form + a click-to-toggle status `Badge` (`PATCH .../users/{id}`) —
  the mockup didn't have a toggle interaction, added because otherwise nothing in the UI
  would ever exercise that endpoint.
- **Migration**: real file input (`<input type="file" accept=".csv">`) replaces the fake
  engine-picker/hardcoded field-mapping/hardcoded "128 ca" from the mockup. Import is
  gated on a real "confirmed permission to use this data" checkbox before the button
  enables — verified by clicking it while unchecked and confirming the step didn't
  advance.
- **Library**: real blob download (`URL.createObjectURL` + temporary `<a download>`); the
  segmentation-mask/Gleason-label export checkboxes from the mockup were **removed**
  rather than wired, since the backend export doesn't actually support toggling those and
  fake-but-inert checkboxes would be misleading.
- Field-name notes: backend `users` has no `email` column (only `username`, which happens
  to look like an email) — the Users table column is labeled "Tên đăng nhập", not "Email".
  Backend `audit_logs` has no `edited` boolean or friendly case-code — the old mockup's
  "Đã sửa" badge and case-id column don't have a real equivalent and were replaced with
  the actual `entity_type`/`entity_id`/`details` fields.
- **Fixed** (was documented here as a gap, corrected in place 2026-08-07 during a system
  audit — the code had actually already been fixed earlier and this note just never got
  updated): `create_user`/`update_user` (`admin.py`) now write `audit_logs` via the shared
  `write_audit_log()` helper, same as every other mutating endpoint — confirmed directly
  in the current source, not assumed.

Verified through the actual browser UI (not just curl): admin login → real stats/users/
models/empty-log render → create a user → toggle a user's active status (confirmed
persisted via `sqlite3`) → full migration wizard with a real uploaded CSV (preview showed
real column mapping, import correctly skipped a row missing `case_code`, dashboard's
total-cases stat updated afterward) → library export downloaded a file → logged out,
logged in as a doctor account, confirmed the doctor dashboard still shows mock data and a
direct `fetch('/api/admin/stats')` from the browser console still returns `403` (hiding
the nav item is not real access control — the backend enforces it either way).

### Cases/CaseDetail/CaseForm/Upload

- **`lib/caseAdapter.ts`** is the key seam: it converts a real `ApiCase` into the
  mock-shaped `Case` type (`id` becomes a display string like `PA-2026-0601`, with the
  real numeric id carried separately as `dbId` on the case/slide/image, since the visible
  case/slide/image ids and the ids needed for API calls are different things). This let
  `Cases.tsx`, `CaseRow`, and `DoctorDashboard`'s recent-case list keep working completely
  unchanged — only their data source changed, not their code.
- **`CaseForm`** now does its own `createCase`/`updateCase` call (like every other form in
  this app) instead of `App.tsx` mutating a local array; the mockup's "Slide 1,2 / Slide
  3,4…" pair-picker itself is gone — slides are added from `CaseDetail` after the case
  exists. **Correction (2026-08-05)**: this bullet originally said the pair-picker "never
  mapped to anything real" — that was wrong. `Debug/ImageCapture.db` (the actual legacy
  desktop app, see the Migration subsection below) names its slides exactly this way
  ("Slide1-2", "Slide3-4", ...); the mockup was accurately modeling a real lab convention,
  the assumption was just never checked against the real software. The convention itself
  is now restored — see `add_slide`'s new default `legacy_slide_label` above and
  `caseAdapter.ts`'s `slide.label` below — just not as a manual picker in `CaseForm`.
- **`CaseDetail`** adds a real "Thêm slide mới" button (`POST /slides`) and renders real
  image thumbnails via `ImageThumb`. Its Gleason header shows a neutral "Chưa có kết quả
  AI" badge instead of the mockup's `pattern={c.gleason || '3'}` fallback — that fallback
  would otherwise paint a fake green "Pattern 3" chip on every newly created real case,
  which is exactly the kind of overclaim the design system's voice rules forbid.
  **Bug fixed 2026-08-05**: each image tile's fixed 150px width couldn't fit "Đánh dấu" and
  "Kết quả AI" side-by-side (`flex:1` each, ~73px — neither label fits at that width), so
  the buttons overflowed their flex box and visually bled into the neighboring tile's
  buttons. Fixed by stacking them vertically (`fullWidth` each) instead — confirmed via a
  real bounding-box measurement in the browser (each button now exactly 150px wide, zero
  overlap between tiles). Also added a small delete (`×`) icon overlaid on the thumbnail's
  top-right corner, calling the new `DELETE /api/images/{id}` (see Case/Slide/Image API
  above) behind a `window.confirm` — for removing accidental captures (e.g. a webcam
  selfie saved by mistake) without deleting the whole case. `Upload.tsx`'s post-capture
  grid got the same delete affordance, since that's literally the capture screen where a
  mis-capture is first noticed.
- **`Upload`** always shows a case picker + slide picker (pre-filled when reached via
  `CaseDetail`'s "Thêm ảnh", editable otherwise); "+ Slide mới" in the slide picker creates
  one on the spot. File upload and camera capture both post to the same endpoint with a
  different `source`. Verified through the actual UI: created a case → added a slide →
  uploaded a real `.tiff` and a real `.jpg` (simulated via a `DataTransfer`-constructed
  `File`, since there's no way to drive a native OS file dialog from here) → both appear
  as real, correctly-sized thumbnails (confirmed the TIFF one decodes to the right pixel
  dimensions after server-side PNG conversion) → confirmed in `sqlite3` that `images.format`/
  `width_px`/`height_px`/`source` are all correct, then cleaned up the test case.
- Camera: this sandbox has no camera device, so `getUserMedia` predictably hit the
  permission-denied path — confirmed the UI degrades cleanly ("Chưa được cấp quyền truy
  cập camera." + a hint that file upload still works), no crash, no console errors. The
  actual live-video-frame-capture path needs verification on real hardware.

### Legacy desktop app integration (2026-08-05)

The user pointed at `D:\LV\Debug\` — a build output that turned out to be **the real
desktop software already in use at the hospital** ("ImageCapture", WinForms/.NET 4.7.2,
DevExpress, EF6), sitting in the repo root the whole time, complete with its own real
SQLite database (`Debug/ImageCapture.db`) and real microscope-captured TIFFs
(`Debug/Images/*.tiff`). Read directly (schema + sample rows, not guessed):

```
CaBenh (Id, MaSo, MaNam, HoTen, Tuoi, KetLuan, NgayTao)
Slide (Id, CaBenhId, TenSlide, MoTa, NgayTao)               -- TenSlide "Slide1-2","Slide3-4"...
SlideDoPhongDai (Id, SlideId, DoPhongDai, GhiChu)            -- DoPhongDai "4X"/"10X"/"20X"/"40X"
HinhAnh (Id, SlideDoPhongDaiId, TenFile, DuongDan, MoTa, ...) -- MoTa = free-text Gleason label
```

Confirmed this schema so closely mirrors ours that `schema.sql` already had
`legacy_case_id`/`legacy_slide_label`/`legacy_image_id`/`source='legacy_import'` columns
sitting unused — someone designed for exactly this migration up front, it just hadn't
been executed. Three concrete integrations landed from this, all user-prioritized via
`AskUserQuestion`:

- **`images.magnification`** (new column, `'4x'|'10x'|'20x'|'40x'`, nullable) — added to
  `docs/schema.sql` (with a `CHECK`) and applied to the live `database/prostaai.db` via
  `ALTER TABLE images ADD COLUMN magnification TEXT;` (deliberately **without** a `CHECK`
  on the live ALTER — SQLite's constraint support for columns added via `ALTER TABLE` is
  narrower/version-sensitive than a full `CREATE TABLE`, not worth testing against the
  live file; validated in the Pydantic layer instead, see Case/Slide/Image API above).
  This is the field CLAUDE.md's own Next steps had been flagging as missing since the
  µm/pixel-calibration discussion — the legacy app's `SlideDoPhongDai` junction table is
  exactly this concept (one row per slide × magnification), confirming it's a real,
  already-validated field to add, not a guess. `Upload.tsx` now has a "Độ phóng đại"
  `Select` (default `40x`, per the earlier documented recommendation that 40x is the
  closest match to the PANDA/Radboud training scale) alongside the description field;
  `CaseDetail.tsx` shows it as a small badge on each thumbnail.
- **Slide pairing restored**: `add_slide` (`routers/cases.py`) now defaults
  `legacy_slide_label` to `f"Slide {2*next_number-1}-{2*next_number}"` when the caller
  doesn't supply one — the exact formula that reproduces the legacy data's own numbering
  (slide 1→"Slide 1-2", 2→"Slide 3-4", 3→"Slide 5-6", ... confirmed against
  `Debug/ImageCapture.db`'s real rows). `caseAdapter.ts`'s `slide.label` now reads
  `s.legacy_slide_label ?? \`Slide ${s.slide_number}\`` instead of always the generic
  form — every existing consumer (`CaseDetail`, `Upload`, `DoctorDashboard`) picked this
  up for free since they already rendered `slide.label`, no other code changed. See the
  correction note on the old "fake pair-picker" bullet above — the mockup wasn't fake.
- **Real legacy SQLite connector**, alongside (not replacing) the CSV path: new
  `POST /api/admin/migration/sqlite-preview` and `.../sqlite-import`
  (`routers/admin.py`). Both write the uploaded `.db` to a `tempfile`, open it **read-only**
  (`sqlite3.connect(f"file:{path}?mode=ro", uri=True)`, stdlib — no new dependency), and
  reject anything missing the 4 expected tables with a `400` before doing any work. Preview
  returns case/slide/image counts + a per-case breakdown + the distinct magnifications
  found, no DB writes. Import walks `CaBenh → Slide → (SlideDoPhongDai⋈HinhAnh)`, creating
  our `Case`/`Slide`/`Image` rows with `source='legacy_import'` and the real
  `legacy_case_id`/`legacy_slide_label`/`legacy_image_id`/`magnification` carried over
  (`DoPhongDai` lowercased to match our convention); reuses the **same** nested-SAVEPOINT
  duplicate-tolerance pattern as the CSV importer, and the **same**
  `_process_and_store()`/`_read_capped()`/`UPLOAD_ROOT` helpers as the normal image-upload
  endpoint (imported from `routers/cases.py` — no duplicated file-handling logic). The
  legacy DB's `HinhAnh.DuongDan` is an absolute path from the *original* machine and is
  never valid here, so real image bytes are matched back to their `HinhAnh` row by
  filename (`TenFile`) against a second, optional multipart field (`image_files: list[
  UploadFile]`) the admin uploads alongside the `.db` — a slide with no matching file still
  gets created (metadata-only), just with `images_skipped` incremented and a reason
  recorded, rather than blocking the whole import. `Migration.tsx` gained a source-type
  toggle at Step 0 ("File CSV" vs "Cơ sở dữ liệu ImageCapture (.db)"); the sqlite branch
  gets its own file inputs (one `.db`, one `multiple` for images), its own Step-1 preview
  rendering (case list + counts instead of CSV column mapping), and its own Step-3 result
  shape — Steps 2 (anonymize) and the overall 4-step shape are shared with the CSV flow.
  **Verified for real, not just via the UI**: ran the actual `Debug/ImageCapture.db` +
  all 9 files in `Debug/Images/` through `POST .../sqlite-import` — preview and import
  both matched the DB's own real counts exactly (`sqlite3 Debug/ImageCapture.db` showed
  `CaBenh=2, Slide=7, SlideDoPhongDai=28, HinhAnh=8` beforehand); the import produced 2
  cases / 7 slides / 8 images / 0 skipped, `sqlite3 database/prostaai.db` confirmed
  `legacy_slide_label` values exactly matching the source `TenSlide` strings
  ("Slide1-2".."Slide11-12"), image `description` holding the original free-text Gleason
  labels ("Lành tính"/"Gleason 3+4"/"Gleason 3+3") verbatim, `magnification` correctly
  lowercased, and `width_px`/`height_px` matching the real TIFF dimensions; one imported
  image was fetched back through `GET /api/images/{id}/file?size=thumb` and returned real
  JPEG bytes. Then in the actual browser UI (admin login): `AdminDashboard`'s activity feed
  showed the real `migrate_data` audit entry with the correct counts; logged in as a
  doctor, opened the imported/manually-tested case in `CaseDetail` and confirmed the
  auto-paired slide label ("Slide 7-8") and the "40x" magnification badge both rendered
  correctly on a real uploaded image; `Upload.tsx`'s "Độ phóng đại" selector and the
  already-uploaded strip's magnification suffix ("H1 · 40x") both confirmed too. All test
  cases (manual + both legacy imports) deleted afterward via the real `DELETE
  /api/images/{id}` endpoint + cascading `sqlite3` cleanup for the case/slide rows and
  `backend/uploads/case_*` directories; the user's real case (`0001`) confirmed untouched
  throughout (`sqlite3 database/prostaai.db "SELECT id, case_code FROM cases;"` → only
  `5|0001` remained).
- **Library export extended to match the legacy shape (same day, follow-up)**: the user
  asked, after this integration landed, whether Admin's "Xuất thư viện" had been updated
  the same way — it hadn't. `GET /api/admin/library/export` used to emit one row per
  **case** only (no slide/image data at all, so no `magnification`/`legacy_slide_label`
  ever appeared in it). Rewrote `export_library()` (`routers/admin.py`) to emit one row
  per **image** — matching `Debug/Export_*.xlsx`'s own flat shape (Ma So/Ma Nam/Ket Luan/
  Ten Slide/Do Phong Dai/Gleason) — joining case → slide (`slide_label`, falling back to
  `Slide N` the same way `caseAdapter.ts` does) → image (`magnification`, `description`),
  plus the real structured `primary_pattern`/`secondary_pattern`/`review_status` from the
  latest `diagnostic_reviews` row per image where one exists (the legacy export never had
  this — it only had the free-text description doubling as a Gleason label). A case with
  zero images still emits exactly one row under `scope=all` so it isn't silently dropped;
  `scope=reviewed` now filters per-image (only rows with a confirmed review) instead of
  the old per-case join, which used to pull in *every* image of a case as soon as *any one*
  image had a confirmed review. **Verified for real**: exported against the real case
  `0001` (3 images, no reviews yet → all fields present, review columns null) and a
  disposable test case with a `20x` image + a confirmed `4+3` review — `scope=all` showed
  both correctly, `scope=reviewed` correctly returned only the confirmed row and excluded
  everything else, confirmed via both `curl` (CSV and JSON) and the real browser UI (the
  actual "Xuất thư viện" button, network request inspected directly — real `200 OK` GET to
  `/api/admin/library/export`, "Đã tải xuống prostaai_library_export.csv." shown). Test
  case deleted afterward; case `0001` confirmed untouched.
- **Not done this pass** (out of scope per the user's own prioritization —
  `AskUserQuestion` offered it, not selected): `tiling.py`'s 500×500 patch extraction
  doesn't special-case source images smaller than 500×500 — real legacy captures range
  from 193×120 up to ~2752×1536 (see `Debug/Images/*.tiff`), well under the training
  patch size, so a naive `cv2.resize()` to 256/224 for inference would examine the
  *entire* tiny capture blown up rather than a physically-comparable patch. Not a crash,
  just a silent accuracy risk on exactly the kind of image this integration pass just
  made it easier to bring in — flagged for a future pass, not fixed here.

### Pipeline/Viewer/Report (2026-08-04)

Wired to the real inference (`inference.py`) and review (`reviews.py`) endpoints, replacing
every piece of mock diagnostic data (`REGIONS`, the fake 7-step `PIPELINE` timer, the
generated fake-tissue `Histology` background) — see [AI inference
pipeline](#ai-inference-pipeline-backendappinference) for the endpoint contracts.

- **Navigation is now image-scoped, not case-scoped**: since inference/review operate on
  one `image_id` at a time and there's no per-region/bbox data anywhere in the schema
  (`segmentation_results`/`classification_results` are one row per run — an aggregate
  primary/secondary pattern + one stitched mask PNG, nothing finer-grained), `Pipeline`/
  `Viewer`/`Report` take `{token, imageId}` exactly like `Annotate` already did, not
  `{case}`. `App.tsx` holds one `aiImageId` state shared by all three, set via
  `goPipeline(imageId, caseId?)`/`goViewer(imageId)`.
- **Case-row click now opens `CaseDetail`, not `Viewer`** (`openCase` in `App.tsx`) — this
  was also the fix for a previously-documented gap ("no way back to `CaseDetail` once you
  navigate away"). `CaseDetail`'s per-image tile has two buttons now: "Đánh dấu" (annotate,
  unchanged) and "Kết quả AI" (→ `Viewer` for that image). The case-level "Chạy phân tích
  AI" header button was removed — a case can have 0..N images across N slides, so a
  case-level trigger was always ambiguous about which image it meant.
- **`Pipeline`**: on mount, `GET`s the latest run for the image. If one already exists (any
  status — pending/running/completed/failed), skips straight to the status display below.
  If none exists yet, shows a **model-selector "pick" screen** first (added 2026-08-04):
  two `Select`s (segmentation, classification), populated from the new `GET /api/models`
  (any authenticated user — `GET /api/admin/models` is `require_admin`-gated, doctors
  aren't admins, so a separate endpoint was needed; both now share one
  `ai_models_config.list_model_infos()` helper so they can't drift apart), **filtered to
  `checkpoint_available: true` only** and defaulted to the first available entry per task
  (matches the trigger endpoint's own default). Each option shows the model's real `name`
  + a couple of its real `metrics` as a hint. "Bắt đầu phân tích" then `POST`s the run with
  the doctor's actual picks. Once a run exists (freshly triggered or found on mount), polls
  every ~2.5s while `pending`/`running` and renders 3 honest states (running/completed/
  failed) with a *static* reference list of the real pipeline stages — deliberately not an
  animated per-step tracker, since the backend only reports coarse status, and ticking off
  fake steps would fabricate progress that isn't real. On `failed`, "Thử lại" goes back to
  the picker (pre-filled with the failed run's own architecture choices, but **only if each
  one is still a real available checkpoint** — falls back to the default otherwise, so a
  bogus/removed arch_key never gets silently resubmitted) rather than blindly retriggering.
  **Bug fixed in this pass**: the previous retry logic only called `triggerInference()`
  when `getInference()` returned nothing — since a failed run row still exists (non-null),
  that condition never actually re-triggered anything; "Thử lại" just re-displayed the same
  stale failure forever. The picker flow fixes this as a side effect (retry always routes
  through an explicit new `POST`).
- **`Viewer`**: real slide image (`getImageBlobUrl(..., 'view')`, same auth-gated-blob
  pattern as `Annotate`) with the real mask/heatmap PNGs (`getMaskBlobUrl`/
  `getHeatmapBlobUrl`) layered on top via `AIOverlayToggle` (reused unchanged, just fed
  `none`/`mask`/`heatmap` instead of the old `seg`/`gleason`/`heat`/`none`). **Fixed
  2026-08-05**: the mask layer used to render at `opacity: 0.55` blended over the tissue
  image, which visibly muddied every class color away from the pipeline's actual output
  (e.g. green read as murky olive over pink H&E) even though the underlying PNG's own
  pixels were already correct — confirmed by pulling a real generated mask and inspecting
  its raw pixel values with PIL/numpy against `pipeline.py`'s `MASK_COLORS_BGR`
  (`#1a1a1a`/`#9e9e9e`/`#2ca02c`/`#ffd60a`/`#ff7f0e`/`#d62728` for
  background/stroma/benign/gleason_3/4/5 — exactly matches; **no backend change needed**).
  The mask layer now renders at full opacity with no blend, so "Mặt nạ phân đoạn" shows
  the pipeline's true colors — confirmed in-browser by sampling the actually-rendered
  `<img>` via canvas and getting back the exact same RGB values as the source PNG. The
  heatmap layer is untouched (still `opacity: 0.6`) — it's an intentionally translucent
  confidence overlay meant to be read together with the tissue underneath, a different
  kind of layer than a discrete-class legend. Shows an
  explicit "Chưa có kết quả AI cho ảnh này" CTA (not an error banner) when
  `GET /api/images/{id}/inference` 404s — `api.getInference`/`api.getReview` both catch a
  404 and resolve `null` rather than throwing, specifically so `useApiData` treats "nothing
  yet" as normal data. The doctor-review form (primary/secondary override, PNI/LVI +
  notes, biopsy location, free notes) **prefills from the AI's own classification when no
  review draft exists yet, but does not auto-save** — nothing is written to
  `diagnostic_reviews` until the doctor explicitly clicks "Lưu" (matches `Annotate`'s
  explicit-save convention; avoids creating a DB row from a page view). "Xác nhận & khóa"
  is disabled until a draft exists. A `423` from `PATCH` (already confirmed, e.g. in
  another tab) reloads the review instead of surfacing a raw error.
- **Fixed** (was documented here as a gap, corrected in place 2026-08-07 during a system
  audit — the code had actually already been fixed in the 2026-08-05 ruler/calibration
  pass and this note just never got updated): `cancer_area_percentage` **is** now in
  `DiagnosticReviewUpdate` (confirmed directly in `schemas/reviews.py`), and `Viewer.tsx`'s
  `handleSave()` sends the real value from `run.segmentation.cancer_area_percentage` on
  every save — see the dated "Clinical workflow feature batch" subsection below for the
  original fix and its verification. `Report` no longer shows "Chưa có diện tích ung thư"
  for a confirmed review of a completed run.
- **Verified through the actual browser UI** (not just curl, doctor account
  `lam.nguyen@benhvien.vn`): created a disposable test case + real uploaded image (curl,
  since this sandbox can't drive a native file-picker dialog) → `CaseDetail` → "Kết quả AI"
  on an image with no run yet → `Viewer` showed the CTA correctly → "Chạy phân tích AI" →
  `Pipeline` → real `POST` created an `InferenceRun`, polling picked up a real `completed`
  status within seconds → "Xem kết quả" → `Viewer` showed the real image, a working
  mask-overlay toggle (`GET /api/inference-runs/{id}/mask` → `200`), and correctly rendered
  a `primary_pattern: null` AI result as "Benign" rather than crashing or fabricating a
  pattern (the synthetic test image's segmentation found 37.7% "cancer" area but
  classification found no patch confident enough to assign a pattern — a real, honest
  disagreement between the two models on out-of-domain input, not a bug) → edited PNI +
  notes → "Lưu" (confirmed persisted via a direct DB read) → "Xác nhận & khóa" → form
  disabled, badge flipped to "Đã khóa" → "Xem báo cáo" → `Report` showed the real confirmed
  data with no fabricated signature. Test case, image, uploaded files, and all cascaded
  `inference_runs`/`segmentation_results`/`classification_results`/`diagnostic_reviews`
  rows were deleted afterward; the user's real case (`0001`) was confirmed untouched
  throughout.
- **Model-selector, verified through the actual browser UI** (2026-08-04, same account/
  discipline as above): confirmed `curl GET /api/models` with a doctor token returns the
  same 7 real entries as `GET /api/admin/models` with an admin token (the auth fix actually
  works, not just that the route exists), and a doctor is still `403`'d on
  `/api/admin/models` itself. In-browser: new image, no run yet → `Pipeline` showed the
  picker with real architecture names + metric hints, defaults pre-selected → picked
  non-default architectures (`deeplabv3plus_efficientnet_b0` + `vit_b_16`) → "Bắt đầu phân
  tích" → confirmed via `GET /api/images/{id}/inference` that
  `segmentation_model_version`/`classification_model_version` matched exactly what was
  picked (not the default), and the run completed for real (this one also produced a real
  heatmap, unlike the first pass's test image). Forced a real failure without touching any
  real checkpoint (`curl POST .../inference -d '{"segmentation_model":"bogus_arch"}'`) →
  opened `Pipeline` for that image → landed on the failed state with the real error message
  → "Thử lại" → **this is where the retry-prefill bug above was actually caught**: the
  picker's segmentation `<select>` silently fell back to its first `<option>` in the DOM
  (since `bogus_arch` matched no real option), but the underlying React state still held
  `bogus_arch` and would have resubmitted it — fixed by only prefilling from the failed
  run's choice when it's still in the available-checkpoints list, confirmed by re-testing
  the same retry and seeing the picker land on a real architecture (with its metrics hint
  correctly shown) instead → real re-trigger → completed for real. Test case/images/
  uploaded files and all cascaded rows deleted afterward; the user's real case (`0001`)
  confirmed untouched.
- **Results reframed as Gleason grading, not ISUP (2026-08-05)**: `CaseDetail`, `Viewer`,
  and `Report` all used to show the Gleason score (`3+4=7`) with **no label at all**, and
  "ISUP Grade Group N" as the only labeled text next to it — so the result read as if
  ISUP were the primary output. Per the user's explicit call: results are Gleason grading,
  not ISUP. Fixed by adding a clear "Điểm Gleason" eyebrow label wherever the score was
  previously unlabeled (`CaseDetail`, `Viewer`) and removing the "ISUP Grade Group" line/
  column entirely from all three screens. **Backend unchanged** — `_grade_group()` /
  `diagnostic_reviews.grade_group` still exist and still get computed (still real ISUP
  data, just no longer surfaced in the doctor-facing UI); `frontend/src/data/mock.ts`'s
  now-fully-unused `grade()` helper (and the now-empty `data/` dir) were deleted. Verified
  through the actual browser UI: manually set Primary=3/Secondary=4 on a real review,
  confirmed `Viewer` and `Report` both show "Điểm Gleason / 3+4=7" with no "ISUP" text
  anywhere (`grep ISUP frontend/src` returns nothing), and confirmed `CaseDetail`'s
  case-level header still shows the neutral "Chưa có kết quả AI" badge as before (its
  Gleason display path is unreachable for real cases regardless — no case-level aggregate
  exists, see above — so this pass didn't change that pre-existing behavior, just the
  label text for if/when it is ever reached).
- **Cursor-anchored zoom + AI-independent manual diagnosis + manual mask overlay
  (2026-08-05)**: three related `Viewer` changes, all confirmed via the real browser UI.
  - **Zoom** used to scale the whole image from a fixed center (`width: ${zoom}%` on a
    flex-centered wrapper — no anchor concept at all). Replaced with the
    cursor-anchored technique: the wrapper keeps a fixed `width: 100%` "1x" reference frame
    and gets `transform: scale(zoom/100)` + a dynamic `transformOrigin`. **Superseded
    later the same day (see below)** — the wheel-driven trigger was replaced with an
    explicit point-select flow, but the `transform`/`transformOrigin` mechanics themselves
    are unchanged and still the foundation.
  - **Manual diagnosis without AI**: the doctor review form + Lưu/Xác nhận & khóa/Xem báo
    cáo footer used to only render inside the `run?.status === 'completed'` branch — a
    doctor couldn't record a diagnosis at all until AI had finished, even though
    `diagnostic_reviews.run_id` is nullable and `PATCH /api/images/{id}/review` never
    required a run to exist. Restructured so only the **read-only AI results block**
    stays conditional on AI completion; the review form and footer are now always
    rendered. Verified: saved a fully manual review (`run_id: null` confirmed via direct
    API read) on an image with **no inference run at all**, confirmed `Report` renders it
    correctly.
  - **Manual mask overlay**: rather than building a second, separate raster-painting tool,
    reused the existing polygon annotation system (`manual_annotations`/`Annotate.tsx`,
    already independent of any AI run) — renamed its null-pattern option from "Không gán
    nhãn" (unlabeled) to "Lành tính" (benign, matching `Viewer`'s own `PatternPicker` and
    `GleasonChip`'s existing 'benign' rendering) and its color from gray to
    `var(--gleason-benign)`, so every saved region is a real tissue class
    (benign/G3/G4/G5) — a genuine manual mask, not new schema/backend. `Viewer` now fetches
    `listAnnotations` and adds a `"Mask thủ công"` entry to the `AIOverlayToggle` (only
    when annotations exist, same pattern as `mask`/`heatmap`), rendering the saved polygons
    as filled colored shapes via the same `<svg>`+`<polygon>` technique `Annotate.tsx`
    already uses (read-only in `Viewer` — editing still happens on `Annotate`, reached via
    a new "Vẽ / sửa mask thủ công" footer button → new `onAnnotate` prop, wired through
    `App.tsx`'s existing `goAnnotate`/`annotateImageId` plumbing). Verified: drew a
    Pattern-4 region and a benign region via `Annotate`, confirmed both render in
    `Viewer`'s "Mask thủ công" layer with the exact same points and correct colors
    (`var(--gleason-4)` / `var(--gleason-benign)`), zoomed/panned in sync with the base
    image (same transformed wrapper). No backend changes for any of the three.
- **Zoom made explicit (point-select, not wheel) + zoom added to `Annotate` + drag-tracing
  replaces click-vertex drawing (2026-08-05, same day)**: user feedback on the zoom pass
  above — zoom should not be automatic/wheel-driven, the same zoom should exist on the
  mask-drawing screen too, and mask drawing itself should switch from click-each-vertex to
  a genuinely different input method. All three confirmed via clarifying questions before
  implementing.
  - **`Viewer`**: removed `onWheel` entirely. Added a "Chọn điểm phóng to" (crosshair)
    `IconButton` that arms `pickingZoomPoint`; the next click on the image (handled on the
    **outer, stable, non-scaled** container) sets `zoomOrigin` from that click's `%`
    position and disarms — the existing `+`/`-` buttons are otherwise unchanged, they just
    zoom around whichever point was last explicitly picked (default center). A small
    persistent crosshair marker shows the current zoom center, positioned on that same
    outer container (not inside the scaled wrapper) at `left/top: ${zoomOrigin}%` — correct
    at any zoom level because the CSS `transform-origin` point is, by definition, the one
    point that never moves on screen when the wrapper is scaled, so a naive percentage
    placed on the *unscaled* outer container tracks it exactly.
  - **`Annotate`**: gained the identical zoom mechanics (previously had none at all).
    Required a second ref: `outerRef` (stable, used for zoom-point-picking math, same as
    `Viewer`) and `wrapperRef` (the scaled element). This split matters because *drawing*
    coordinates (stored as absolute 0–100 image-space `Point[]` in `manual_annotations`)
    need different math than zoom-point-picking — a transformed element's own
    `getBoundingClientRect()` already reflects its current on-screen scale/position, so
    `(clientX - wrapperRect.left) / wrapperRect.width` correctly maps a click back to 0–1
    image space *at any zoom/pan level*, whereas zoom-origin-picking must use the
    **outer, unscaled** container's rect instead (since CSS `transform-origin` percentages
    always resolve against an element's own pre-transform box). Getting this backwards
    would have made drawing precision-zoom pointless (points would land in the wrong place
    once zoomed) or broken zoom-point-picking (origin would drift). Both are now correct
    and independently verified.
  - **Drag-tracing replaces click-to-place-vertex**: `handleSvgClick`'s
    click-per-vertex-with-proximity-to-close logic is gone. New `onPointerDown`/
    `onPointerMove`/`onPointerUp` handlers on the `<svg>` (Pointer Events, with
    `setPointerCapture` for reliable tracking): press starts a trace, drag appends points
    (only when moved ≥0.8% of image space from the last recorded point, keeping point
    count sane), release auto-closes (≥3 points → straight to the existing `'pending'`
    pattern-picker/save form, unchanged downstream; <3 points → discarded, stays in
    `'drawing'` mode). Removed: the "Xong" button, the proximity-to-first-point close
    logic, the "N điểm — click gần điểm đầu để đóng vùng" hint (now "Giữ và kéo trên ảnh để
    vẽ vùng, thả ra để hoàn tất"), and the per-vertex `<circle>` markers (just the live
    polyline is shown while tracing). Selecting/editing/deleting saved annotations and
    every backend call are untouched — this only changes how *new* points get drawn; the
    `Point[]` data shape and every downstream consumer (including `Viewer`'s "Mask thủ
    công" overlay) are unaffected.
  - **Verified through the actual browser UI**, the critical check being coordinate
    correctness under zoom (not just that buttons visually respond): picked a zoom point,
    zoomed to 200% via the `+` button, then dispatched real `pointerdown`/`pointermove`×2/
    `pointerup` events at screen coordinates computed from the *live post-transform*
    `wrapperRef` rect for three target image-space points. The **saved** annotation's
    points (read back via `GET /api/images/{id}/annotations`) matched the intended
    0–100 targets almost exactly (sub-0.01% on x, a small *constant* ~0.5% offset on y
    across all three points — consistent with test-harness rounding, not a distortion,
    since the triangle's shape/relative spacing was preserved exactly) — confirming the
    `wrapperRef`-based coordinate math is correct even at high zoom with an off-center
    origin. Confirmed the traced shape then rendered correctly in `Viewer`'s "Mask thủ
    công" layer with the exact same points and color. Also confirmed the wheel genuinely
    no longer zooms `Viewer` (dispatched a real `wheel` event, `transform` unchanged).
    Test case/images and all cascaded rows deleted afterward; the user's real case (`0001`)
    confirmed untouched.
- **Heatmap removed from predictions + mask shown as a real overlay + Gleason button
  colors matched to the mask palette (2026-08-05)**: three related fixes from the same
  user request, all confirmed via the real browser UI.
  - **Heatmap removed end-to-end**, not just hidden: `pipeline.py`'s `run_pipeline()` no
    longer builds the per-patch confidence heatmap at all (dropped the `heatmap` array,
    the `cv2.applyColorMap` call, and `PipelineResult.heatmap_path`) — this was only ever
    a v1 stand-in for real Grad-CAM/Attention-Rollout (see [AI inference
    pipeline](#ai-inference-pipeline-backendappinference)), and the user asked for it gone
    from the prediction rather than upgraded, so the "v2 heatmap" Next-steps item is now
    moot instead of done. `GET /api/inference-runs/{run_id}/heatmap` and
    `ClassificationResultOut.has_heatmap` were deleted along with it (backend); frontend
    `getHeatmapBlobUrl`/`ApiClassificationResult.has_heatmap` and `Viewer.tsx`'s
    `'heatmap'` overlay layer (state, fetch effect, toggle option, `<img>`) were removed
    too — confirmed in-browser that `AIOverlayToggle` on a freshly-completed real run only
    ever offers "Ảnh gốc"/"Mặt nạ phân đoạn" (no "Heatmap" option appears). The DB column
    `classification_results.heatmap_file_path` was left in place (always `NULL` from now
    on) rather than dropped — not worth a live-DB migration for an unused column.
  - **Mask now renders as a real overlay, not an opaque replacement**: the previous pass
    (2026-08-05, earlier bullet above) had deliberately set the mask `<img>` to full
    opacity with no blending, reasoning that blending "muddied" the AI's true colors. The
    user's read on that in practice was the opposite of the goal — they want to see the
    mask *and* the underlying tissue at once ("ảnh chồng lắp giữa mask và ảnh gốc"), which
    a fully opaque top layer can't do (it just replaces the tissue view entirely while
    that toggle is active). Reverted to a semi-transparent overlay (`opacity: 0.5` on the
    mask `<img>`, default `mixBlendMode: normal`) — confirmed via `getComputedStyle` in
    the browser that the rendered mask layer has `opacity: 0.5` and, visually, that the
    pink H&E tissue is still visible underneath the segmentation colors instead of being
    fully hidden.
  - **Gleason button/chip colors now match the mask's own palette**: `--gleason-3/4/5/
    benign` in `styles/tokens.css` used to be an unrelated brand-teal/amber/red-orange/
    blue set with no relationship to `pipeline.py`'s `MASK_COLORS_BGR`, so a doctor
    comparing the mask overlay against the Primary/Secondary pattern-picker buttons or
    `GleasonChip` badges was comparing two different color languages for the same tissue
    classes. Retokenized to the mask's exact colors — `--gleason-3: #ffd60a` (yellow),
    `--gleason-4: #ff7f0e` (orange), `--gleason-5: #d62728` (red), `--gleason-benign:
    #2ca02c` (green) — sourced directly from `MASK_COLORS_BGR`, not eyeballed, so the two
    can't drift apart again without someone editing both in the same place. Bright yellow
    (`gleason-3`) with the existing hardcoded white chip text was unreadable, so
    `GleasonChip` gained a per-pattern `text` color (`var(--gleason-3-text)` →
    `var(--gray-900)` for pattern 3 only, white everywhere else) instead of assuming white
    always works — every other consumer of these tokens (`DoctorDashboard`'s legend,
    `Annotate`'s manual-mask polygon colors, `Viewer`'s manual-mask overlay) picks the new
    colors up automatically since they all reference the same CSS variables, no per-file
    changes needed there.
  - **Verified through the actual browser UI** (doctor account
    `lam.nguyen@benhvien.vn`): uploaded a real PANDA test tiff to a disposable case,
    triggered a real inference run (`unet_efficientnet_b0` + `efficientnet_b0`,
    completed for real: primary=5, secondary=4, 72.8% cancer area) → confirmed
    `GET /api/images/{id}/inference`'s JSON has no `has_heatmap` key at all (schema field
    removed, not just `false`) → `Viewer`'s overlay toggle showed only "Ảnh gốc"/"Mặt nạ
    phân đoạn" → toggled the mask on and confirmed via `getComputedStyle` that the mask
    `<img>` renders at `opacity: 0.5` with the tissue visible underneath → confirmed the
    Primary/Secondary pattern buttons render Pattern 3 as a yellow chip with dark (not
    white) text, Pattern 4 orange, Pattern 5 red, all matching the mask swatch colors.
    Test case/image/run and all cascaded rows deleted afterward (`DELETE
    /api/images/{id}` + direct `sqlite3` cleanup for the case/slide); the user's real case
    (`0001`) confirmed untouched.
- **Independent overlay toggles + shared opacity slider, and an explicit "Đồng ý với AI"
  action (2026-08-05)**: two UX requests grounded in real pathology-software practice
  (Aiforia-style composite overlay with per-layer control), both frontend-only, no
  backend changes.
  - **Overlay toggles are now independent, not single-select**: `layer: 'none'|'mask'|
    'manual'` (one active at a time, previously) became `activeLayers: string[]`, both
    defaulting to **off** — the doctor sees the plain tissue image first, then opts into
    AI mask and/or manual mask, in any combination, rather than a fixed always-on
    composite. `AIOverlayToggle` (`components/pathology/AIOverlayToggle.tsx`) was
    rewritten from a single-select segmented control (`value: string`) to a checkbox-like
    multi-select group (`value: string[]`, toggling one key in/out of the array per
    click) — it had exactly one call site (`Viewer.tsx`), confirmed via a repo-wide grep
    before changing its contract. A shared `maskOpacity` slider (10–100%, default 50%)
    appears once at least one overlay is active and drives **both** the AI mask `<img>`'s
    `opacity` and the manual mask `<polygon>`'s `fillOpacity` together — one control, not
    two, since both are "how strongly should this layer sit over the tissue" in the same
    sense. **Verified for real**: on a completed inference run with a manual annotation
    present, confirmed via direct DOM inspection that toggling both overlays leaves both
    truly rendered simultaneously (the mask `<img>` and the annotation `<polygon>` both
    present in the DOM at once — not one replacing the other), and that dragging the
    slider to 90% updated both elements' opacity/`fill-opacity` to `0.9` together. (Caught
    and corrected a test-methodology mistake along the way — firing both toggle clicks in
    one synchronous batch hit the same stale-closure issue documented earlier in this file
    for `Annotate.tsx`'s drag-tracing tests: both `onClick` handlers captured the same
    pre-click `activeLayers` value, so the second `setActiveLayers` call overwrote the
    first instead of adding to it. Not an app bug — real user clicks are naturally spaced
    across separate event loop turns; the fix was purely to the test script, issuing each
    click as its own tool call.)
  - **"Đồng ý với AI" button**: the review form already prefilled from
    `run.classification.primary_pattern`/`secondary_pattern` when no draft existed yet
    (see the 2026-08-05 "AI-independent manual diagnosis" bullet above), but that only
    fires once, on first load with no review row — there was no way to snap the
    Primary/Secondary pickers back to the AI's suggestion after the doctor had changed
    them (e.g. to compare, or after a mis-click), short of reloading the whole page and
    losing any other in-progress edits. Added an explicit button in the read-only "Kết
    quả AI" panel, shown whenever `clf` exists and the review isn't locked: sets
    `primary`/`secondary` state to `clf.primary_pattern`/`clf.secondary_pattern`
    directly — a pure form-sync action, deliberately **not** an auto-save (matches this
    app's existing explicit-save convention everywhere else, e.g. `Annotate.tsx`) — the
    doctor still clicks "Lưu"/"Xác nhận & khóa" afterward same as any manual edit. The
    button's own label reflects current agreement state live (`agreesWithAi =
    primary === clf.primary_pattern && secondary === clf.secondary_pattern`): "Đồng ý với
    AI" (secondary-styled) when the form has diverged, "Đã khớp với AI" (ghost-styled,
    checkmark icon) when it already matches — so the label itself communicates whether
    there's anything to sync, not just a static call-to-action. **Verified for real**: on
    load (AI primary=5/secondary=4, no draft yet) the button correctly started as "Đã
    khớp với AI" since the existing prefill effect had already matched it; clicked
    Pattern 3 on the Primary picker to diverge → button correctly flipped to "Đồng ý với
    AI" → clicked it → picker snapped back to 5/4 and the on-screen Gleason score
    recomputed to "5+4=9", button reverted to "Đã khớp với AI". Test case/image/run
    deleted afterward; case `0001` confirmed untouched.

### Clinical workflow feature batch (2026-08-05)

The user (role-playing a real pathologist) listed 7 real CAP-checklist/clinical-workflow
gaps. Each was assessed against the actual code/schema before committing to anything
(not guessed) — see the assessment message earlier this session for the full per-item
reasoning. 4 were selected to build, plus building the ruler's UI+config ahead of a real
physical calibration:

- **Autosave while annotating** (`Annotate.tsx`): `handlePointerUp` used to hold the
  traced shape in local-only `draftPoints` state until the doctor *also* picked a
  pattern and clicked "Lưu" — an interruption before that point (crash, urgent page)
  would lose the shape entirely. Now `autoSaveNewRegion()` calls
  `api.createAnnotation()` **immediately** on trace completion (`gleason_pattern:
  null`), then transitions straight into the existing `startEdit()` panel for
  pattern/note — the shape is durable the instant drawing finishes, not after the whole
  decision is made. The old `mode==='pending'` panel/`handleSaveNew` path is kept as a
  fallback only for when the autosave request itself fails (shape stays visible,
  manual retry). **Verified via `curl`**: POSTed a triangle with `gleason_pattern: null`
  and confirmed it round-tripped with that value — i.e. the create genuinely doesn't
  wait for a pattern choice.
- **AI silent-failure honesty** (`Pipeline.tsx`, `Viewer.tsx`, `lib/api.ts`): confirmed
  by grep that `pipeline.py`/`tiling.py` never referenced `is_blurry`/`quality_score`
  at all — blur detection existed but was never consulted or surfaced anywhere. Two
  fixes, both frontend-only (the data already existed server-side):
  - `Pipeline.tsx`'s picker screen now fetches `GET /api/images/{id}/preprocessing`
    (new `api.getPreprocessing()`, 404-tolerant like `getReview`) and shows a warning
    banner before the doctor triggers a run if `is_blurry` is true.
  - `Viewer.tsx` used to render a null `primary_pattern` as a plain "Benign" chip,
    indistinguishable from a real negative finding. New `noTissueDetected = run
    completed && seg.total_tissue_area_px === 0` check replaces the chips with an
    explicit "AI không phát hiện được mô nào... không phải kết luận lành tính" warning
    instead. **Verified for real**: uploaded a synthetic all-white JPEG, ran real
    inference, confirmed the backend genuinely returned
    `total_tissue_area_px: 0, primary_pattern: null` (not simulated), then confirmed
    in the actual browser UI that the new warning message renders instead of "Lành
    tính".
- **Vertex editing** (`Annotate.tsx`): previously drag-tracing could only create new
  shapes; reshaping a saved one meant delete + redraw (a real, previously-documented
  limitation). Added a "Sửa hình dạng" toggle inside the existing "Sửa vùng" panel —
  when armed, the annotation being edited renders from a local mutable `editPoints`
  copy (not the stale `a.points`) with a small draggable `<circle>` per vertex,
  self-contained pointer-capture per circle (`handleVertexPointerDown/Move/Up`) so it
  doesn't interfere with the SVG-level drag-tracing handlers used for *new* shapes.
  `handleSaveEdit` now always sends `points: editPoints` alongside
  `gleason_pattern`/`note`. **Verified for real through the actual browser UI**: opened
  an existing 3-vertex annotation, dispatched real `pointerdown`/`pointermove`/
  `pointerup` on one vertex to drag it from (31,9) to (35,15), watched the circle's
  live `cx`/`cy` track the drag before release, clicked the real "Lưu" button, then
  confirmed via `sqlite3` that `manual_annotations.points` persisted the exact dragged
  position — not simulated, a real drag through real pointer events saved through the
  real save button.
- **"Cần hội chẩn" (second opinion) flag**: new `diagnostic_reviews.needs_second_opinion`
  (`INTEGER DEFAULT 0`) + `second_opinion_notes` (`TEXT`) columns (`ALTER TABLE` on the
  live DB, full `CREATE TABLE` column in `schema.sql`, no `CHECK` on the live ALTER —
  same discipline as `images.magnification`). Backend needed **zero router logic
  changes** — confirmed `update_review()` already applies `payload.model_dump
  (exclude_unset=True)` generically via `setattr`, so adding the two fields to
  `DiagnosticReviewUpdate`/`Out` was sufficient (only `needs_second_opinion` needed the
  same bool→0/1 special-casing `pni_present`/`lvi_present` already had). New
  `GET /api/reviews/flagged` flat worklist (see Case/Slide/Image API's Diagnostic
  review subsection above for why it's flat, not nested). Frontend: a checkbox+note in
  `Viewer.tsx` right after LVI (identical pattern); a new "Cần hội chẩn" card on
  `DoctorDashboard.tsx` (own `useApiData(() => api.getFlaggedReviews(token))` fetch,
  only rendered when non-empty) whose rows click straight into `Viewer` for that image
  via a new `onGoResult` prop threaded through `App.tsx` (reuses the existing
  `goViewer()`, no new nav state needed); `Report.tsx` shows a "Cần hội chẩn" badge +
  the note. **Verified for real through the actual browser UI, database, and both
  endpoints**: flagged a real review with a Vietnamese-diacritics note (`curl` via
  Python's `urllib` — plain `curl` on this Windows/Git-Bash setup mangled the UTF-8
  body, a tooling quirk, not a backend bug, confirmed by checking the row landed
  correctly via `sqlite3` either way), confirmed it appeared in `GET
  /api/reviews/flagged` and in the real `DoctorDashboard` "Cần hội chẩn" card, clicking
  the card row navigated to the correct `Viewer`, the checkbox/textarea were correctly
  pre-checked/pre-filled from the real data, and `Report.tsx` rendered both the badge
  and the note.
- **Ruler tool + µm/pixel calibration**: new `magnification_calibration` table (`CREATE
  TABLE`, not `ALTER`, so the `CHECK` constraint is safe to keep — see Data model
  above), `GET /api/calibration` (any user) / `PUT /api/admin/calibration/{mag}`
  (admin-only — a shared physical-instrument constant, not a per-user preference, so
  gated like the rest of Admin's config screens) in the new `routers/calibration.py`.
  Admin UI: a new `CalibrationSection` block at the bottom of `Models.tsx` — 4 inputs
  (one per magnification), each independently saved. `Viewer.tsx` gained a "Đo khoảng
  cách" tool (mutually exclusive with "Chọn điểm phóng to", same click-to-place-point
  interaction pattern): first click sets point A, second sets point B and computes the
  distance, rendered as a line+dots in the same scaled `<svg>` layer the AI/manual mask
  overlays already use. If the image's `magnification` (fetched via the new
  `GET /api/images/{id}`) has a calibration row, the result shows real mm and a "Lưu
  vào báo cáo" button (PATCHes `tumor_length_mm`); otherwise it honestly shows pixels
  only with a "chưa hiệu chỉnh" note rather than fabricating a distance. **Real bug
  caught and fixed during verification**: the pixel→mm math originally read
  `imgRef.current.naturalWidth/naturalHeight` — but the on-screen `<img>` renders the
  resized `_view` derivative (≤2400px, per `cases.py`'s own derivative-generation
  logic), not the true original capture, so for a real microscope image this would have
  silently thrown every measurement off by roughly (original/view) ≈ 10x. Caught by
  actually inspecting the rendered `<img>`'s live `naturalWidth` in the browser (2400
  vs the image's real `width_px` of 24064) before trusting the number — fixed by
  reading `imageMeta.width_px`/`height_px` (the real dimensions, already being fetched
  for the magnification lookup) instead; `imgRef` became fully unused afterward and was
  removed rather than left as dead code. **Verified for real end-to-end**: set a test
  40x calibration (0.25 µm/pixel) as admin → confirmed `checkpoint_available`-style
  admin-gating (`403` for a doctor token) → as a doctor, dispatched two real click
  events at screen coordinates computed from the live wrapper rect for two known image
  points → the on-screen result (1.21mm) matched the hand-calculated expectation
  (1.2032mm, using the corrected `width_px`-based formula) almost exactly, the small
  remainder being test-harness click-coordinate rounding, not a real error → clicked
  the real "Lưu vào báo cáo" button → confirmed via `sqlite3` that
  `tumor_length_mm ≈ 1.209` persisted → confirmed `Report.tsx` renders both this value
  and the (now also finally wired, see above) `cancer_area_percentage`, closing two
  known "Chưa có..." gaps in the same pass, not just one. All test data (2 images, 1
  case, the test calibration row) deleted afterward; case `0001` confirmed untouched.

### DoctorDashboard stat tiles switched from mock to real data (2026-08-06)

The user pointed out the 4 stat tiles at the top of `DoctorDashboard` (`Ca hôm nay`/`Chờ
duyệt`/`Độ tin cậy AI TB`/`Báo cáo đã xuất`) and the `DISTRIBUTION` bar chart (`Lành
tính`/`Pattern 3/4/5`) were still hardcoded mock numbers (`24`, `7`, `88%`, `19`,
`42/31/19/8%`) with fabricated deltas ("+6 so với hôm qua", "+2% tuần này") — the case
list itself was already real (via the shared `cases` prop), but nothing backed these
tiles. No existing endpoint covered this (`GET /api/admin/stats` is `require_admin`-gated
and doesn't shape this data anyway), so a new **`GET /api/stats/doctor`**
(`routers/stats.py`, any authenticated user — same non-admin-gating precedent as
`GET /api/models`) was added, backed by `schemas/stats.py`'s `DoctorStats`/`PatternCount`.
Computed straight from existing tables, no new columns:
- `new_cases_today` — `COUNT(cases) WHERE date(created_at) = date('now')`. Renamed from
  the mockup's ambiguous "Ca hôm nay" to "Ca mới hôm nay" since that's specifically what
  it measures (new case creation, not e.g. cases touched today).
- `pending_reviews` — `COUNT(diagnostic_reviews) WHERE status = 'draft'`. Only counts
  reviews a doctor has actually opened/started (the get-or-create-latest row only exists
  once `PATCH .../review` has been called once) — not every unreviewed image, which
  would require a more expensive completed-run-with-no-review join for a dashboard tile.
- `confirmed_reviews` — `COUNT(diagnostic_reviews) WHERE status = 'confirmed'`. Replaces
  the old "Báo cáo đã xuất" tile — there's no real PDF/report export in this app (`reports`
  table declined per PRD, `Report.tsx` is a browser-print view, not a generated file), so
  a literal "reports exported" count doesn't exist; a confirmed review **is** this app's
  de facto finalized report, so relabeling the tile "Đã xác nhận" and backing it with the
  real confirmed-review count is the honest equivalent rather than inventing an export
  counter.
- `avg_ai_confidence` — `AVG(classification_results.primary_confidence)` across every run
  that produced a confidence value (not scoped to today/this week — a simple all-time
  average, no fabricated "+2% this week" trend since there's no historical snapshot to
  diff against).
- `pattern_distribution` — `GROUP BY primary_pattern` over **confirmed** reviews only
  (drafts are still mid-edit, not a finalized diagnosis — same reasoning as `Report.tsx`'s
  own confirmed-only framing), with `NULL` primary_pattern bucketed as "Lành tính" (matches
  the existing null→"Lành tính" convention already used in `Report.tsx`'s Gleason-score
  display). Returns real percentages of 0 with a total of 0 rather than 100%-of-nothing
  when no confirmed reviews exist yet.

Frontend: new `DoctorStats`/`PatternCount` types + `getDoctorStats()` in `lib/api.ts`;
`DoctorDashboard.tsx` fetches via the existing `useApiData` pattern and renders the 4
tiles + distribution bars off real numbers, with an honest empty state ("Chưa có đánh giá
nào được xác nhận.") instead of a fake bar chart when `pattern_distribution` sums to zero
— exactly the state a fresh install is in. Dropped the fabricated `delta`/`deltaDir`
props entirely rather than inventing plausible-looking trend text with nothing behind it.

**Verified for real, not just via the UI**: hit `GET /api/stats/doctor` with a doctor
token on the untouched real DB and cross-checked every field against a direct `sqlite3`
query (`SELECT status, COUNT(*) FROM diagnostic_reviews GROUP BY status` → empty table,
`AVG(primary_confidence)*100` → `87.0976...`, matched the endpoint's
`87.09760985390011` to float precision) — confirmed in the browser too (`0/0/87%/0`,
"Chưa có đánh giá nào được xác nhận"). Then exercised the **live** data path: created a
disposable test case + slide + image, `PATCH`'d a draft review (`primary=4,
secondary=3`) → confirmed `pending_reviews` ticked to 1 and `new_cases_today` to 1 in the
API response → called `POST .../review/confirm` → confirmed `pending_reviews` back to 0,
`confirmed_reviews` to 1, and `Pattern 4` distribution to `100% (1)` — then reloaded the
real browser page and confirmed the exact same numbers rendered live (`CA MỚI HÔM NAY: 1`,
`CHỜ DUYỆT: 0`, `ĐÃ XÁC NHẬN: 1`, `Pattern 4 100% (1)`), proving the whole
fetch→compute→render chain end to end, not just the API in isolation. Test image/slide/
case and its review row deleted afterward (`DELETE /api/images/{id}` + `sqlite3` cleanup
for the slide/case rows); confirmed via `sqlite3` that only the real case `0001` (id 5)
remains and `diagnostic_reviews` is empty again, and that the stats endpoint returned to
its exact pre-test baseline.

### Deep-zoom (Google Maps-style) tile viewer for WSI images (2026-08-06)

The user reported that real WSI images from the PANDA dataset
(`test_image/PANDA_image_test/train_images/*.tiff`) weren't sharp enough in `Viewer.tsx`
to see gland structure when zoomed in, and asked for a Google-Maps-style tiling approach.
Root cause confirmed by reading the actual code, not assumed: `Viewer.tsx`/`Annotate.tsx`
only ever loaded the `_view` derivative (≤2400px, generated once at upload — see
[Large-image handling](#caseslideimage-api) above) and "zoomed" it via CSS
`transform: scale()` — zooming in just blew up already-downsampled pixels; no code path
ever fetched more real detail. Verified the real PANDA file
`09a20094c83eaa9c6a8c4f7c92b4bac4.tiff` is a genuine pyramidal TIFF (3 embedded pages:
24064×4608 native, 6016×1152, 1504×288) — exactly the kind of image a deep-zoom tile
pyramid is built for. This reverses the earlier "oversized for our single-frame captures"
call documented in [Large-image handling](#caseslideimage-api) — that reasoning is now
corrected in place there.

User confirmed via `AskUserQuestion` two scope decisions before implementation: (1) apply
this to **both** `Viewer.tsx` and `Annotate.tsx`, not just Viewer (both shared the same
CSS-transform zoom mechanism); (2) use **pyvips** for backend tile generation rather than
hand-rolled Pillow tiling — verified first that `pip install "pyvips[binary]"` installs a
self-contained `pyvips-binary` wheel with a bundled `libvips.dll` for `win_amd64`, so this
does **not** repeat the OpenSlide native-install pain this repo explicitly avoided
elsewhere (see the AI models section) — confirmed with a real `pip install` + a real
`dzsave()` run against the actual PANDA TIFF (1.25s to generate the full pyramid,
1692 tiles at the finest level).

**Backend** (`backend/app/dzi.py` + `backend/app/routers/dzi.py`, new): `ensure_dzi()`
calls `pyvips.Image.new_from_file(path, access="sequential").dzsave(prefix, tile_size=256,
overlap=1, suffix=".jpg[Q=85]")` — pyvips's own `dzsave()` already produces the standard
Deep Zoom Image (DZI) format (`.dzi` XML + `{name}_files/{level}/{col}_{row}.jpg`), so no
hand-rolled tile-cutting math was needed. Generated **lazily** on first view (not at
upload time, keeping uploads fast — same pattern as the thumb/view derivatives) and
cached on disk next to the original; a second request is a cache hit (checked: 1.6s cold,
0.3s warm). `GET /api/images/{id}/dzi` (auth-gated like every image endpoint) serves the
`.dzi` XML; `GET /api/images/{id}/dzi_files/{level}/{filename}` serves the cached tile
(filename validated against `^\d+_\d+\.jpg$` — path-traversal safe). **Real bug fixed
along the way**: `delete_image`'s existing cleanup glob (`dest_dir.glob(f"{stem}*")` +
`.unlink()`) would have matched the new `{stem}_dzi_files/` **directory** and raised
`IsADirectoryError` — fixed to `shutil.rmtree()` directories vs `.unlink()` files.

**Frontend**: added `openseadragon` (v6.0.2, MIT — the reference "Google Maps for images"
library; ships its own TS types, no `@types/openseadragon` needed). New shared
`frontend/src/lib/dzi.ts`: `createDeepZoomViewer()` builds the `OpenSeadragon.Viewer` with
`loadTilesWithAjax: true` + `ajaxHeaders: { Authorization: 'Bearer ...' }` (every tile
request is authenticated, same discipline as the rest of the app — no public image
endpoints); `openDeepZoom()` calls `viewer.open(dziUrl)` with the **URL string**, not a
manually-constructed `DziTileSource` instance — the latter was tried first (matches the
type system's own `TileSourceSpecifier` signature more "naturally" in older OSD
tutorials) but hits a real OSD 6.x bug (`[TiledImage] options.drawer is required`,
confirmed via direct console/runtime inspection of the live viewer object) where the
newer WebGL/multi-drawer refactor's internal `TiledImage` setup isn't fully wired for
that code path; opening via the plain `.dzi` URL string is the standard, well-tested path
and works correctly. `fullImageRect()` computes the aspect-correct full-image
`OpenSeadragon.Rect` (`0,0,1,height/width`) used to position overlays. OSD's nav-control
button icons (zoom/home/fullscreen) are plain PNGs shipped in the npm package, not
auto-bundled by Vite — copied once into `frontend/public/openseadragon-images/` and
served statically (`prefixUrl: '/openseadragon-images/'`).

**`Viewer.tsx`**: the `<img>` + CSS-transform wrapper is replaced by an OSD-managed
`<div>`; the AI mask overlay, manual-mask overlay, and ruler markers are each a stable
`document.createElement('div')` added once via `viewer.addOverlay({element, location})`,
with their actual content **portaled in from React** (`createPortal`) — this let almost
all the existing polygon/mask JSX carry over completely unchanged, only the outer
positioning mechanism changed. The custom zoom-origin-picking crosshair UI (`zoom`/
`zoomOrigin`/`pickingZoomPoint` state, the +/−/% button cluster) is removed entirely,
replaced by OSD's native scroll-to-zoom-toward-cursor/drag-to-pan/double-click — the
literal "Google Maps" interaction the user asked for. The ruler tool's click handling
moved from manual `getBoundingClientRect()` math to OSD's own `canvas-click` event +
`viewport.viewportToImageCoordinates(viewport.pointFromPixel(...))`, which returns real
image-pixel coordinates directly — this **also structurally eliminates** the earlier
documented `naturalWidth`-vs-`width_px` measurement bug class, since the rendered
`<img>`'s natural dimensions are never touched anymore. **Real bug found and fixed while
wiring this up**: the component had an early `if (loading) return <StateMessage
kind="loading" />` **before** the JSX containing the OSD container `<div>` — since the
OSD-creation `useEffect`'s deps (`[token, imageId]`) don't change once loading finishes,
and a ref attaching to a newly-mounted DOM element doesn't by itself re-trigger an
unrelated effect, the container was permanently `null` when the effect ran during the
loading render, and never got a second chance once the "real" render arrived. Fixed by
never early-returning before the image panel — only the AI-results/review-form side
panel now shows its own scoped loading state, while the image loads independently
(a genuine UX improvement too: the image now appears before AI/review data arrives,
not after).

**`Annotate.tsx`**: same OSD container swap; the existing drawing/editing `<svg>`
(saved-region polygons, drag-tracing polyline, vertex-drag `<circle>` handles) becomes
one more `addOverlay` + portal, with its internal 0–100%-coordinate logic **completely
unchanged** — `pointFromWrapper()` was simply renamed `pointFromOverlay()` and now reads
`drawOverlayEl.getBoundingClientRect()` instead of a CSS-transformed wrapper's rect
(same technique, different source element). Pointer-events on the SVG background are
`none` except while actively drawing (`mode === 'drawing'`, matching the crosshair-cursor
state), so OSD's native pan/zoom gestures work everywhere else; individual `<polygon>`s
and vertex `<circle>`s keep `pointer-events: auto` always so they stay clickable/
draggable regardless. `viewer.setMouseNavEnabled(false)` is toggled on exactly while
tracing a new shape or dragging a vertex, so a drag gesture can't be captured as both
"draw" and "pan the viewport" at once. The same zoom-origin-picking UI removal as
`Viewer.tsx`.

**Verification** (real PANDA WSI upload, not a synthetic image): uploaded the real
`09a20094c83eaa9c6a8c4f7c92b4bac4.tiff` (24064×4608) to a disposable test case;
`GET .../dzi` returned the correct native dimensions (not the `_view` derivative's
2400×460) and correct tile URL pattern; a real level-15 (finest) tile fetched via curl
was a genuine 257×257 JPEG. **This automation browser's pane doesn't actively composite
frames** (confirmed directly: a `requestAnimationFrame` counter stayed at 0 after several
seconds), which starves OSD's own internal render loop and made it impossible to get a
literal on-screen screenshot here — worked around with a more rigorous, quantitative
check instead: fetched the exact same real slide region (x:4608–4864, y:2816–3072 native
pixels) two ways — (a) cropped from the old capped `_view` derivative and upscaled
bicubic to the same display size (simulating the old CSS-zoom), (b) the real level-15
deep-zoom tile — and compared Laplacian variance (the same sharpness metric
`preprocessing.py` already uses for blur detection): **0.0 vs 449.9 — visually confirmed
too** (the old crop is a smooth blurry gradient with one indistinct blob; the new tile
shows a real jagged tissue-edge boundary and multiple distinct glandular structures).
Confirmed the underlying interactive mechanics work correctly independent of the
compositing issue (pointer/click event dispatch isn't rAF-gated, only the base-tile
canvas paint is): dispatched two real clicks on the OSD canvas 40% of its width apart
while the ruler tool was armed → result matched the hand-calculated expectation
(0.4 × 24064 = 9625.6px) almost exactly at 9626px, confirming the new
`viewport.viewportToImageCoordinates()`-based math. Traced a real triangle via separate
pointer events dispatched on the portaled drawing `<svg>` in `Annotate.tsx` → autosaved
immediately, persisted points (20,20)/(60,20)/(40,80) matched the intended screen
fractions almost exactly via `GET /api/images/{id}/annotations` → confirmed the same
region rendered with the correct points/color inside `Viewer.tsx`'s "Mask thủ công"
overlay after toggling it on. All test data (case, slide, image, and the on-disk `.dzi`/
tile-directory pair, confirmed removed by the `shutil.rmtree` fix) deleted afterward;
`sqlite3` confirmed only the real case `0001` (id 5) remains.

### Real PANDA-derived Macenko stain reference wired into the actual AI input (2026-08-06)

The user supplied `stain_normalization_reference.json` (method `macenko`, `stain_matrix`,
`max_concentration`, `luminosity_threshold: 0.8`, `angular_percentile: 99`,
`n_samples_used: 300`, notes: extracted from a random 300-image sample of the real PANDA
train set/Radboud) and asked for it to be used to color-normalize the system's actual
input. Two things were true before this pass, both confirmed by reading the code, not
assumed:
- `preprocessing.py`'s `_macenko_normalize()` (now `normalize_stain()`, see below) used
  **generic textbook Macenko reference values** (from the original 2009 paper, not derived
  from this project's own training data) — the "target" appearance was never actually
  PANDA's.
- More importantly: that normalized output (`{uuid}_normalized.jpg`) was **only ever a
  cosmetic upload-time QC derivative** — `inference/tiling.py`'s `tile_image()` reads
  `cv2.imread()` straight from the **raw, un-normalized original** for the real AI
  pipeline. So stain normalization existed in the codebase but was never actually part of
  "đầu vào của hệ thống" (the system's input) the user asked to fix — a real gap, not a
  parameter tweak.

**Copied the reference into the repo** as `backend/app/stain_reference.json` (not read
from the user's local `Downloads` path at runtime — that path won't exist on any other
machine/deployment) — `preprocessing.py` loads it once at import time. `stain_matrix` in
the JSON is (2 stains × 3 RGB channels); transposed to (3 × 2) to match this module's
existing `stain_matrix @ concentrations → OD` convention. `max_concentration` maps
directly (same H-then-E ordering already used). **`luminosity_threshold`** was the one
genuinely ambiguous field — resolved by recognizing it as a term of art from the standard
Macenko-implementation convention (e.g. `StainTools`' `MacenkoNormalizer`): a
brightness-based tissue/background split (pixel kept if `mean(R,G,B)/255 < threshold`),
**distinct** from the old code's OD-per-channel magnitude threshold — replaced that filter
accordingly rather than plugging 0.8 into the old `_OD_THRESHOLD` slot (which would have
been numerically wrong — 0.8 is far too high a bar for a per-channel OD cutoff and would
have starved the fit of tissue pixels on real images). `angular_percentile: 99` matches
the existing symmetric 1st/99th-percentile split already in the code — no behavior change
there, just sourced from the reference for traceability, with the min/max percentile
assignment corrected to not flip when read from the new named value.

**`normalize_stain()`** (renamed from `_macenko_normalize`, now public) is called from two
places: `preprocessing.py`'s existing upload-time QC derivative (unchanged call site,
just the new reference/filter), and **newly**, `inference/tiling.py`'s `tile_image()` —
every tissue-flagged 500×500 patch is stain-normalized right after cropping, before it's
ever appended to the patch list `pipeline.py` feeds to segmentation/classification. A
patch that fails normalization (e.g. mostly edge/glass despite passing the coarser
`MIN_TISSUE_FRACTION` check) falls back to the raw crop rather than failing the whole run
— same best-effort discipline `preprocessing.py` already used.

**Real methodology caveat, must be stated in any thesis writeup**: the training notebooks
(see [AI models](#ai-models--training-methodology-colab-notebooks) above) did **not**
apply any stain/color normalization to patches before training — only resize + ImageNet
mean/std normalization. Applying Macenko normalization at inference time that the model
never saw during training is a real train/inference distribution shift, and in principle
could hurt accuracy on inputs that were already close to PANDA's native color distribution
(e.g. PANDA test files themselves). The counter-argument, and the reason this is still the
right call for this app specifically: the reference's own stated purpose is normalizing
*new* images (real microscope captures, potentially a very different color calibration
than the PANDA scanner) *towards* PANDA's typical appearance before inference — i.e. this
is a domain-adaptation step for the realistic deployment case (a doctor's own microscope
photos), not intended to help on already-PANDA-distributed inputs. Flagged here rather
than silently applied so this trade-off is visible for the thesis defense, not just buried
in a commit.

**Verified for real, not just that it runs**: called `normalize_stain()` directly against
a real ≥50%-tissue 500×500 patch cropped from the actual PANDA TIFF used throughout this
session — confirmed it's a genuine, non-trivial transform (BGR channel means shifted by
~13–24, per-pixel mean absolute difference ~20/255), not a no-op or a crash. Ran a **full
real inference** end-to-end through the actual API (`unet_densenet121` + `densenet121`) on
a disposable test case with that same real WSI — completed successfully in ~68s (real
tissue-patch count for a 24064×4608 slide, each now also paying the Macenko cost),
produced sane output (87.3% cancer area, primary=4/secondary=5 with real confidence
scores) — confirms the per-patch normalization doesn't crash or degenerate across many
real patches, not just the one hand-picked one. Also verified the **upload-time QC path**
separately (`GET .../preprocessing` → `has_normalized_image: true` on a second real PANDA
file) to confirm both call sites of the renamed/shared function still work. Test cases,
images, and uploaded files deleted afterward; case `0001` confirmed untouched throughout.

### Stage 3 ML-fusion + case-level Gleason aggregation (2026-08-06)

The user sent a spec doc (`Dac_ta_ky_thuat_Stage3_Deploy_Website.md`) describing a 3-tier
pipeline (Stage 1 classification, Stage 2 segmentation, Stage 3 ML fusion → ISUP grade)
and placed a real trained Stage 3 artifact at `backend/models/machine_learning_fusion/`,
asking for it deployed. Separately, asked for **case-level** Gleason/ISUP (a case can have
up to 12 slides — a real CAP-protocol report is signed per-case, not per-slide) — the same
"case-level Gleason" item explicitly declined earlier (see the 2026-08-05 clinical-
workflow batch above) — reversed because the user brought a concrete need ("để ký báo cáo
thật" — to sign a real report) plus a working Stage 3 model to build it on.

**Read the 3 real artifacts directly before writing any code — the spec doc turned out to
be wrong on two points, and the artifacts were trusted, not the doc**: `joblib.load()`ing
`stage3_final_model.joblib`/`stage3_final_scaler.joblib` and reading
`stage3_metadata.json` showed `model.n_features_in_ == 8` and `feature_columns` with only
8 entries (`clf_{densenet121,efficientnet_b0}_{benign,gleason_3,gleason_4,gleason_5}_pct`)
— **not 16 dims (classification+segmentation) as the spec doc described**; the trained
model (a real `sklearn.neural_network.MLPClassifier`, `classes_ = [0..5]`, has
`predict_proba`) turned out to need classification output only. Also found (via
`AskUserQuestion`, confirmed with the user): this app's existing classification pass only
runs on patches segmentation already flagged as cancer-relevant (a standing optimization),
but Stage 3 needs the average class distribution over **every** tissue patch (its own
independent branch, matching the spec's "2 nhánh song song, độc lập") — reusing the gated
result would have starved the "benign" feature and fed Stage 3 data that doesn't match
what it was trained on. Two decisions confirmed with the user: (1) Stage 3 **always** runs
automatically as part of the existing pipeline (no opt-in checkbox — accepted extra
latency); (2) case-level aggregation uses **only confirmed reviews**, weighted by each
image's `cancer_area_percentage`.

**Backend**: `backend/app/inference/fusion.py` (new) — lazy-loads+caches the 3 joblib/json
files, `predict_isup()` builds the 8-dim vector in the **exact column order
`stage3_metadata.json`'s own `feature_columns` specifies** (not hand-ordered — a mismatch
would raise a clear `KeyError`, not silently mispredict). `pipeline.py` gained
`run_stage3_fusion()` — re-tiles the image, runs **both** densenet121 and efficientnet_b0
over every tissue patch (independent of whatever architecture the doctor picked for the
main display result), averages the full 4-class softmax per model, calls
`fusion.predict_isup()`. New table `stage3_results` (`run_id` FK, `isup_grade`,
`confidence`, `classification_pct_json` for traceability — same shape as
`segmentation_results`/`classification_results`). Wired into `_execute()`
(`routers/inference.py`) **best-effort** — missing Stage 3 files or a fit failure never
fails the run, same discipline as `preprocessing.py`'s Macenko step.
`scikit-learn==1.6.1`/`joblib==1.5.3` pinned exactly to the versions the artifacts were
pickled with (confirmed via `InconsistentVersionWarning` when first inspecting with a
newer sklearn — pinned to avoid any prediction drift).

New `GET /api/cases/{id}/gleason` (`routers/cases.py`) — computed live from
`diagnostic_reviews` joined through `Image→Slide→Case`, filtered to `status='confirmed'`,
no new schema (same "compute on read" pattern as `GET /api/stats/doctor`). Case-level
**primary** = the pattern (3/4/5) with the greatest cumulative `cancer_area_percentage`
across the case's confirmed images (each image's own `primary_pattern` already represents
that image's dominant pattern, so its area% is used as that pattern's case-level weight);
**secondary** = the highest-grade pattern (3<4<5) present anywhere in the case (as either
primary or secondary of any confirmed image) other than the chosen primary, falling back
to primary itself if none (single-pattern convention, matches `pipeline.py`'s own
aggregation). `total_score`/`grade_group` reuse `_grade_group()` unchanged. Zero confirmed
images → `primary_pattern: null` (honest "not enough data", not a fabricated number); all
confirmed images benign → also `primary_pattern: null` but `images_confirmed > 0`,
distinguished in the response so the frontend can tell the two apart.

**Frontend**: `Viewer.tsx` gained a read-only "ISUP tổng hợp (Stage 3 — MLP)" card (only
shown when `run.stage3` exists) — deliberately doesn't auto-fill the doctor's
primary/secondary pattern picker (Stage 3 outputs one ISUP number, not a pattern pair, so
there's no equivalent to the existing "Đồng ý với AI" button). `CaseDetail.tsx`'s header
now fetches `getCaseGleason()` and renders the real case-level score + a
"{confirmed}/{total} ảnh đã xác nhận" honesty line, replacing the permanently-`null` mock
fields it used to check.

**Real bug found and fixed while verifying this** (pre-existing, unrelated to this
change): `Viewer.tsx`'s `ConfidenceMeter` and `Report.tsx`'s confidence badge both did
`Math.round(clf.primary_confidence)` — but `primary_confidence` is stored as a 0-1
fraction (confirmed via `GET /api/stats/doctor`'s own `*100` usage), so a real 68%
confidence was displaying as **"1%"**. Fixed both call sites to `* 100`. Caught only
because this pass's own verification happened to render that exact panel with real data
worth sanity-checking by eye.

**Operational finding**: triggering inference on 2 real WSI images **concurrently**
crashed the whole backend process with no Python traceback (confirmed: `python.exe`
process gone entirely, log just stops) — root-caused as memory pressure (machine had only
4.6GB free of 15.7GB total; Stage 3 adds 2 extra full-tissue-patch classification passes
on top of the existing seg+clf run, and 2 WSIs' pipelines were running as concurrent
FastAPI `BackgroundTasks` in the same process). Retrying **sequentially** (one image's run
fully finished before triggering the next) completed both successfully with no code
change needed — flagged here as an operational constraint for this dev machine, not a bug:
a real deployment should either cap concurrent inference runs or provision more memory.

**Verified for real, end to end**: created a disposable 2-slide test case, uploaded 2 real
PANDA WSIs, ran inference sequentially on both — both completed with real `stage3` output
(`isup_grade`/`confidence`/`classification_pct` all populated, sane distributions e.g.
~41-50% benign, remainder split across G3/G4/G5). Manually set + confirmed each image's
review with deliberately different patterns (image 1: 4+3, 80% area; image 2: 3+4, 20%
area) specifically to exercise the area-weighting logic, not just accept the AI's own
matching output — `GET /api/cases/{id}/gleason` returned `primary=4, secondary=3,
total_score=7, grade_group=3`, an **exact match** to the hand-calculated expectation
(pattern 4 has 4x the weighted area of pattern 3). Confirmed the same numbers render in
the real browser UI: `CaseDetail` showed "4+3=7 / 2/2 ảnh đã xác nhận", `Viewer` showed the
Stage 3 card with real numbers, `Report` showed the corrected 68% confidence. Test case,
slides, images, and empty leftover directories deleted afterward; `sqlite3` confirmed only
the real case `0001` (id 5) remains and `stage3_results` is empty again.

### System audit → concurrency limit + minimal logging (2026-08-07)

User asked for a general improvement audit. Found several real, concrete gaps (security,
reliability, docs drift) via direct code inspection, not guessing — reported the full list
back to the user, who prioritized the top 2 for this pass:

- **No limit on concurrent AI inference runs** — confirmed as the direct cause of the
  server crash hit while testing Stage 3 (see the dated bullet above): FastAPI's
  `BackgroundTasks` runs sync callables in a thread pool, so 2 `POST .../inference` calls
  really did execute 2 full pipelines concurrently, and this dev machine only had ~4.6GB
  free of 15.7GB — OOM, process gone with no traceback.
- **Zero logging anywhere in the backend** — confirmed via `grep`: no `import logging`
  in the whole app. Combined with a couple of best-effort `except Exception: pass` blocks
  (Stage 3 fusion, preprocessing), a real bug in either would be completely invisible —
  not in the DB, not on screen, not in server output.

**Fix 1 — concurrency limit** (`backend/app/routers/inference.py`): module-level
`threading.Semaphore(MAX_CONCURRENT_INFERENCE)` (currently `1`), acquired inside
`_execute()` before any real work starts. Deliberately placed so the DB status stays
`'pending'` for the entire wait and only flips to `'running'` once the slot is actually
acquired — needed **zero frontend changes**, since `Pipeline.tsx` already polls and
displays "pending" correctly. Scoped to a single uvicorn worker process (how this app is
actually run — no `--workers` flag); a real multi-worker deployment would need a
cross-process mechanism instead (DB-backed queue or a real task broker), noted in-code.

**Fix 2 — minimal logging** (`backend/app/main.py`): `logging.basicConfig()` at
startup — uvicorn only configures its own `uvicorn.*` loggers by default, not the root
logger, so without this a plain `logging.getLogger(__name__)` call anywhere in the app
would silently go nowhere. Every previously-silent `except Exception: pass` (Stage 3
fusion in `inference.py`, preprocessing in `cases.py`) now calls `logger.exception(...)`
instead. Also added `logger.info()`/`logger.warning()` calls around the semaphore
wait/acquire/complete/fail transitions in `_execute()`, both for their own debugging value
and to make the new concurrency behavior directly observable in server output.

**Verified for real, not just "it runs"**: restarted the backend, fired 2 real inference
triggers on 2 real PANDA WSIs **truly concurrently** (background shell jobs, not
sequential curl calls) — log confirmed the exact intended sequence (`Run 22: acquired
inference slot` → `Run 23: waiting` → ... → `Run 22: completed` → `Run 23: acquired
inference slot` → `Run 23: completed`), and polled `GET /openapi.json` continuously
throughout the whole ~7-minute window: **`200` on every single check, zero downtime** —
the exact scenario that crashed the server before now completes both runs successfully
with img2 correctly staying `'pending'` (untouched, no wasted memory) the entire time img1
was running. Both runs finished with all 3 result tiers populated (segmentation +
classification + stage3). Test case/slides/images deleted afterward; case `0001` confirmed
untouched.

**Remaining findings from the audit — all also fixed same day (2026-08-07), user said
"tiếp tục" (continue) right after the concurrency/logging pass above**:
- **`backend/.env` didn't exist** — the app was running with the hardcoded fallback JWT
  secret (`config.py`'s `"dev-secret-change-me"`). Generated a real `.env` with a
  cryptographically random secret (`secrets.token_urlsafe(48)`) — note this invalidates
  every previously-issued token, an expected/correct side effect of a real secret
  rotation, not a bug. Verified login still works end-to-end with the new secret.
- **`inference/tiling.py` didn't special-case source images smaller than 500×500** (real
  legacy desktop captures range 193×120 to ~2752×1536) — `cv2.resize()` would
  anisotropically stretch a tiny whole-image capture up to 500×500 (or straight to
  224/256), distorting gland shapes and mismatching the physical scale training patches
  were extracted at. Fixed with a new `_pad_to_size()` (edge-replicate padding via
  `cv2.copyMakeBorder`, not resizing) — only ever triggers when the *source image itself*
  is smaller than `patch_size`, since `_grid_starts()` already guarantees every crop taken
  *from* a larger image is full-size. Verified: a synthetic 193×120 test image now
  produces a genuine 500×500 padded patch (not stretched); re-ran tiling on the real large
  PANDA WSI used throughout this session and confirmed all 210 real tissue patches are
  still exactly 500×500 (no regression).
- **No login rate-limiting** — added a simple in-memory per-username lockout
  (`routers/auth.py`: 5 failed attempts → locked for 15 minutes, `429`). Keyed by username
  rather than IP since this app protects a small, fixed set of known accounts, not a
  public signup system — simpler and more directly on-target than trusting
  `X-Forwarded-For`. Single-process only (in-memory dict), matching how this app actually
  runs (no `--workers` flag) — noted in-code that a multi-worker deployment would need a
  shared store instead. Verified: 5 real failed attempts against a disposable username
  correctly returned `401` each, the 6th returned `429` with the Vietnamese lockout
  message, and a real account was confirmed unaffected (rate limit is per-username).
- **No password-strength validation on `POST /api/admin/users`** — added
  `Field(min_length=8)` to `UserCreate.password` (`schemas/admin.py`). Only applies to
  newly-created accounts, doesn't retroactively touch existing bootstrap accounts (one of
  which, `pass123`, is only 7 characters). Verified: creating a user with a 5-character
  password now correctly returns `422` with a clear message.
- **`admin.py`'s `list_users` N+1 query** — rewritten from 2 queries *per user* in a loop
  to 2 grouped aggregate queries total (`GROUP BY` on `InferenceRun.triggered_by` /
  `AuditLog.user_id`), regardless of user count. Verified: `GET /api/admin/users` output
  compared field-for-field against the pre-fix version — identical `run_count`/
  `last_activity` values for all 5 real accounts.
- **3 stale "known gap" notes elsewhere in this file** — corrected in place (see the
  audit_logs-for-user-create/update and `cancer_area_percentage` bullets above and in the
  Next steps list below) — both gaps were already fixed in earlier passes (2026-08-05) but
  the notes documenting them as open were never updated, found by cross-checking the
  actual current source rather than trusting the existing prose.

**Left deliberately undone at the time**: no automated tests anywhere — flagged as needing
its own scoping conversation. **That conversation happened later the same day and the first
three steps are built** — see the dated "Automated test suite" subsection below and
[docs/TEST_PLAN.md](docs/TEST_PLAN.md).

### Two-portal split — Bác sĩ (5173) vs Quản trị (5174) (2026-08-07)

User asked to split the admin and doctor roles into two separate portals ("hai cổng khác
nhau") because opening both at once conflicted. **Root cause confirmed by reading the code,
not assumed**: both roles were served from the single origin `http://localhost:5173` and
`App.tsx` stored the JWT under one shared key (`prostaai_token`). Browsers scope
`localStorage` by **origin**, not by tab — so an admin logging in from a second tab
overwrote the doctor's token, and the doctor's next render/refresh silently dropped to the
login screen mid-case. Two ports = two origins = genuinely independent storage, which is
why "tách cổng" is the real fix rather than a cosmetic one.

- **`frontend/src/lib/portal.ts`** (new) — single source of truth: `PORTAL`
  (`'doctor'|'admin'`, from `import.meta.env.VITE_PORTAL`, defaulting to `doctor` so a
  plain `vite` invocation still behaves like before), display labels, the other portal's
  URL, the per-portal `TOKEN_STORAGE_KEY` (`prostaai_token_doctor` /
  `prostaai_token_admin`), and `roleMatchesPortal()`. The distinct key is
  belt-and-braces only — different ports already isolate storage; it matters if the two
  are ever served from one origin behind a reverse proxy.
- **`vite.config.ts`** — `defineConfig(({ mode }) => ...)` with `server.port` = 5174 for
  mode `admin`, 5173 otherwise, and `strictPort: true`. Strict on purpose: a silently
  drifted port is a different origin than the backend's `CORS_ORIGINS` allows, and that
  failure surfaces as confusing CORS errors instead of an honest "port in use".
- **`.env.doctor` / `.env.admin`** (committed — non-secret; `frontend/.gitignore` only
  ignores the exact name `.env`) hold `VITE_PORTAL` + `VITE_OTHER_PORTAL_URL`. Loaded via
  Vite's `--mode`, layered on top of the existing `.env` (`VITE_API_BASE_URL`), so the API
  base URL stays configured in one place for both.
- **`package.json`** — `dev` → `vite --mode doctor`, `dev:admin` → `vite --mode admin`,
  and `build` now emits **both** (`dist/doctor/`, `dist/admin/`) in one command.
- **`App.tsx`** — default nav comes from `PORTAL` instead of the account's role; the
  `/me` hydrate path drops a token whose role doesn't belong to this portal (only
  reachable if `VITE_PORTAL` changed under an existing browser profile, but running the
  admin UI off a doctor token would just produce a screenful of 403s). The sidebar's role
  chip now shows the portal name plus a `target="_blank"` link to the other portal — the
  exact "open both at once" action that used to break.
- **`Login.tsx`** — shows which portal you're on, and on a **valid** credential belonging
  to the other role stops with "Tài khoản này thuộc {other portal}…" plus a link across,
  rather than loading the wrong UI and 403-ing on every request. Verified no token is
  written on that rejection path.
- **Backend** — `config.py`'s `cors_origins` default and both `backend/.env` /
  `.env.example` now list `http://localhost:5173,http://localhost:5174`. `.claude/
  launch.json` gained a second entry (`frontend-admin`, port 5174).

**Real pre-existing repo bug found while doing this** (unrelated to portals, but it was
blocking delivery of the new file): the root `.gitignore` carried the stock Python
packaging block **unanchored**, so `lib/` matched **any** directory named `lib` at any
depth — including `frontend/src/lib/`. `git check-ignore -v frontend/src/lib/portal.ts`
confirmed it directly (`.gitignore:21:lib/`). The older files there (`api.ts`, `nav.ts`,
`caseAdapter.ts`, `icon.tsx`, `useApiData.ts`) only stayed visible because they were
tracked *before* the rule existed — git keeps tracking files it already knows. That means
**`frontend/src/lib/dzi.ts` (from the 2026-08-06 deep-zoom pass) was silently invisible to
git too**, and a commit would have shipped a repo that doesn't build. Fixed by anchoring
every rule in that block to the repo root (`/lib/`, `/build/`, `/dist/`, …) — Python build
artifacts only ever appear at a package root, so nothing is lost, and `frontend/dist` stays
ignored via `frontend/.gitignore`'s own rule. Verified after the change that `dzi.ts` and
`portal.ts` both show up as untracked while `frontend/dist`, `backend/.venv`, and
`node_modules` are all still correctly ignored.

**This is a session/UX boundary, not access control** — stated explicitly in
`portal.ts`'s own docstring so nobody later mistakes it for a security layer. Both portals
build from one codebase and ship the same bundle (identical 1,304.56 kB JS in both
outputs — no code splitting), so the admin page code is still present in the doctor build;
the real enforcement remains `require_admin` on the backend, exactly as this file already
notes elsewhere ("hiding the nav item is not real access control").

**Verified for real in the actual browser, both portals live at once**: `curl`-confirmed
the CORS preflight returns `access-control-allow-origin` for 5173 **and** 5174 while an
unknown origin (`:9999`) gets none. Logged the doctor account into 5173 (real dashboard,
real case `PA-2026-0001`) and the admin account into 5174 (real stats, real audit feed, 7
real model entries) **simultaneously**, then reloaded 5173 and confirmed the doctor session
survived intact — the precise scenario that used to evict it. Confirmed via
`Object.keys(localStorage)` on each origin that 5173 holds only `prostaai_token_doctor` and
5174 only `prostaai_token_admin`. Logged out of 5174 and tried the **doctor** credentials
there: correct wrong-portal message + working "Chuyển sang Cổng Bác sĩ" link, and
`localStorage` stayed empty (no token written). Zero console errors on either portal;
`npx tsc --noEmit` clean; `npm run build` produced both bundles. No test data created and
no data touched — case `0001` and every real account are exactly as they were.
(Screenshots weren't possible — this automation browser's pane doesn't composite frames,
the same limitation documented in the deep-zoom subsection above — so all of the above was
verified through page text, live DOM/`localStorage` inspection, and curl instead.)

### Tiling / mask-stitching audit — 3 real bugs + a mask colour key (2026-08-07)

User asked for a check of whether patch extraction and mask stitching had drifted, and
whether the mask's label colours were right. Everything below was measured against real
data (a real generated mask for a 6144x26112 slide, real PANDA WSIs, a real 193x120 crop)
rather than reasoned from the code alone.

**Colours were already correct — no change needed.** `np.unique` over the whole 160M-pixel
mask found **exactly 6 unique colours and nothing else** (`#1a1a1a` background 83.71% /
`#9e9e9e` stroma 10.81% / `#2ca02c` benign 0.46% / `#ffd60a` G3 0.04% / `#ff7f0e` G4 2.06%
/ `#d62728` G5 2.92%), i.e. no interpolated or stray values — PNG is lossless and the
RGB→BGR reversal in `MASK_COLORS_BGR` is right. They match `styles/tokens.css`'s
`--gleason-*` exactly. Stitched mask dimensions also matched `images.width_px/height_px`
exactly, and `_segment_patch` already resizes 256→500 with `INTER_NEAREST` (never
bilinear), so no invented class values.

Three real defects were found in the stitching/counting path, all fixed:

- **Crash on any source image smaller than 500x500** (introduced by the 2026-08-07 audit's
  own `_pad_to_size` fix, above). `run_pipeline` stitched with `full_mask[y:y+ph, x:x+pw] =
  pred` where `ph/pw` came from the **padded** patch, so a 193x120 capture raised
  `ValueError: could not broadcast input array from shape (500,500) into shape (120,193)`
  — reproduced directly, and it means every legacy desktop capture (193x120 …
  2752x1536) failed its run outright.
- **Padding silently starved the tissue filter.** `_tissue_mask` ran on the **padded**
  patch: a realistic small capture (stained tissue centre, glass border) measuring
  **40.63%** tissue reads **3.76%** once edge-replicated up to 500x500 — under
  `MIN_TISSUE_FRACTION` (5%), so the whole image yielded **zero patches** and was dropped
  as "no tissue". Measured, not hypothesised.
- **Shared-band double counting inflated per-pattern area by +7.4%.** `_grid_starts`
  shifts the last window inward, so it overlaps its predecessor (356px on a 6144 axis,
  388px on 26112). The stitched mask was fine (later patch overwrote), but `pattern_area`
  accumulated **per patch**, counting the band twice: 172,250,000 vs the real 160,432,128
  on that slide's geometry. That biased the primary/secondary ranking toward whichever
  pattern sat along the right/bottom edge, and left it inconsistent with
  `cancer_area_percentage` (computed from `full_mask`, so never double-counted).

**Fix — one mechanism covers all three.** `tiling.py` gained `_exclusive_extents()`:
each window owns pixels up to the *next* window's start, or to the image edge for the
last one, and `Patch` carries that as `w_valid`/`h_valid`. `pipeline.py` both stitches and
counts through `owned = pred[:h_valid, :w_valid]`. Every source pixel now belongs to
exactly one patch — verified across 193/500/1200/2752/6144/26112 axes: coverage exact,
contiguous, zero overlap, zero gaps. The small-image case falls out of the same rule (the
last window is capped at the image size, so replicated padding never reaches the mask).
Separately, the tissue check now runs on the **raw** crop and `_pad_to_size` is applied
last, after `normalize_stain()` — so the Macenko fit never sees duplicated edge pixels
either.

**Mask colour key added to `Viewer.tsx`** (`MASK_LEGEND`): the overlay was six unlabelled
colours with no key anywhere in the UI. Shown only while the AI mask layer is active. The
four Gleason swatches read the shared tokens (already sourced from `MASK_COLORS_BGR`, so
they can't drift); background/stroma are literals since nothing else in the UI uses them.

**Verified end-to-end on real data, not just unit-level:**
- Real 193x120 crop from an actual PANDA WSI, uploaded and run through the real API →
  `status='completed'` (this exact path crashed before). Mask came back **120x193** — the
  source's own size, no padding leak — with only known colours, and tissue/cancer
  recounted straight from the PNG (**11,813 / 318**) matched the DB's
  `total_tissue_area_px`/`cancer_area_px` **exactly**.
- Real 24064x4608 PANDA WSI → completed in ~180s, primary=4 / secondary=5, 88.29% cancer
  area, Stage 3 ISUP 5. Mask **4608x24064**, **0 pixels** outside the 6 known colours, and
  tissue/cancer recounted from the PNG matched the DB exactly again (7,194,809 /
  6,352,420 → 88.29171%). That equality is the point: mask and reported areas are now
  consistent by construction, which is precisely what the double-counting broke.
- Legend confirmed in the real browser: all 6 swatches render with computed colours
  `rgb(26,26,26)`, `rgb(158,158,158)`, `rgb(44,160,44)`, `rgb(255,214,10)`,
  `rgb(255,127,14)`, `rgb(214,39,40)` — the exact mask palette — and disappear when the
  mask layer is toggled off. No console errors (the two 404s seen are
  `GET /api/images/{id}/review` with no draft yet, which `api.getReview` deliberately
  treats as `null`).

Test case/slide/images/runs and their upload directory deleted afterwards;
`PRAGMA foreign_key_check` clean, only case `0001` (id 5) remains, and the one surviving
`stage3_results` row was confirmed to belong to that real case, not the test.

### Patch-extraction audit → tissue filter rebuilt (2026-08-07, same day)

Follow-up audit of the patch-cutting method itself ("đầu vào chẩn đoán"), then a fix the
user asked for directly: patch extraction must pick up **all** of the WSI's tissue so the
stitched mask has no holes.

**What already matched the training methodology** (checked point by point, not assumed):
patch size 500x500; read at WSI level 0 (`cv2.imread` returns page 0 — confirmed
24064x4608 on a real PANDA file, the native level); edge windows shifted inward; resize
500→224 (classification) / 500→256 (segmentation) bilinear with ImageNet normalization;
`COLOR_BGR2RGB` before normalizing. The classification gate also holds up better than it
looks: measured on a real slide, **93.8%** of the patches handed to the classifier satisfy
the training-time labelling rule (one class ≥50% of the epithelium). *A first measurement
put this at 87.5% out-of-distribution — that used total patch pixels as the denominator,
which is the wrong one; the rule is defined over epithelium.*

**The tissue filter was wrong in both directions**, and both directions were measured:
- **It dropped real tissue.** A patch under `MIN_TISSUE_FRACTION` (5%) was skipped
  entirely, so its tissue was never segmented and stayed background in the stitched mask:
  **0.492%** of all tissue across 8 real PANDA slides (worst slide 1.03%). Thin strands at
  a biopsy's edge are exactly the shape that loses out.
- **It invented tissue.** `preprocessing._tissue_mask` is a per-patch Otsu, and Otsu always
  returns a split even for a single-peak histogram — uniform glass carrying ordinary
  sensor noise measured **38-43% "tissue"** and was kept. PANDA's background is exactly
  255 with no noise (432/432 blank patches scored 0.00%), which is why this never appeared
  in any earlier test; a real microscope capture is noisy, so blank patches would reach
  the models, land in the mask, inflate `total_tissue_area_px`, and skew Stage 3 (which
  averages classification over every "tissue" patch). On one real slide the old filter kept
  **210** patches where only **178** contain any tissue at all.

**Fix**: one **global** saturation threshold per image instead of a per-patch adaptive one
— Otsu on a 1/8 copy, floored at `MIN_SATURATION = 40`. The floor is measured, not picked:
real H&E tissue saturation starts at ~39 (1st percentile; median 74) while glass with
realistic noise (sigma=6) tops out at 36. The floor is what saves a blank capture, whose
Otsu value is meaningless because its histogram is unimodal. A patch is then kept if its
**owned** region (see the subsection above) holds any tissue at all — **no area fraction**
— after a 3x3 morphological opening. The opening is the whole noise defence: sensor noise
is scattered single pixels, tissue is contiguous.

Kernel size was chosen from a sweep, not assumed. 2x2 loses less tissue (95px vs 364px)
but only rejects noise up to sigma=6 (11/12 blank patches still kept at sigma=12); 3x3
rejects sigma=6 **and** sigma=12 completely (0/12 each, versus 8/12 and 12/12 with no
opening). 3x3 was taken: its cost over 8 real slides is **364 pixels of 148M (0.00025%)**,
and by construction the only thing it can drop is a structure nowhere 3px thick — under
**1.46um** at PANDA's real 0.486um/pixel (see below), well below a single nucleus. Very
heavy noise (sigma=18) still leaks; noted, not solved.

**Verified with the real `tile_image()`**, 8 real PANDA slides: tissue outside any
processed patch went **0.492% → 0.00025%**; blank noisy glass at sigma=2/6/12 now yields
**0 patches** each (was 3-4); a real 193x120 legacy-sized crop and a real 500x500 patch
both still produce exactly one patch with the correct owned extents. Real end-to-end
`run_pipeline()` on the 24064x4608 slide: completed in 95s, mask dimensions matched the
source exactly, **zero** pixels outside the 6-class palette, and tissue/cancer area both
rose slightly (7,566,603 / 6,708,987 vs 7,194,809 / 6,352,420 before) — consistent with
now covering tissue that used to be skipped. Patch count fell 210 → 177, since the 32-odd
blank patches the old filter kept are gone, so this costs no extra compute.

**Measured `openslide.mpp` equivalent — resolves a standing Next-steps item.** Every one of
the 35 PANDA TIFFs carries `XResolution = 20568.19 px/cm` (`ResolutionUnit = 3`,
centimetre), identical across all of them → **0.48619 um/pixel at level 0**. That is
roughly a **20x** scan scale, which **contradicts this file's own earlier recommendation**
that "40x is the closest practical match" and that live capture should default to 40x: a
40x objective (~0.25um/px) is off by 1.95x and a 10x objective (~1.0um/px) by 2.06x — very
nearly equally wrong, in opposite directions. Corrected in place in the Production
architecture bullet and Next steps item 4. **Not acted on**: patch extraction still does no
physical-scale normalisation at all — it cuts 500x500 pixels whatever the image's um/px.
That is correct for PANDA files (same source) and arbitrary for a real microscope capture.
The app already has `magnification_calibration` for the measured um/px per objective; the
conversion would be a resize by `measured_mpp / 0.48619` before tiling. Left for the user
to decide, since it changes every result.

**Physical-scale normalisation, built right after (2026-08-07)** — the "left for the user
to decide" item above; user said yes. New `backend/app/inference/scale.py`:
`TRAINING_UM_PER_PIXEL = 0.48619`, so one training patch spans **243.1µm** of tissue, and
`patch_size_for(mpp)` returns the native-pixel patch that covers that same 243.1µm.
Crucially it resizes **the grid, not the image**: a finer capture takes a physically larger
crop, which `_to_tensor`'s existing 224/256 resize then lands at the training scale — so
nothing else in the pipeline changed, gigapixel images are never resampled whole, and
`_segment_patch` already resizes its prediction back to the patch's own size, so stitching
and the `w_valid`/`h_valid` bookkeeping keep working unmodified.

Resolution is resolved most-trustworthy-first, and **never guessed**: (1) the image file's
own TIFF resolution tags, (2) the admin's stage-micrometer `magnification_calibration` row
for the magnification recorded on the image, (3) neither → **no rescaling at all**, exactly
the previous behaviour. `_resolve_um_per_pixel()` (`routers/inference.py`) runs on the
request's session, since `_execute()` opens its own after the response is sent. File
metadata deliberately outranks calibration: a PANDA file tagged "40x" by a careless
uploader must not be resampled against a 40x calibration when the file itself states its
real resolution.

Verified through the real API with both branches live: a real 193x120 tissue PNG (no
metadata) tagged `40x` with a 40x calibration of 0.25µm/px logged
`0.25000 um/px vs training 0.48619 -> patch 972px instead of 500px (same 243.1um of
tissue)` — twice, once for the main pipeline and once for Stage 3, i.e. both branches
rescale consistently — and completed. The real 24064x4608 PANDA WSI, **also tagged 40x**,
logged no rescale line at all (its own metadata won) and returned
`cancer=6,708,987 tissue=7,566,603 pct=88.666` — identical to the pre-change run, which is
the regression check that matters. Unit-level, every objective lands on the same span:
40x→972px, 20x→486px, 10x→243px, 4x→97px, all 242.5-243.1µm; PANDA metadata resolves to
500px unchanged (a 2% tolerance stops float noise triggering a pointless resample); a PNG
with no tags returns `None`. Test case/slide/images and the test calibration row deleted
afterwards (`magnification_calibration` confirmed back to 0 rows, as it was before), only
case `0001` remains, `PRAGMA foreign_key_check` clean.

**Known consequence, not a bug**: a small capture at high magnification genuinely does not
contain a training patch's worth of tissue — 193px at 0.25µm/px is 48µm, a fifth of
243.1µm — so it gets edge-padded up to 972px, i.e. ~79% replicated border. The framing is
now physically honest, but the underlying problem (the field of view is too small) can only
be fixed at capture time, by photographing at lower magnification or stitching frames.

### Slide management — "+ Slide mới" no-op fixed, delete/reorder added (2026-08-07)

User reported "chỉnh sửa phần tạo slide mới không được". First finding was a **correction to
my own claim**: I initially said I had reproduced a dead button on `CaseDetail`, but that
click delivered no events to the page at all (not even `pointerdown`) — the Browser pane's
synthetic input wasn't landing, the same automation limitation already documented for
screenshots. `CaseDetail`'s button was fine: `POST /api/cases/{id}/slides` returned `201`
via curl and a scripted click created a real slide and updated the list.

**The real no-op was on `Upload.tsx`.** `ensureSlide()` opened with
`if (selectedSlideId) return selectedSlideId;` — correct for its original job ("make sure
there is somewhere to put this image"), but the slide picker's **"+ Slide mới"** entry
called the same function. Since the effect that populates the picker auto-selects the first
slide, `selectedSlideId` is almost always set, so choosing "+ Slide mới" did nothing at all:
no request, no slide, the `<select>` just snapped back. Split into `createSlide()` (always
creates; used by the picker) and `ensureSlide()` (keeps the early return; used by the save
path). The new slide's label now also reads `legacy_slide_label` instead of rebuilding
`Slide {slide_number}`, matching `caseAdapter.ts`.

**Silent failures made this impossible to diagnose**, which is likely why it read as
"the button does nothing" in the first place: `CaseDetail`'s `handleAddSlide` had a bare
`catch {}` with a comment saying the list "simply won't grow". Any failure — server down,
expired session, the 12-slide cap — produced zero feedback. It now sets a `slideError`
banner (using existing tokens only; `--red-50/200/700` don't exist in `tokens.css`).

**Slide delete and reorder** (neither existed; only images could be deleted):
- `DELETE /api/cases/slides/{slide_id}` — reuses the extracted `_delete_image_files()`
  helper for each image (same UUID-stem glob + `rmtree` for the deep-zoom directory that
  `delete_image` uses), then removes the now-dead slide upload directory, but only when it
  is genuinely empty so an unexpected leftover is preserved rather than destroyed. DB rows
  cascade on their own. Slide numbers are left with a **gap** rather than renumbered:
  `add_slide` takes `max+1` so gaps are harmless, and renumbering would silently relabel
  slides the doctor never touched.
- `POST /api/cases/slides/{slide_id}/move` with `{direction: 'up'|'down'}` — swaps with the
  neighbour. `slides` has `UNIQUE(case_id, slide_number)`, so the swap goes through a
  temporary out-of-range number (`-slide.id`) instead of colliding mid-statement. **Only
  the position moves** — `legacy_slide_label` stays with its own slide, because that label
  names a real piece of glass ("Slide 3-4"); reordering a list must not rename it.
- `CaseDetail` gained per-slide up/down/delete `IconButton`s, with up disabled on the first
  slide and down on the last, and a delete confirmation that names the slide and warns
  about image count only when there are images.

**Verified end-to-end.** Reorder: moved a middle slide up, order flipped in the DB and
labels correctly stayed attached to their own slides; moving past either end returned `400`
with the right Vietnamese message. Delete: uploaded a real image to a slide (5 files on
disk — original, thumb, view, normalized, tissue-mask), deleted the slide → **0 files left**,
`images` and `preprocessing_results` rows both gone, `PRAGMA foreign_key_check` clean, and
the empty directory removed after the follow-up fix. Through the real UI: the picker's
"+ Slide mới" created a second slide **while a slide was already selected** — precisely the
state the old early-return silently swallowed — and the up/down/delete buttons rendered with
the correct disabled states, moved the slide (screen and DB agreed), and deleted it with the
confirmation text "Xóa Slide 3-4?". Test case, slides, images and upload directory deleted
afterwards; only case `0001` remains.

**Two methodology notes that code cannot fix**, for the thesis write-up: Macenko stain
normalisation is applied at inference but was never applied during training (already
flagged elsewhere in this file); and a source image smaller than 500x500 must be
edge-padded, a patch shape the models never saw in training. Also minor and unfixed:
`normalize_stain()` raises a real `RuntimeWarning: overflow encountered in exp` on real
WSI patches — negative stain concentrations are not clipped at 0 as standard Macenko
implementations do. The following `np.clip(0, 255)` means the effect is pixels pushed to
white rather than NaN; the pixel count affected was not measured.

### Automated test suite — 203 backend + 29 frontend tests (2026-08-07)

The long-deferred testing item, scoped and then built out in full. Plan lives in
[docs/TEST_PLAN.md](docs/TEST_PLAN.md); every roadmap step is done — infrastructure, all of
P0/P1/P2, Vitest for the frontend, and the manual checklist written up as
[docs/MANUAL_TEST_CHECKLIST.md](docs/MANUAL_TEST_CHECKLIST.md) (47 items, thesis-appendix
shaped). `cd backend && python -m pytest` — **203 tests, ~4 minutes, no `.pt` checkpoints
needed, no network**. `npm test --prefix frontend` — **29 tests, ~1 second**. `pytest -m
slow` adds 2 tests that do exercise the real checkpoints and the Stage 3 artifact.

```
backend/pytest.ini                 markers + `-m "not slow"` by default
backend/tests/conftest.py          all shared fixtures (see below)
backend/tests/test_tiling.py       patch grid, tissue filter, physical scale   (37)
backend/tests/test_pipeline.py     stitching + area accounting, stub models    (13)
backend/tests/test_grading.py      ISUP Grade Group table                      (11)
backend/tests/test_case_gleason.py case-level aggregation                       (8)
backend/tests/test_auth_permissions.py  role gating, lockout, password rules   (24)
backend/tests/test_limits.py       slide/image caps, upload validation         (10)
backend/tests/test_review_lifecycle.py  draft -> confirm -> locked              (9)
backend/tests/test_slide_management.py  delete + reorder, files on disk        (14)
backend/tests/test_scale_resolution.py  µm/px source precedence               (11)
backend/tests/test_stage3_fusion.py     feature-vector column ordering         (6)
backend/tests/test_migration.py         CSV import, SAVEPOINT isolation       (11)
backend/tests/test_library_export.py    row shape + anonymisation              (9)
backend/tests/test_doctor_stats.py      dashboard tiles vs real state          (8)
backend/tests/test_annotations.py       shoelace area + annotation CRUD        (14)
backend/tests/test_dzi.py               tile path-traversal + auth gate        (18)
frontend/src/lib/caseAdapter.test.ts    API -> UI adapter                      (9)
frontend/src/lib/portal.test.ts         portal identity + role gate            (9)
frontend/src/lib/api.test.ts            fetch wrapper error mapping           (11)
```

Frontend tests deliberately use **no jsdom and no component rendering** (`environment:
'node'`): what has actually broken in this project is the adapter, the portal gate and the
fetch wrapper's error mapping — all pure logic. Rendering tests would be slower and would
mostly re-assert JSX; interaction is covered by the manual checklist instead.

**Infrastructure decisions worth keeping straight:**
- **The real database is never touched.** `conftest.py` sets `DATABASE_URL` (and
  `JWT_SECRET`) in `os.environ` at *module top level*, before importing anything from
  `app` — `app.database` builds its engine from `settings` at import time, so a fixture
  would be too late. Verified after a full run that `database/prostaai.db` still holds only
  case `0001` and `backend/uploads/` is unchanged.
- **The test DB is built from `docs/schema.sql`**, which makes it a live check on this
  repo's riskiest habit: DDL is applied by hand to two places (schema.sql and the live
  file). Drift between them is now a red test rather than a surprise on the next install.
- **`UPLOAD_ROOT` is patched on four modules**, not one — `from .cases import UPLOAD_ROOT`
  binds a separate name in `inference.py`, `admin.py` and `dzi.py`, and patching only
  `cases.py` would let the others keep writing into the real `backend/uploads/`.
- **Stub models instead of real checkpoints** (`registry.load` monkeypatched). Keeps the
  suite at seconds instead of minutes and makes the area assertions exact. The single real-
  checkpoint smoke test is marked `slow` and excluded from the default run.
- **Images are generated, not committed** (seeded numpy) — real fixtures would be hundreds
  of MB, and `test_image/` is deliberately outside git.
- **Process-global state is reset per test**: the login lockout dict and the registry's
  model cache both leak across tests otherwise.

**Two real bugs the suite found:**
1. `Case.slides` had no `order_by`, so SQLite returned slides in whatever physical order it
   liked — and that order is not even stable across `UPDATE`s. The slide-reorder feature
   built earlier the same day would therefore have had no reliable visible effect. Manual
   browser testing missed it precisely because the order happened to come out right that
   one time. Fixed by adding `order_by` to `Case.slides` and `Slide.images`.
2. `_open_legacy_sqlite` (`admin.py`) only handled the "right file type, wrong tables" case.
   A file that is not a SQLite database at all — a spreadsheet, a truncated copy — let
   `sqlite3.DatabaseError` escape as a **500**, so an admin who picked the wrong file got no
   usable message. Now caught and returned as a `400` in Vietnamese.
3. `GET /api/images/{id}/annotations` answered `200 []` for an image that does not exist,
   so "this image was deleted" was indistinguishable from "no regions marked yet" — and
   inconsistent with every other per-image GET (`/file`, `/review`, `/preprocessing` all
   404). The POST on the same path already checked. Existence check added.

**Test-authoring mistakes, all mine, all corrected rather than papered over**: an assertion
that 4+4=8 maps to Grade Group 5 (it is GG4 — the code was right); a session-wide uploads
directory that let one test's files land in the path a later test expected to own, failing
only when the file ran as a whole (hence `uploads_dir` is function-scoped); a TIFF fixture
built through Pillow's `dpi=` shortcut, which silently keeps `ResolutionUnit=inch` and would
have left the **centimetre** branch — the one every real PANDA file uses — untested, so the
tags are now written directly and a guard test asserts the fixture reproduces PANDA's real
20568.19 px/cm; and one wrong multipart field name (`file` vs `db_file`).

**Path-traversal coverage**: 11 attack strings against the DZI tile route
(`../../../../etc/passwd`, `..%2f`, `....//`, wrong extension, wrong case, stray
whitespace…) are each asserted to be rejected *and* to leak no filesystem content, plus
both tile and descriptor are checked to require authentication — this app deliberately has
no public image URLs.

**Nothing from the plan is left unbuilt.** The two `slow` tests (real `.pt` checkpoints via
`registry.load()`, and the real Stage 3 joblib artifact still taking exactly 8 features)
were run once and pass; they stay out of the default run so the suite never depends on
files that are gitignored.

## Design source

The UI was ported from a Claude Design project (id
`ae3d7aa2-61e5-4048-ac23-07560205c617`, "Admin và bác sĩ dashboard"), file
`ProstaAI.dc.html`, built against a bespoke **ProstaAI design system** (14 components,
brand tokens). That file only runs inside the Claude Design canvas runtime — it is *not*
part of this repo — so every screen and component was hand-translated into real
React/TSX. Re-fetch it via the `DesignSync` MCP tool (`get_file` on that project id) if
you need to check something against the original mockup.

Brand voice/visual rules (from the design system's readme — keep following these when
adding UI):
- **Clinical, precise, calm tone.** ProstaAI is a decision-support *aid*; copy never
  claims to diagnose ("suspicious region", "AI-suggested pattern", never "cancer
  detected"). Never use emoji.
- Sentence case for labels/buttons/headings; UPPERCASE only for small eyebrow labels.
- Numbers are always explicit and mono-set: Gleason scores (`3+4=7`), confidence (`92%`),
  case IDs (`PA-2026-0142`).
- Colors: navy (`--blue-900`) = structure/primary actions, bright blue (`--blue-500`) =
  accent/AI-related highlights. Dedicated Gleason ramp (`--gleason-3/4/5/benign`) is used
  *only* for grade-related UI — don't reuse those colors for anything else.
- Fonts: Plus Jakarta Sans (display/headings), IBM Plex Sans (body/UI), IBM Plex Mono
  (data/IDs/measurements) — all Google Fonts substitutions, no licensed brand font yet.
- The disclaimer text ("ProstaAI là công cụ hỗ trợ nghiên cứu...") should appear on any
  screen presenting AI output — see `components/Histology.tsx`'s `Disclaimer`.

## Running the frontend

**Two portals, two ports** (see the dated "Two-portal split" subsection under
[Frontend↔backend integration](#frontendbackend-integration)) — run either or both:

```bash
cd frontend
npm install
npm run dev
```

```bash
npm run dev:admin --prefix frontend
```

`npm run dev` = **cổng Bác sĩ** on `http://localhost:5173` (Vite mode `doctor`);
`npm run dev:admin` = **cổng Quản trị** on `http://localhost:5174` (mode `admin`). Both
ports are `strictPort: true` — a busy port fails loudly rather than drifting to another
one, which would silently break CORS. `npm run build` produces **both** bundles
(`dist/doctor/` and `dist/admin/`).

Needs `backend` running on `http://localhost:8000` (see above) for the Admin screens and
login to work — `frontend/.env` (`VITE_API_BASE_URL`) points at it, copy from
`.env.example` if missing; the per-portal vars live in the committed `frontend/.env.doctor`
/ `frontend/.env.admin` (non-secret, loaded by Vite's `--mode`). Backend `CORS_ORIGINS`
must list **both** ports. `npx tsc --noEmit -p tsconfig.app.json` for a standalone
typecheck. There are two `.claude/launch.json` entries (`frontend` = 5173,
`frontend-admin` = 5174) for the Claude Code browser preview tool.

## Next steps (not yet done)

Roughly in the order they unblock each other:

1. ~~Drop real `.pt` checkpoints~~ — **done (2026-08-04)**: 4 classification + 3
   segmentation checkpoints in `backend/models/`, first full pipeline run verified
   `completed` end-to-end (see [AI inference pipeline](#ai-inference-pipeline-backendappinference)).
2. ~~Wire `Pipeline.tsx`/`Viewer.tsx` to the real endpoints~~ — **done (2026-08-04)**,
   `Report.tsx` too. See [Frontend↔backend integration](#frontendbackend-integration)'s
   Pipeline/Viewer/Report subsection for the nav restructuring (image-scoped, not
   case-scoped) and full verification. The `cancer_area_percentage`-not-copied-to-
   `diagnostic_reviews` gap this bullet used to flag was **fixed 2026-08-05** (ruler/
   calibration pass) — `Report` shows the real number now, not "Chưa có diện tích ung thư".
3. ~~Model-selector UI~~ — **done (2026-08-04)**: `Pipeline.tsx` now shows a picker (2
   `Select`s, real architecture names + metric hints, filtered to `checkpoint_available:
   true`) before triggering any new run, backed by a new non-admin `GET /api/models`
   endpoint (`GET /api/admin/models` was `require_admin`-gated — doctors couldn't call it).
   Also fixed a real retry bug caught along the way: "Thử lại" after a failed run never
   actually re-triggered anything before this pass. See
   [Frontend↔backend integration](#frontendbackend-integration)'s Pipeline/Viewer/Report
   subsection for the full writeup and verification.
4. ~~Add the "độ phóng đại" field to Upload/live-capture~~ — **done (2026-08-05)**:
   `images.magnification` + `Upload.tsx`'s selector, see [Frontend↔backend
   integration](#frontendbackend-integration)'s Legacy desktop app integration
   subsection. The µm/pixel half of this item is **measured as of 2026-08-07**: PANDA
   level 0 is **0.48619 µm/pixel** (read from the TIFF resolution tags, identical across
   all 35 files) — which also showed the old "40x ≈ Level 0" assumption was wrong, see
   the Microscope calibration bullet above. **Also done the same day**: patch extraction
   now sizes its grid so every patch covers the training span of 243.1µm, driven by file
   metadata then `magnification_calibration`, with no rescaling when neither is known —
   see `backend/app/inference/scale.py` and the physical-scale paragraph in the
   2026-08-07 patch-extraction audit subsection.
5. ~~v2 heatmap~~ — **moot (2026-08-05)**: the user asked to drop heatmap output from the
   prediction entirely rather than upgrade it, so the v1 confidence heatmap that used to
   motivate this item was removed instead of replaced — see the dated bullet under
   [Frontend↔backend integration](#frontendbackend-integration). No heatmap of any kind
   (v1 or Grad-CAM/Attention-Rollout) ships now; revisit only if the user asks for
   explainability output again later.
6. `ai_models_config.py` — done (2026-08-04). **Still pending, needs the user's
   confirmation to proceed**: rewrite `docs/PRD.md`'s SICAPv2/ResNeXt50/binary-mask
   wording — larger than first scoped, spans ~8 sections (§0, §3, §4, §8.3, §8.5, §9.3,
   §10, §11, §13) of the thesis's own requirements doc, not a quick config-file fix.
7. Docker/`docker-compose` — deferred when the directory reorg was done (PRD marks it
   optional); revisit once the AI pipeline is stable.
8. Verify the live camera capture path (`Upload.tsx`) on a real machine with a microscope
   camera attached — this dev sandbox has none, so only the permission/no-device fallback
   paths could be exercised here.
9. ~~Real legacy-database connector once the engine/access is confirmed~~ — **done
   (2026-08-05)**: the engine turned out to be plain SQLite (the actual desktop app,
   `D:\LV\Debug\`, was found sitting in the repo), so `POST /api/admin/migration/
   sqlite-preview`/`sqlite-import` now read it directly — cases, slides (with real
   labels), images (with real magnification + files), not just the CSV stand-in's
   cases-only import. See [Frontend↔backend integration](#frontendbackend-integration)'s
   Legacy desktop app integration subsection for the full verification (real
   `Debug/ImageCapture.db` + `Debug/Images/*.tiff` imported end-to-end, anonymization
   confirmed enforced). CSV path kept as a fallback for whenever only a hand-exported
   CSV is available, not removed.
10. Decide whether to introduce `react-router` once real navigation (deep links, browser
    back/forward) is needed — not required for the current single-session demo.
11. Report export (PRD §8.8) — explicitly declined by the user for now; `Report.tsx` now
    renders real confirmed review data (2026-08-04) and has a working "In" (browser print);
    a generated PDF/HTML artifact is still not built, revisit only if the thesis write-up
    needs one rather than screenshots/browser-print of the real screen.
