# ProstaAI — CLAUDE.md

Thesis project (Vietnamese CS/IT graduation thesis): an AI-assisted web prototype for
Gleason grading of prostate biopsy images (H&E). **Research/decision-support prototype
only — not a certified medical device.** Full requirements: [docs/PRD.md](docs/PRD.md)
("PRD_ProstaAI_v3_Thesis_2.md", v3 — thesis-scoped; §12 is future/production vision, not
in scope).

## Current status

- ✅ **Frontend** (`frontend/`): fully scaffolded, ported screen-for-screen from a Claude
  Design mockup (see [Design source](#design-source) below). **Admin screens and
  Cases/CaseDetail/CaseForm/Upload are wired to the real backend** (see below);
  **Pipeline/Viewer/Report still run on mock AI data** since there's no AI pipeline yet.
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
- 🟡 **AI inference pipeline** (`backend/app/inference/`): **scaffolding built, no
  checkpoints yet** — `POST /api/images/{id}/inference` runs the real tile→segment→
  classify→aggregate pipeline (CPU PyTorch) against whatever `.pt` files exist under
  `backend/models/{segmentation,classification}/`, and **fails a run cleanly with a
  Vietnamese error message** (not a crash/hang) when a checkpoint is missing — verified
  end-to-end with real curl calls against an empty `backend/models/` (today's actual
  state). See [AI inference pipeline](#ai-inference-pipeline-backendappinference) below.
  `Pipeline.tsx`/`Viewer.tsx` are **not wired yet** — still mock, see roadmap.
- ✅ **Frontend ↔ backend wiring**: Admin (all 6 screens), Cases/CaseDetail/CaseForm/
  Upload, and Annotate verified end-to-end through the actual UI (not just curl) — see
  [Frontend↔backend integration](#frontendbackend-integration). `Pipeline`/`Viewer`/
  `Report` still render off mock Gleason/region data regardless of whether the case
  itself is real or mock — wiring these to the new inference endpoints is next.

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

When building the backend, match these table/column names — the frontend mock data
(`frontend/src/data/mock.ts`) already comments each field with its `schema.sql`
counterpart (e.g. `hoTen` ↔ `cases.patient_name`).

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
`docs/PRD.md` and `backend/app/ai_models_config.py`** — see the correction note at the end
of this section.

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

- **4 architectures** (via `segmentation_models_pytorch`): U-Net (DenseNet121 encoder),
  U-Net (EfficientNet_b0), DeepLabV3 (EfficientNet_b0), **DeepLabV3+ (EfficientNet_b0)**
  — best of the 4 per the paper.
- **Input**: 500×500 → **256×256** (different resize target than classification's 224 —
  keep this straight when building a shared patch-preprocessing step later). Image resize
  bilinear, **mask resize nearest-neighbor** (mandatory — bilinear would invent
  intermediate class values on a discrete label map).
- **Output: 6-class semantic segmentation** (background/stroma/benign/G3/G4/G5) — **not**
  a binary cancer-vs-not mask, correcting the "binary cancer-region mask" wording in
  `docs/PRD.md` §8.5 and `backend/app/ai_models_config.py`. Segmentation trains on **every**
  patch that has a mask (no label-confidence filtering, since it's pixel-wise, not
  patch-wise like classification).
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

- **Which of the 4 trained architectures per task goes to production**: the user will
  decide based on **actual results from their own training runs**, not necessarily the
  paper's winner. Two deployment shapes are both acceptable and under consideration: (a)
  deploy only the single best-performing checkpoint per task, or (b) deploy **all 4**
  checkpoints per task and let the web UI pick which architecture to run per case. Nothing
  in the schema blocks either — `inference_runs.segmentation_model_version`/
  `classification_model_version` are free-text columns, not FKs to a fixed enum, so a
  multi-model selector is a frontend/router concern, not a schema change.
- **Checkpoint files**: the user will add the trained `.pt` files into a models directory
  under `backend/`. Proposed convention (mirrors the Drive layout the notebooks already
  use, so files can be copied over unchanged): `backend/models/classification/
  {model_name}_best.pt` and `backend/models/segmentation/{model_name}_best.pt`. Not
  created yet — add to `.gitignore` once it exists (large binaries, same treatment as
  `backend/uploads/`).
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
- `backend/app/ai_models_config.py` (single "ResNeXt50_32x4d, binary mask" placeholder)
  and `docs/PRD.md` §8.5/§10 (same stale SICAPv2/ResNeXt50 wording) still need updating
  once the final architecture-per-task (or multi-model list) is locked in — not done as
  part of this pass since it's user-facing static content, not just internal docs.

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
  data/mock.ts             Static CASES/REGIONS/PIPELINE + grade() (ISUP calc) — doctor screens only
                           now; the old USERS/LOG/MODELS mock data was removed once Admin went live
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
  components/Histology.tsx Generated placeholder "H&E tissue" background + clickable AI regions; Disclaimer
  components/ImageThumb.tsx Real uploaded-image thumbnail: fetches /api/images/{id}/file as
                            an authed blob (an <img src> can't carry a bearer token) ->
                            object URL; used by CaseDetail and Upload's image grid
  pages/                   One file per screen (14 total, see below)
  App.tsx                  Owns session (JWT + /me), the real `cases` fetch + reload, and
                           nav state; renders sidebar+topbar shell + active page
```

### Screens (`pages/`)

Doctor, **real backend**: `Cases` (list/search/filter), `CaseDetail` (slides/images, add
slide, real thumbnails), `CaseForm` (create/edit). `Upload` — case/slide picker + real
file upload (JPG/PNG/TIFF) **and live microscope-camera capture** (`getUserMedia` +
canvas frame grab), both hitting the same image-upload endpoint with different `source`.
`Annotate` — freehand polygon marking directly on a real image, independent of any AI
pipeline (see **Manual annotation** in [Backend architecture](#backend-architecture));
reached via `CaseDetail`'s per-image "Đánh dấu" button.
Doctor, **still mock**: `DoctorDashboard` (stat tiles are static; the case list itself is
real via the shared `cases` prop), `Pipeline` (7-step animated status — no real inference
call), `Viewer` (layer toggle, region click, side-by-side, zoom, manual PNI/LVI + notes,
lock), `Report` (printable result sheet) — all three render off `case.gleason/primary/
secondary/...`, which are always `null` for real cases (no AI ran), so they show
"Lành tính"/empty state for any case created through the real flow. This is a known,
pre-existing rough edge (the mockup's Pipeline was always a fake timer, never wrote AI
fields even for its own mock cases) inherited as-is — fixing it means building the real
AI pipeline, not patching these three pages. `CaseDetail` avoids the same trap: it shows
a neutral "Chưa có kết quả AI" badge instead of defaulting to a fake Pattern-3 chip.
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
    ai_models_config.py            Static metadata for the 2 trained models — NOT a DB
                                    table; still describes the OLD stale SICAPv2/ResNeXt50
                                    placeholder, not yet updated (see AI inference section)
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
  present — the exact same ISUP formula as `frontend/src/data/mock.ts`'s `grade()`,
  reimplemented in Python (`_grade_group()` in `reviews.py`) so the backend is the
  source of truth once this is wired to the frontend.
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
- `GET /api/admin/models` now also reports `checkpoint_available: bool` per entry (checks
  `registry.list_available()`) — honest today: both entries show `false` since
  `backend/models/` is empty. Note the static 2-entry list (`ai_models_config.py`) is
  task-level, not per-architecture, so this reflects "is *any* of the 4 real architectures
  for this task available", not a 1:1 match to the (still stale) static entry itself.

**Explicitly out of scope for this pass**: `Pipeline.tsx`/`Viewer.tsx` frontend wiring —
verification was curl-only. See Next steps for the wiring order.

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

1. **Drop real `.pt` checkpoints** into `backend/models/classification/` and
   `backend/models/segmentation/` (filenames must be `{arch_name}_best.pt`, matching the
   architecture names in [AI models](#ai-models--training-methodology-colab-notebooks) —
   e.g. `efficientnet_b0_best.pt`, `deeplabv3plus_efficientnet_b0_best.pt`). The pipeline
   scaffolding (`backend/app/inference/`, see
   [AI inference pipeline](#ai-inference-pipeline-backendappinference)) goes from "every
   run fails with a clear missing-checkpoint message" to actually running with zero code
   changes — this is the one item that unblocks everything else below.
2. **Wire `Pipeline.tsx`/`Viewer.tsx` to the real endpoints** (`GET /api/images/{id}
   /inference` for status polling, replacing the fake `setInterval` timer;
   `GET /api/inference-runs/{id}/mask`/`.../heatmap` for real overlay images, replacing
   the `REGIONS` mock) — `reviews.py` for Viewer's manual PNI/LVI fields is already usable
   today, just not pointed at by the frontend yet. Same `lib/api.ts` + `useApiData`
   pattern already used everywhere else.
3. **Model-selector UI** (Upload or Pipeline screen) once ≥2 checkpoints per task exist —
   reads `GET /api/admin/models`'s `checkpoint_available` / a future
   `registry.list_available()`-backed endpoint, lets the doctor pick an architecture per
   run instead of always defaulting to the first one found.
4. Pull the real µm/pixel value from a sample PANDA WSI file's metadata (`openslide.mpp-x`/
   `mpp-y` or equivalent), add the "độ phóng đại" field to Upload/live-capture (PRD §8.4)
   so 4x/10x microscope captures can be rescaled to match the 40x≈Level-0 training scale
   instead of guessed.
5. **v2 heatmap**: real Grad-CAM (3 CNN architectures) / Attention Rollout (ViT), replacing
   the v1 per-patch confidence heatmap currently in `pipeline.py`.
6. Update `backend/app/ai_models_config.py` and `docs/PRD.md` §8.5/§10's stale
   SICAPv2/ResNeXt50/binary-mask wording once a final architecture (or list, if deploying
   all 4) is locked in.
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
11. Report export (PRD §8.8) — explicitly declined by the user for now; revisit if the
    thesis write-up ends up needing a generated artifact rather than screenshots of the
    (still-mock) `Report.tsx` screen.
