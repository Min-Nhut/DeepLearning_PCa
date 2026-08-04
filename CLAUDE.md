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
  [Case/Slide/Image API](#caseslideimage-api).
- `inference_runs` — one row per AI pipeline execution on an image (`status`:
  pending/running/completed/failed), fanning out to `segmentation_results` (6-class
  tissue mask + per-class area — **not binary**, see
  [AI models](#ai-models--training-methodology-colab-notebooks) below) and
  `classification_results` (primary/secondary Gleason pattern + confidence + heatmap),
  both 1:1 per run.
- `diagnostic_reviews` — the doctor's editable copy of the AI output, plus **manual-only**
  fields not produced by the model: `biopsy_location`, `pni_present`/`pni_notes`,
  `lvi_present`/`lvi_notes`, `free_notes`. `status` draft→confirmed with `confirmed_at`
  acting as a soft lock (no real legal e-signature — see PRD §8.6).
- `reports`, `audit_logs` — export history and a basic action log (not a tamper-proof
  enterprise audit log — out of scope per PRD §5/§12).

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

### "Stage 3" — resolved: not built for now

The segmentation notebook's §14 comment mentions per-class area-% output feeding "Stage 3
(kết hợp feature → ISUP grade)", raising the question of whether a third fusion
model/step combines segmentation + classification into a case-level ISUP grade. **User
confirmed (2026-08-04): no — only the 2 existing models (segmentation + classification)
are used for now.** A Stage 3 fusion model may be added later if time allows, but is not
required. Consequence: case-level score aggregation stays a **simple rule, not a trained
model** — the existing `_grade_group()` formula (`backend/app/routers/reviews.py`,
ISUP grade from primary+secondary pattern) is confirmed as what the automatic AI pipeline
should reuse too, not just the manual diagnostic-review path.

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
  camera supports **3 objective magnifications: 4x, 10x, 40x**. Since PANDA/Radboud slides
  are typically scanned near their scanner's maximum objective, **40x is the closest
  practical match** to the training patches' physical scale — recommend defaulting
  live-capture/upload to 40x, and recording the magnification actually used per image
  (the still-unbuilt "độ phóng đại" field from PRD §8.4) so 4x/10x captures can be
  rescaled by a known factor instead of guessed. **Still needs the exact µm/pixel value**
  pulled from a sample PANDA WSI file's metadata to turn "40x ≈ Level 0" into a precise
  scale factor — not done yet.
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
  lib/api.ts               fetch wrapper (ApiError, apiFetch) + typed calls to every backend
                           endpoint, incl. multipart uploads/migration calls, downloadBlob()
                           and getImageBlobUrl() (auth-gated image fetch -> object URL)
  lib/useApiData.ts        Shared load/error/data hook used by every real-backed screen
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
`DoctorDashboard`'s stat tiles are still static (the case list itself is real via the
shared `cases` prop) — no AI-result aggregation exists there. `CaseDetail`'s case-level
Gleason header still shows a neutral "Chưa có kết quả AI" badge rather than any per-case
aggregate — AI results stay strictly **per-image**, there is no case-level rollup anywhere
in the schema (a case can have many images, each with its own independent inference run).
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
  requirements.txt              incl. CPU-only torch/torchvision + segmentation-models-pytorch
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
                                      no AI model — see Case/Slide/Image API below
    inference/                        the real AI pipeline (see AI inference section below)
      architectures.py                 get_segmentation_model()/get_classification_model()
                                        factories, ported from the training notebooks
      registry.py                       checkpoint discovery (backend/models/) + lazy-
                                         loaded model cache + ModelNotAvailableError
      tiling.py                         500x500 grid patch extraction (edge-shifted)
      pipeline.py                       orchestrates tile -> segment -> classify -> aggregate
    routers/auth.py                   POST /api/auth/login, GET /api/auth/me
    routers/admin.py                   everything under /api/admin/* (see below)
    routers/cases.py                    case/slide/image CRUD + upload/serve (see below)
    routers/reviews.py                   diagnostic review CRUD (see below)
    routers/annotations.py                manual freehand-annotation CRUD (see below)
    routers/inference.py                   trigger/poll/serve AI runs (see below)
  models/                        NEW, gitignored except .gitkeep placeholders — where
                                  trained checkpoints go: classification/{arch}_best.pt,
                                  segmentation/{arch}_best.pt. Empty today (no checkpoints
                                  yet) — every architecture name matches CLAUDE.md's AI
                                  models section exactly (unet_densenet121, efficientnet_b0,
                                  vit_b_16, etc.) so dropping a file in just works.
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
- `GET /library/export?format=csv|json&scope=all|reviewed` — streams a case export with
  `patient_name` always dropped (anonymized per PRD §9.3 — not a toggle).
- `POST /migration/preview` (multipart CSV) — detects columns via a Vietnamese
  diacritics-insensitive header matcher (`Mã số`→`case_code`, `Họ tên`→`patient_name`,
  etc.), returns the mapping + row count, **no DB writes**.
- `POST /migration/import` (multipart CSV, `anonymize: bool` query param) — actually
  inserts `cases` (+ one default `slides` row each) with `source='legacy_import'`; drops
  `patient_name` when `anonymize=true`. Per-row failures (e.g. duplicate
  `case_code`+`case_year`) are isolated with a SQL `SAVEPOINT`
  (`db.begin_nested()`) so one bad row doesn't roll back the whole import batch. Writes
  one `audit_logs` row summarizing the import.
  **This does not connect to the real legacy desktop database** — no access/engine info
  was available yet (PRD §8.3 flags this as an open question). Admin uploads a CSV
  exported from the old system instead; swap in a real connector later once the legacy
  engine (SQL Server Compact/SQLite/Access?) is confirmed.

### Case/Slide/Image API

`/api/cases/*` and `/api/images/*` — any authenticated user, not admin-only (PRD §6's
flat 2-role model has no per-doctor case ownership).

- `GET /api/cases`, `POST /api/cases`, `GET /api/cases/{id}`, `PATCH /api/cases/{id}` —
  standard CRUD; `POST`/`PATCH` reject a duplicate `case_code`+`case_year` with `409`.
- `POST /api/cases/{id}/slides` — adds a slide, auto-numbered (`max+1`), capped at 12/case
  (PRD §8.3).
- `POST /api/cases/slides/{slide_id}/images` — multipart image upload (`file` +
  optional `description` + `source` form fields). Capped at 8 images/slide (PRD §8.4)
  and at `MAX_UPLOAD_BYTES` (200MB — microscope TIFFs can legitimately be several dozen
  MB, see below) with a `413`; rejects anything Pillow can't decode as JPEG/PNG/TIFF with
  `400`.
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
- **Color normalization**: Macenko stain normalization (Macenko et al. 2009) against a
  fixed reference stain vector, implemented directly with numpy/OpenCV rather than
  pulling in `histolab` (its `openslide-python` dependency needs the native OpenSlide
  binary, which is painful to install on plain Windows/pip — OpenCV is the PRD's own
  listed alternative). Saved as `{uuid}_normalized.jpg`. **Best-effort**: wrapped in
  try/except on both the Macenko step itself (can raise on degenerate/near-blank images
  with too few tissue pixels — verified with an all-white test image: falls back to
  `normalized_image_path: null` instead of failing) and the preprocessing step as a
  whole (an upload must never fail because preprocessing hiccuped — the image itself was
  already validated and stored by Pillow before preprocessing even starts).
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
  **`cancer_area_percentage` is not settable via this endpoint** — PRD §8.6 defines it
  as computed from segmentation mask/tissue area (an AI output), so fabricating a number
  by hand here would be exactly the kind of overclaim the design system's voice rules
  forbid elsewhere (e.g. `CaseDetail`'s "Chưa có kết quả AI" badge). It stays `null`
  until the real segmentation pipeline exists.
  Returns `423 Locked` if the review is already `status='confirmed'`.
- `POST .../confirm` sets `status='confirmed'` + `confirmed_at` + `reviewed_by` (soft
  lock, no real legal e-signature — PRD §8.6). `409` if already confirmed, `404` if no
  draft exists yet.
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
pyramid tiled via OpenSeadragon/OpenSlide. That's oversized for our single-frame captures
(tens of MB, not gigapixel whole-slide scans — real WSI scanning is PRD §12 future work),
so the right-sized version of the same idea is implemented instead:
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
  depends on (a correction from an earlier high-level sketch of this pipeline).
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
  the notebooks used via `albumentations`. `classification_results.heatmap_file_path` is
  a **v1 confidence heatmap** (color intensity by predicted-class confidence per patch),
  not real Grad-CAM/Attention-Rollout yet — that's a v2 follow-up (see Next steps),
  porting the notebooks' per-architecture hooks into a production path is real extra work.

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
- `GET /api/inference-runs/{run_id}/mask`, `.../heatmap` — auth-gated PNG serving, same
  blob-response pattern as `GET /api/images/{id}/file`.
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
  stores the JWT in `localStorage` (`prostaai_token`) and re-hydrates the session via
  `/me` on page load. There is **no role picker anymore** — the account's role decides
  doctor vs admin nav.
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
- **Known gap**: `POST/PATCH /api/admin/users` don't write `audit_logs` entries (only
  `/migration/import` does), so creating/toggling a user won't show up on the Log screen —
  not in the original backend plan, worth adding if the Log screen is meant to be a
  complete activity trail.

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
  this app) instead of `App.tsx` mutating a local array; the fake "Slide 1,2 / Slide 3,4…"
  pair-picker from the mockup is gone (it never mapped to anything real) — slides are
  added from `CaseDetail` after the case exists.
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
- **Known gap, not fixed this pass**: `DiagnosticReviewUpdate` has no
  `cancer_area_percentage` field (confirmed in `reviews.py` — it was always meant to come
  from the AI segmentation output, never hand-set), and no code anywhere copies
  `segmentation_results.cancer_area_percentage` into the review row when it's created. So
  `Viewer`'s read-only AI panel shows the real number (straight from
  `GET .../inference`'s `segmentation.cancer_area_percentage`), but `Report` — which reads
  from the *review* row — shows "Chưa có diện tích ung thư" even for a confirmed review of
  a completed run. Not a frontend bug, just an honest reflection of a real backend gap;
  fixing it means either adding that field to `DiagnosticReviewUpdate`+the PATCH handler,
  or having `Report` also fetch the inference run the way `Viewer` already does.
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

```bash
cd frontend
npm install
npm run dev
```

Needs `backend` running on `http://localhost:8000` (see above) for the Admin screens and
login to work — `frontend/.env` (`VITE_API_BASE_URL`) points at it, copy from
`.env.example` if missing. `npx tsc --noEmit -p tsconfig.app.json` for a standalone
typecheck. There is a `.claude/launch.json` entry (`frontend`) for the Claude Code
browser preview tool.

## Next steps (not yet done)

Roughly in the order they unblock each other:

1. ~~Drop real `.pt` checkpoints~~ — **done (2026-08-04)**: 4 classification + 3
   segmentation checkpoints in `backend/models/`, first full pipeline run verified
   `completed` end-to-end (see [AI inference pipeline](#ai-inference-pipeline-backendappinference)).
2. ~~Wire `Pipeline.tsx`/`Viewer.tsx` to the real endpoints~~ — **done (2026-08-04)**,
   `Report.tsx` too. See [Frontend↔backend integration](#frontendbackend-integration)'s
   Pipeline/Viewer/Report subsection for the nav restructuring (image-scoped, not
   case-scoped) and full verification. Known small gap left from this pass: `Report`
   shows "Chưa có diện tích ung thư" even for a confirmed review, because
   `cancer_area_percentage` is never copied from `segmentation_results` into
   `diagnostic_reviews` — `Viewer` shows the real number since it reads the inference run
   directly.
3. ~~Model-selector UI~~ — **done (2026-08-04)**: `Pipeline.tsx` now shows a picker (2
   `Select`s, real architecture names + metric hints, filtered to `checkpoint_available:
   true`) before triggering any new run, backed by a new non-admin `GET /api/models`
   endpoint (`GET /api/admin/models` was `require_admin`-gated — doctors couldn't call it).
   Also fixed a real retry bug caught along the way: "Thử lại" after a failed run never
   actually re-triggered anything before this pass. See
   [Frontend↔backend integration](#frontendbackend-integration)'s Pipeline/Viewer/Report
   subsection for the full writeup and verification.
4. Pull the real µm/pixel value from a sample PANDA WSI file's metadata (`openslide.mpp-x`/
   `mpp-y` or equivalent), add the "độ phóng đại" field to Upload/live-capture (PRD §8.4)
   so 4x/10x microscope captures can be rescaled to match the 40x≈Level-0 training scale
   instead of guessed.
5. **v2 heatmap**: real Grad-CAM (3 CNN architectures) / Attention Rollout (ViT), replacing
   the v1 per-patch confidence heatmap currently in `pipeline.py`.
6. `ai_models_config.py` — done (2026-08-04). **Still pending, needs the user's
   confirmation to proceed**: rewrite `docs/PRD.md`'s SICAPv2/ResNeXt50/binary-mask
   wording — larger than first scoped, spans ~8 sections (§0, §3, §4, §8.3, §8.5, §9.3,
   §10, §11, §13) of the thesis's own requirements doc, not a quick config-file fix.
7. Docker/`docker-compose` — deferred when the directory reorg was done (PRD marks it
   optional); revisit once the AI pipeline is stable.
8. Verify the live camera capture path (`Upload.tsx`) on a real machine with a microscope
   camera attached — this dev sandbox has none, so only the permission/no-device fallback
   paths could be exercised here.
9. Real legacy-database connector once the engine/access is confirmed (see the
   `/migration/*` CSV-based stand-in in [Backend architecture](#backend-architecture) —
   anonymization is already enforced there and must stay a hard requirement).
10. Decide whether to introduce `react-router` once real navigation (deep links, browser
    back/forward) is needed — not required for the current single-session demo.
11. Report export (PRD §8.8) — explicitly declined by the user for now; `Report.tsx` now
    renders real confirmed review data (2026-08-04) and has a working "In" (browser print);
    a generated PDF/HTML artifact is still not built, revisit only if the thesis write-up
    needs one rather than screenshots/browser-print of the real screen.
