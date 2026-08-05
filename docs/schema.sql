-- ============================================================================
-- ProstaAI — Database Schema (SQLite)
-- Thiết kế dựa trên PRD_ProstaAI_v3_Thesis.md
-- Phân cấp dữ liệu chính: Ca bệnh (Case) -> Slide -> Ảnh (Image) -> Kết quả AI
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. USERS  (PRD 8.1 Authentication, 8.6 role duyệt kết quả)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,                 -- BCrypt hash
    full_name       TEXT,
    role            TEXT NOT NULL DEFAULT 'user'
                        CHECK (role IN ('user', 'admin')),
    is_active       INTEGER NOT NULL DEFAULT 1,    -- 0/1 boolean
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 2. CASES  (PRD 8.3 Case Management — tương đương FrmCase / FrmCaseList)
-- ----------------------------------------------------------------------------
CREATE TABLE cases (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    case_code           TEXT NOT NULL,              -- "Mã số", vd 111-YCT25
    case_year           TEXT,                        -- "Mã năm"
    patient_name        TEXT,                        -- "Họ tên bệnh nhân" — NULL nếu đã ẩn danh hóa
    patient_age         INTEGER,                      -- "Tuổi"
    conclusion           TEXT,                         -- "Kết luận" — text tự do kế thừa từ hệ thống cũ

    -- Các trường chẩn đoán có cấu trúc (bổ sung mới, không có ở hệ thống cũ)
    -- được tách riêng sang bảng diagnostic_reviews (mục 6) để 1 ca có thể
    -- có nhiều lượt xem/chỉnh sửa mà không đè lên kết luận gốc.

    is_anonymized       INTEGER NOT NULL DEFAULT 0,   -- 0/1 — đã ẩn danh hóa patient_name chưa
    source               TEXT NOT NULL DEFAULT 'new'
                            CHECK (source IN ('new', 'legacy_import')),
    legacy_case_id       TEXT,                         -- ID gốc bên app desktop, phục vụ truy vết di trú dữ liệu

    created_by           INTEGER REFERENCES users(id),
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_cases_code_year ON cases(case_code, case_year);
CREATE INDEX idx_cases_legacy_id ON cases(legacy_case_id);

-- ----------------------------------------------------------------------------
-- 3. SLIDES  (mỗi Ca bệnh có nhiều Slide — hệ thống cũ giới hạn 12, nhóm cặp)
-- ----------------------------------------------------------------------------
CREATE TABLE slides (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id             INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    slide_number         INTEGER NOT NULL,            -- 1..12 (mặc định kế thừa từ hệ thống cũ)
    legacy_slide_label   TEXT,                          -- vd "Slide 1,2" — nhãn gốc bên app desktop, tùy chọn
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (case_id, slide_number)
);

CREATE INDEX idx_slides_case ON slides(case_id);

-- ----------------------------------------------------------------------------
-- 4. IMAGES  (PRD 8.4 — mỗi Slide có tối đa 8 ảnh, tương đương FrmCapture)
-- ----------------------------------------------------------------------------
CREATE TABLE images (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    slide_id             INTEGER NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
    image_number          INTEGER NOT NULL,            -- 1..8 ("Hình 1".."Hình 8")
    file_path             TEXT NOT NULL,                 -- đường dẫn lưu trữ (local filesystem trong MVP)
    description            TEXT,                          -- "Mô tả" nhập khi chụp/tải ảnh
    width_px               INTEGER,
    height_px              INTEGER,
    format                 TEXT,                          -- jpg / png / tiff

    captured_at            TEXT,                          -- thời điểm chụp (nếu có, từ metadata gốc)
    uploaded_by             INTEGER REFERENCES users(id),
    source                  TEXT NOT NULL DEFAULT 'upload'
                                CHECK (source IN ('upload', 'live_capture', 'legacy_import')),
    legacy_image_id          TEXT,                          -- truy vết ảnh gốc từ hệ thống desktop
    magnification            TEXT                            -- độ phóng đại lúc chụp, vd hệ cũ (SlideDoPhongDai)
                                CHECK (magnification IN ('4x', '10x', '20x', '40x')),

    created_at              TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (slide_id, image_number)
);

CREATE INDEX idx_images_slide ON images(slide_id);

-- ----------------------------------------------------------------------------
-- 5. PREPROCESSING  (PRD 8.4 — color normalization, tissue detection, quality)
-- ----------------------------------------------------------------------------
CREATE TABLE preprocessing_results (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id              INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,

    normalized_image_path  TEXT,                         -- ảnh sau color normalization (Macenko/Reinhard)
    tissue_mask_path        TEXT,                          -- mask vùng mô (tissue detection)
    is_blurry                INTEGER NOT NULL DEFAULT 0,    -- 0/1, kiểm tra chất lượng cơ bản (Laplacian variance)
    quality_score             REAL,

    processed_at              TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (image_id)  -- mỗi ảnh chỉ có 1 bản ghi tiền xử lý mới nhất trong MVP
);

-- ----------------------------------------------------------------------------
-- 6. AI INFERENCE RUNS  (PRD 8.5 — pipeline 7 bước, trạng thái xử lý)
-- ----------------------------------------------------------------------------
CREATE TABLE inference_runs (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id                   INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,

    status                       TEXT NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    segmentation_model_version    TEXT,                     -- vd "resnext50_seg_v1"
    classification_model_version   TEXT,

    error_message                   TEXT,                     -- ghi lại lỗi nếu status = 'failed'
    triggered_by                     INTEGER REFERENCES users(id),

    started_at                        TEXT,
    completed_at                       TEXT,
    created_at                          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_runs_image ON inference_runs(image_id);
CREATE INDEX idx_runs_status ON inference_runs(status);

-- ----------------------------------------------------------------------------
-- 7. SEGMENTATION RESULTS  (output bước 4 của pipeline)
-- ----------------------------------------------------------------------------
CREATE TABLE segmentation_results (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id                    INTEGER NOT NULL REFERENCES inference_runs(id) ON DELETE CASCADE,

    mask_file_path             TEXT NOT NULL,             -- mask nhị phân vùng nghi ngờ ung thư
    cancer_area_px               INTEGER,
    total_tissue_area_px          INTEGER,
    cancer_area_percentage         REAL,                    -- = cancer_area_px / total_tissue_area_px

    created_at                      TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (run_id)
);

-- ----------------------------------------------------------------------------
-- 8. CLASSIFICATION RESULTS  (output bước 5 của pipeline)
-- ----------------------------------------------------------------------------
CREATE TABLE classification_results (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id                  INTEGER NOT NULL REFERENCES inference_runs(id) ON DELETE CASCADE,

    primary_pattern           INTEGER CHECK (primary_pattern IN (3, 4, 5)),
    primary_confidence          REAL,                       -- 0..1
    secondary_pattern             INTEGER CHECK (secondary_pattern IN (3, 4, 5)),
    secondary_confidence            REAL,

    heatmap_file_path                 TEXT,                   -- overlay heatmap Gleason Pattern

    created_at                          TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (run_id)
);

-- ----------------------------------------------------------------------------
-- 9. DIAGNOSTIC REVIEWS  (PRD 8.6 — bác sĩ xem/sửa kết quả AI + trường nhập tay)
-- ----------------------------------------------------------------------------
CREATE TABLE diagnostic_reviews (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id               INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    run_id                   INTEGER REFERENCES inference_runs(id),   -- NULL nếu nhập tay hoàn toàn

    -- Kế thừa/hiệu chỉnh từ AI (cho phép bác sĩ sửa lại)
    primary_pattern             INTEGER CHECK (primary_pattern IN (3, 4, 5)),
    secondary_pattern              INTEGER CHECK (secondary_pattern IN (3, 4, 5)),
    total_score                      INTEGER,                          -- primary + secondary
    grade_group                        INTEGER CHECK (grade_group BETWEEN 1 AND 5),  -- tính theo bảng ISUP
    cancer_area_percentage               REAL,

    -- Trường nhập tay — KHÔNG phải output AI (xem PRD 8.5 lưu ý PNI/LVI)
    biopsy_location                        TEXT,
    pni_present                              INTEGER DEFAULT 0,        -- 0/1
    pni_notes                                  TEXT,
    lvi_present                                  INTEGER DEFAULT 0,
    lvi_notes                                      TEXT,
    free_notes                                       TEXT,

    status                                             TEXT NOT NULL DEFAULT 'draft'
                                                            CHECK (status IN ('draft', 'confirmed')),
    reviewed_by                                          INTEGER REFERENCES users(id),
    confirmed_at                                           TEXT,        -- thời điểm "Xác nhận kết quả" (khóa bản ghi)

    created_at                                               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                                                 TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_reviews_image ON diagnostic_reviews(image_id);

-- ----------------------------------------------------------------------------
-- 10. REPORTS  (PRD 8.8 — xuất PDF/HTML)
-- ----------------------------------------------------------------------------
CREATE TABLE reports (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id            INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    file_path           TEXT NOT NULL,
    generated_by         INTEGER REFERENCES users(id),
    generated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_reports_case ON reports(case_id);

-- ----------------------------------------------------------------------------
-- 11. AUDIT LOG  (PRD 8.9 — lịch sử/truy vết cơ bản)
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER REFERENCES users(id),
    action          TEXT NOT NULL,          -- vd "create_case", "run_inference", "confirm_review"
    entity_type      TEXT NOT NULL,          -- vd "case", "image", "diagnostic_review"
    entity_id          INTEGER,
    details              TEXT,                -- JSON string tự do, tùy chọn
    created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);

-- ----------------------------------------------------------------------------
-- 12. MANUAL ANNOTATIONS  (doctor-drawn freehand regions, independent of AI —
--     no run_id/FK to inference_runs anywhere on this table by design)
-- ----------------------------------------------------------------------------
CREATE TABLE manual_annotations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id           INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,

    points              TEXT NOT NULL,     -- JSON array of {x,y} polygon vertices, 0-100 (% of image)
    gleason_pattern       INTEGER CHECK (gleason_pattern IN (3, 4, 5)),  -- optional, doctor-assigned
    note                    TEXT,

    created_by                INTEGER REFERENCES users(id),
    created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_annotations_image ON manual_annotations(image_id);
