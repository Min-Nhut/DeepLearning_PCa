# Đặc tả thiết kế hệ thống ProstaAI

Tài liệu đi kèm sáu sơ đồ trong [`SO_DO_THIET_KE.md`](SO_DO_THIET_KE.md). Mỗi mục dưới đây
đặc tả cho một sơ đồ; sơ đồ use case có tài liệu riêng, chi tiết hơn, tại
[`DAC_TA_USECASE.md`](DAC_TA_USECASE.md).

| Mục | Đặc tả cho sơ đồ | Cách lập |
|---|---|---|
| 1 | Quan hệ thực thể (ERD) | Sinh tự động từ cơ sở dữ liệu đang chạy |
| 2 | Phân quyền và tách cổng | Sinh tự động từ bảng định tuyến FastAPI |
| 3 | Kiến trúc ba tầng | Viết tay, đối chiếu mã nguồn |
| 4 | Luồng nghiệp vụ | Viết tay, đối chiếu mã nguồn |
| 5 | Biểu đồ tuần tự | Viết tay, đối chiếu mã nguồn |

Mục 1 và 2 dựng lại được bất cứ lúc nào:

```bash
cd backend && .venv/Scripts/python.exe ../docs/diagrams/gen_spec.py
```

---

## 1. Đặc tả cơ sở dữ liệu

Sinh trực tiếp từ `database/prostaai.db` bằng `docs/diagrams/gen_spec.py`, nên danh sách
cột và ràng buộc không thể lệch khỏi lược đồ đang chạy.

### 1.1. Tổng quan các bảng

| # | Bảng | Số cột | Mục đích |
|---|---|---|---|
| 1 | `users` | 7 | Tài khoản đăng nhập. Hai vai trò: bác sĩ (user) và quản trị viên (admin). |
| 2 | `cases` | 12 | Ca bệnh — đơn vị được ký trên phiếu kết quả theo phác đồ CAP. |
| 3 | `slides` | 5 | Lam kính thuộc một ca. Tối đa 12 slide mỗi ca. |
| 4 | `images` | 14 | Ảnh vi trường chụp từ một slide. Tối đa 8 ảnh mỗi slide. |
| 5 | `preprocessing_results` | 7 | Kết quả tiền xử lý tự động, sinh ngay khi ảnh được tải lên. |
| 6 | `inference_runs` | 10 | Một lần chạy quy trình AI trên một ảnh. |
| 7 | `segmentation_results` | 7 | Đầu ra giai đoạn 1 — mặt nạ phân đoạn và diện tích theo lớp. |
| 8 | `classification_results` | 8 | Đầu ra giai đoạn 2 — cặp mẫu Gleason trội/phụ ở mức ảnh. |
| 9 | `stage3_results` | 6 | Đầu ra giai đoạn 3 — nhóm ISUP do mô hình hợp nhất suy ra. |
| 10 | `diagnostic_reviews` | 22 | Kết luận của bác sĩ. Bản sao có thể sửa, tách hẳn khỏi đầu ra AI. |
| 11 | `manual_annotations` | 8 | Vùng khoanh thủ công trên ảnh, độc lập với AI. |
| 12 | `reports` | 5 | Lịch sử phiếu kết quả đã kết xuất. Chưa dùng trong phạm vi đề tài. |
| 13 | `audit_logs` | 7 | Nhật ký mọi thao tác làm thay đổi dữ liệu. |
| 14 | `magnification_calibration` | 4 | Số µm ứng với một điểm ảnh, đo bằng thước hiệu chuẩn cho từng vật kính. |

### 1.2. Từ điển dữ liệu

#### `users` — Tài khoản đăng nhập. Hai vai trò: bác sĩ (user) và quản trị viên (admin).

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `username` | TEXT | NOT NULL | Tên đăng nhập, duy nhất. Trùng dạng địa chỉ thư điện tử nhưng không phải cột email. |
| `password_hash` | TEXT | NOT NULL | Mật khẩu đã băm bằng bcrypt. Không bao giờ lưu dạng thô. |
| `full_name` | TEXT | — | Họ tên hiển thị; dùng làm tên người ký trên phiếu kết quả. |
| `role` | TEXT | NOT NULL, mặc định `'user'` | Vai trò: user (bác sĩ) hoặc admin. |
| `is_active` | INTEGER | NOT NULL, mặc định `1` | Tài khoản bị khóa vẫn đăng nhập thất bại dù mật khẩu đúng. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm tạo tài khoản. |

#### `cases` — Ca bệnh — đơn vị được ký trên phiếu kết quả theo phác đồ CAP.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `case_code` | TEXT | NOT NULL | Mã số ca theo cách đánh của cơ sở y tế. |
| `case_year` | TEXT | — | Mã năm. Cùng với mã số tạo thành cặp duy nhất. |
| `patient_name` | TEXT | — | Họ tên bệnh nhân. Bị loại bỏ khi nhập dữ liệu ở chế độ ẩn danh. |
| `patient_age` | INTEGER | — | Tuổi bệnh nhân. |
| `conclusion` | TEXT | — | Kết luận dạng văn bản tự do ở mức ca. |
| `is_anonymized` | INTEGER | NOT NULL, mặc định `0` | Đánh dấu ca đã ẩn danh, quyết định việc dùng dữ liệu định danh. |
| `source` | TEXT | NOT NULL, mặc định `'new'` | Nguồn: new (tạo mới) hoặc legacy_import (nhập từ phần mềm cũ). |
| `legacy_case_id` | TEXT | — | Mã ca trong phần mềm cũ, giữ lại để đối chiếu. |
| `created_by` | INTEGER | FK → `users.id` | Người tạo ca. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm tạo. |
| `updated_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm sửa gần nhất. |

#### `slides` — Lam kính thuộc một ca. Tối đa 12 slide mỗi ca.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `case_id` | INTEGER | FK → `cases.id`, NOT NULL | Ca bệnh chứa slide này. |
| `slide_number` | INTEGER | NOT NULL | Số thứ tự trong ca. Duy nhất theo từng ca. Xóa slide để lại khoảng trống, không đánh số lại. |
| `legacy_slide_label` | TEXT | — | Nhãn thật của lam kính, ví dụ “Slide 3-4”. Nhãn gắn với miếng kính nên không đổi khi sắp xếp lại thứ tự. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm tạo. |

#### `images` — Ảnh vi trường chụp từ một slide. Tối đa 8 ảnh mỗi slide.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `slide_id` | INTEGER | FK → `slides.id`, NOT NULL | Slide chứa ảnh này. |
| `image_number` | INTEGER | NOT NULL | Số thứ tự trong slide. Duy nhất theo từng slide. |
| `file_path` | TEXT | NOT NULL | Đường dẫn tệp gốc trên máy chủ. Không bao giờ trả ra ngoài qua API. |
| `description` | TEXT | — | Mô tả tự do. Với dữ liệu nhập từ phần mềm cũ, đây là nhãn Gleason viết tay. |
| `width_px` | INTEGER | — | Chiều rộng thật của ảnh gốc, dùng cho phép đo khoảng cách. |
| `height_px` | INTEGER | — | Chiều cao thật của ảnh gốc. |
| `format` | TEXT | — | Định dạng do Pillow giải mã ra, không tin theo phần mở rộng tên tệp. |
| `captured_at` | TEXT | — | Thời điểm chụp, nếu biết. |
| `uploaded_by` | INTEGER | FK → `users.id` | Người tải lên hoặc chụp. |
| `source` | TEXT | NOT NULL, mặc định `'upload'` | upload (chọn tệp), live_capture (chụp qua camera), legacy_import. |
| `legacy_image_id` | TEXT | — | Mã ảnh trong phần mềm cũ. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm ghi nhận. |
| `magnification` | TEXT | — | Vật kính lúc chụp: 4x, 10x, 20x hoặc 40x. Là khóa tra bảng hiệu chỉnh µm/pixel. |

#### `preprocessing_results` — Kết quả tiền xử lý tự động, sinh ngay khi ảnh được tải lên.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `image_id` | INTEGER | FK → `images.id`, NOT NULL | Ảnh tương ứng. Quan hệ một–một. |
| `normalized_image_path` | TEXT | — | Ảnh đã chuẩn hóa màu, chỉ dùng để kiểm tra chất lượng. |
| `tissue_mask_path` | TEXT | — | Mặt nạ vùng mô tách bằng ngưỡng Otsu trên kênh bão hòa. |
| `is_blurry` | INTEGER | NOT NULL, mặc định `0` | Cờ ảnh mờ; hiển thị cảnh báo trước khi bác sĩ chạy AI. |
| `quality_score` | REAL | — | Phương sai Laplacian. Ngưỡng phân loại mờ là heuristic, chưa hiệu chỉnh lâm sàng. |
| `processed_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm xử lý. |

#### `inference_runs` — Một lần chạy quy trình AI trên một ảnh.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `image_id` | INTEGER | FK → `images.id`, NOT NULL | Ảnh được phân tích. |
| `status` | TEXT | NOT NULL, mặc định `'pending'` | pending (chờ chỗ chạy) → running → completed hoặc failed. |
| `segmentation_model_version` | TEXT | — | Kiến trúc phân đoạn đã dùng, để mọi kết quả truy vết được về đúng mô hình. |
| `classification_model_version` | TEXT | — | Kiến trúc phân loại đã dùng. |
| `error_message` | TEXT | — | Nguyên nhân thất bại. Lần chạy không bao giờ kẹt ở trạng thái running. |
| `triggered_by` | INTEGER | FK → `users.id` | Người khởi chạy. |
| `started_at` | TEXT | — | Thời điểm thực sự bắt đầu chạy, sau khi được cấp chỗ. |
| `completed_at` | TEXT | — | Thời điểm kết thúc. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm tạo yêu cầu. |

#### `segmentation_results` — Đầu ra giai đoạn 1 — mặt nạ phân đoạn và diện tích theo lớp.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `run_id` | INTEGER | FK → `inference_runs.id`, NOT NULL | Lần chạy tương ứng. Quan hệ một–một. |
| `mask_file_path` | TEXT | NOT NULL | Tệp PNG mặt nạ màu, kích thước đúng bằng ảnh gốc. |
| `cancer_area_px` | INTEGER | — | Số điểm ảnh thuộc Gleason 3, 4 hoặc 5. |
| `total_tissue_area_px` | INTEGER | — | Số điểm ảnh biểu mô (lành tính + ung thư). Không tính nền và mô đệm. |
| `cancer_area_percentage` | REAL | — | Tỉ lệ hai cột trên. Bằng 0 điểm ảnh mô nghĩa là AI không đọc được ảnh, không phải kết luận lành tính. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm ghi. |

#### `classification_results` — Đầu ra giai đoạn 2 — cặp mẫu Gleason trội/phụ ở mức ảnh.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `run_id` | INTEGER | FK → `inference_runs.id`, NOT NULL | Lần chạy tương ứng. Quan hệ một–một. |
| `primary_pattern` | INTEGER | — | Mẫu trội theo diện tích. NULL nghĩa là không gán được mẫu, không phải lành tính. |
| `primary_confidence` | REAL | — | Độ tin cậy mẫu trội, lưu dạng phân số 0–1. |
| `secondary_pattern` | INTEGER | — | Mẫu phụ. Bằng mẫu trội khi chỉ có một mẫu. |
| `secondary_confidence` | REAL | — | Độ tin cậy mẫu phụ. |
| `heatmap_file_path` | TEXT | — | Cột cũ, luôn NULL từ khi bỏ tính năng bản đồ nhiệt. Giữ lại để tránh sửa lược đồ trên cơ sở dữ liệu đang chạy. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm ghi. |

#### `stage3_results` — Đầu ra giai đoạn 3 — nhóm ISUP do mô hình hợp nhất suy ra.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `run_id` | INTEGER | FK → `inference_runs.id`, NOT NULL | Lần chạy tương ứng. Quan hệ một–một. |
| `isup_grade` | INTEGER | — | Nhóm độ ác tính ISUP 0–5 do mô hình hợp nhất suy ra. |
| `confidence` | REAL | — | Xác suất của lớp được chọn. |
| `classification_pct_json` | TEXT | — | Tám đặc trưng đầu vào dạng JSON, lưu để truy vết — mô hình không phải hộp đen. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm ghi. |

#### `diagnostic_reviews` — Kết luận của bác sĩ. Bản sao có thể sửa, tách hẳn khỏi đầu ra AI.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `image_id` | INTEGER | FK → `images.id`, NOT NULL | Ảnh được đánh giá. |
| `run_id` | INTEGER | FK → `inference_runs.id` | Lần chạy AI tham chiếu. Cho phép NULL — bác sĩ chẩn đoán được mà không cần chạy AI. |
| `primary_pattern` | INTEGER | — | Mẫu trội do bác sĩ kết luận. |
| `secondary_pattern` | INTEGER | — | Mẫu phụ do bác sĩ kết luận. |
| `total_score` | INTEGER | — | Tổng điểm Gleason, máy chủ tự tính khi đã có đủ hai mẫu. |
| `grade_group` | INTEGER | — | Nhóm ISUP suy từ cặp mẫu. Vẫn tính và lưu nhưng không hiển thị cho bác sĩ. |
| `cancer_area_percentage` | REAL | — | Chép từ kết quả phân đoạn thật, không phải trường nhập tay. |
| `biopsy_location` | TEXT | — | Vị trí sinh thiết. |
| `pni_present` | INTEGER | mặc định `0` | Xâm lấn quanh thần kinh — bác sĩ tự nhận định, AI không sinh ra. |
| `pni_notes` | TEXT | — | Ghi chú kèm theo. |
| `lvi_present` | INTEGER | mặc định `0` | Xâm lấn mạch bạch huyết — bác sĩ tự nhận định. |
| `lvi_notes` | TEXT | — | Ghi chú kèm theo. |
| `free_notes` | TEXT | — | Ghi chú tự do. |
| `status` | TEXT | NOT NULL, mặc định `'draft'` | draft (còn sửa được) hoặc confirmed (đã khóa). |
| `reviewed_by` | INTEGER | FK → `users.id` | Người xác nhận. Tên được tra ra để in lên phiếu. |
| `confirmed_at` | TEXT | — | Thời điểm xác nhận. Khóa mềm ở mức ứng dụng, không phải chữ ký số. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm tạo bản nháp. |
| `updated_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm sửa gần nhất. |
| `tumor_length_mm` | REAL | — | Chiều dài khối u đo bằng thước, chỉ ghi được khi vật kính đã hiệu chỉnh. |
| `needs_second_opinion` | INTEGER | mặc định `0` | Cờ cần hội chẩn; đưa bản đánh giá vào danh sách chờ chung. |
| `second_opinion_notes` | TEXT | — | Lý do cần hội chẩn. |

#### `manual_annotations` — Vùng khoanh thủ công trên ảnh, độc lập với AI.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `image_id` | INTEGER | FK → `images.id`, NOT NULL | Ảnh chứa vùng khoanh. |
| `points` | TEXT | NOT NULL | Danh sách đỉnh đa giác dạng JSON, tọa độ 0–100 theo phần trăm kích thước ảnh nên đúng ở mọi mức hiển thị. |
| `gleason_pattern` | INTEGER | — | Mẫu Gleason gán cho vùng. NULL nghĩa là lành tính. |
| `note` | TEXT | — | Ghi chú cho vùng. |
| `created_by` | INTEGER | FK → `users.id` | Người vẽ. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm vẽ. Vùng được lưu ngay khi vẽ xong, trước cả khi gán nhãn. |
| `updated_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm sửa gần nhất. |

#### `reports` — Lịch sử phiếu kết quả đã kết xuất. Chưa dùng trong phạm vi đề tài.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `case_id` | INTEGER | FK → `cases.id`, NOT NULL | Ca bệnh của phiếu. |
| `file_path` | TEXT | NOT NULL | Đường dẫn tệp phiếu. |
| `generated_by` | INTEGER | FK → `users.id` | Người kết xuất. |
| `generated_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm kết xuất. |

#### `audit_logs` — Nhật ký mọi thao tác làm thay đổi dữ liệu.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `id` | INTEGER | PK | Khóa chính. |
| `user_id` | INTEGER | FK → `users.id` | Người thực hiện. |
| `action` | TEXT | NOT NULL | Tên hành động, ví dụ create_case, confirm_review, reload_model. |
| `entity_type` | TEXT | NOT NULL | Loại đối tượng bị tác động. |
| `entity_id` | INTEGER | — | Mã đối tượng. |
| `details` | TEXT | — | Mô tả bổ sung. |
| `created_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm ghi, chỉ chính xác tới giây nên khi đọc phải sắp xếp kèm theo id. |

#### `magnification_calibration` — Số µm ứng với một điểm ảnh, đo bằng thước hiệu chuẩn cho từng vật kính.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `magnification` | TEXT | PK | Vật kính, đồng thời là khóa chính. |
| `um_per_pixel` | REAL | NOT NULL | Số µm ứng với một điểm ảnh, đo bằng thước hiệu chuẩn trên kính hiển vi. |
| `updated_by` | INTEGER | FK → `users.id` | Người nhập số đo. |
| `updated_at` | TEXT | NOT NULL, mặc định `datetime('now')` | Thời điểm cập nhật. |

### 1.3. Ràng buộc toàn vẹn

| Bảng | Ràng buộc |
|---|---|
| `cases` | **CHECK** `source IN ('new', 'legacy_import')` |
| `classification_results` | **CHECK** `primary_pattern IN (3, 4, 5)` |
| `classification_results` | **CHECK** `secondary_pattern IN (3, 4, 5)` |
| `classification_results` | **UNIQUE** `run_id` |
| `diagnostic_reviews` | **CHECK** `primary_pattern IN (3, 4, 5)` |
| `diagnostic_reviews` | **CHECK** `secondary_pattern IN (3, 4, 5)` |
| `diagnostic_reviews` | **CHECK** `grade_group BETWEEN 1 AND 5)` |
| `diagnostic_reviews` | **CHECK** `status IN ('draft', 'confirmed')` |
| `images` | **CHECK** `source IN ('upload', 'live_capture', 'legacy_import')` |
| `images` | **UNIQUE** `slide_id, image_number` |
| `inference_runs` | **CHECK** `status IN ('pending', 'running', 'completed', 'failed')` |
| `magnification_calibration` | **CHECK** `magnification IN ('4x', '10x', '20x', '40x')` |
| `manual_annotations` | **CHECK** `gleason_pattern IN (3, 4, 5)` |
| `preprocessing_results` | **UNIQUE** `image_id` |
| `segmentation_results` | **UNIQUE** `run_id` |
| `slides` | **UNIQUE** `case_id, slide_number` |
| `stage3_results` | **CHECK** `isup_grade BETWEEN 0 AND 5)` |
| `stage3_results` | **UNIQUE** `run_id` |
| `users` | **CHECK** `role IN ('user', 'admin')` |

Khóa ngoại trỏ tới `images.id` và `inference_runs.id` đều khai báo `ON DELETE CASCADE`:
xóa một ảnh sẽ kéo theo kết quả tiền xử lý, mọi lần chạy AI cùng ba bảng kết quả, bản
đánh giá và các vùng khoanh thủ công. Tệp trên đĩa **không** nằm trong cơ chế này nên
phải xóa tường minh trong mã xử lý.

Khóa ngoại chỉ có hiệu lực khi mỗi kết nối tự bật `PRAGMA foreign_keys = ON`; hệ thống
bật sẵn qua một listener của SQLAlchemy trong `app/database.py`.

### 1.4. Chỉ mục

| Bảng | Chỉ mục |
|---|---|
| `audit_logs` | `idx_audit_entity` |
| `audit_logs` | `idx_audit_user` |
| `cases` | `idx_cases_code_year` |
| `cases` | `idx_cases_legacy_id` |
| `diagnostic_reviews` | `idx_reviews_image` |
| `images` | `idx_images_slide` |
| `inference_runs` | `idx_runs_image` |
| `inference_runs` | `idx_runs_status` |
| `manual_annotations` | `idx_annotations_image` |
| `reports` | `idx_reports_case` |
| `slides` | `idx_slides_case` |

## 2. Ma trận phân quyền

Toàn bộ **46 điểm cuối** của hệ thống, đọc trực tiếp từ bảng định tuyến FastAPI
lúc chạy — không phải chép tay, nên không thể sót hay lệch so với mã nguồn.

Cột *Cơ chế* là phần phụ thuộc bảo vệ được gắn ở cấp router hoặc cấp tuyến.

### Xác thực

| Phương thức | Đường dẫn | Bác sĩ | Quản trị viên | Cơ chế |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | Công khai | Công khai | — |
| `GET` | `/api/auth/me` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/health` | Công khai | Công khai | — |

### Ca bệnh, slide, ảnh

| Phương thức | Đường dẫn | Bác sĩ | Quản trị viên | Cơ chế |
|---|---|---|---|---|
| `GET` | `/api/cases` | ✔ | ✔ | `get_current_user` |
| `POST` | `/api/cases` | ✔ | ✔ | `get_current_user` |
| `DELETE` | `/api/cases/slides/{slide_id}` | ✔ | ✔ | `get_current_user` |
| `POST` | `/api/cases/slides/{slide_id}/images` | ✔ | ✔ | `get_current_user` |
| `POST` | `/api/cases/slides/{slide_id}/move` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/cases/{case_id}` | ✔ | ✔ | `get_current_user` |
| `PATCH` | `/api/cases/{case_id}` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/cases/{case_id}/gleason` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/cases/{case_id}/report` | ✔ | ✔ | `get_current_user` |
| `POST` | `/api/cases/{case_id}/slides` | ✔ | ✔ | `get_current_user` |

### Ảnh và kết quả trên ảnh

| Phương thức | Đường dẫn | Bác sĩ | Quản trị viên | Cơ chế |
|---|---|---|---|---|
| `DELETE` | `/api/images/{image_id}` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/images/{image_id}` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/images/{image_id}/annotations` | ✔ | ✔ | `get_current_user` |
| `POST` | `/api/images/{image_id}/annotations` | ✔ | ✔ | `get_current_user` |
| `DELETE` | `/api/images/{image_id}/annotations/{annotation_id}` | ✔ | ✔ | `get_current_user` |
| `PATCH` | `/api/images/{image_id}/annotations/{annotation_id}` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/images/{image_id}/dzi` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/images/{image_id}/dzi_files/{level}/{filename}` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/images/{image_id}/file` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/images/{image_id}/inference` | ✔ | ✔ | `get_current_user` |
| `POST` | `/api/images/{image_id}/inference` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/images/{image_id}/preprocessing` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/images/{image_id}/review` | ✔ | ✔ | `get_current_user` |
| `PATCH` | `/api/images/{image_id}/review` | ✔ | ✔ | `get_current_user` |
| `POST` | `/api/images/{image_id}/review/confirm` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/inference-runs/{run_id}/mask` | ✔ | ✔ | `get_current_user` |

### Đánh giá chẩn đoán

| Phương thức | Đường dẫn | Bác sĩ | Quản trị viên | Cơ chế |
|---|---|---|---|---|
| `GET` | `/api/reviews/flagged` | ✔ | ✔ | `get_current_user` |

### Mô hình, thống kê, hiệu chỉnh

| Phương thức | Đường dẫn | Bác sĩ | Quản trị viên | Cơ chế |
|---|---|---|---|---|
| `GET` | `/api/calibration` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/models` | ✔ | ✔ | `get_current_user` |
| `GET` | `/api/stats/doctor` | ✔ | ✔ | `get_current_user` |

### Quản trị

| Phương thức | Đường dẫn | Bác sĩ | Quản trị viên | Cơ chế |
|---|---|---|---|---|
| `PUT` | `/api/admin/calibration/{magnification}` | ✖ 403 | ✔ | `require_admin` |
| `GET` | `/api/admin/library/export` | ✖ 403 | ✔ | `require_admin` |
| `GET` | `/api/admin/logs` | ✖ 403 | ✔ | `require_admin` |
| `POST` | `/api/admin/migration/import` | ✖ 403 | ✔ | `require_admin` |
| `POST` | `/api/admin/migration/preview` | ✖ 403 | ✔ | `require_admin` |
| `POST` | `/api/admin/migration/sqlite-import` | ✖ 403 | ✔ | `require_admin` |
| `POST` | `/api/admin/migration/sqlite-preview` | ✖ 403 | ✔ | `require_admin` |
| `GET` | `/api/admin/models` | ✖ 403 | ✔ | `require_admin` |
| `POST` | `/api/admin/models/{task_type}/{arch_key}/reload` | ✖ 403 | ✔ | `require_admin` |
| `GET` | `/api/admin/stats` | ✖ 403 | ✔ | `require_admin` |
| `GET` | `/api/admin/users` | ✖ 403 | ✔ | `require_admin` |
| `POST` | `/api/admin/users` | ✖ 403 | ✔ | `require_admin` |
| `PATCH` | `/api/admin/users/{user_id}` | ✖ 403 | ✔ | `require_admin` |

**Tổng kết:** 2 tuyến công khai, 31 tuyến cần đăng nhập ở bất kỳ vai trò nào,
13 tuyến chỉ dành cho quản trị viên.

Mô hình phân quyền phẳng: không có quyền sở hữu ca bệnh theo từng bác sĩ, nên mọi bác sĩ
đều thao tác được trên mọi ca chưa khóa. Đây là lựa chọn có chủ ý, phù hợp quy mô một
khoa giải phẫu bệnh, và được nêu rõ trong phần Giới hạn đề tài.

---

## 3. Đặc tả thành phần kiến trúc

### 3.1. Tầng trình bày

| Thành phần | Công nghệ | Trách nhiệm | Giao tiếp |
|---|---|---|---|
| Cổng Bác sĩ | React 19, TypeScript, Vite (`--mode doctor`, cổng 5173) | Tổng quan, quản lý ca, tải/chụp ảnh, trình xem tiêu bản, khoanh vùng, đánh giá, phiếu kết quả | Gọi API qua `lib/api.ts` |
| Cổng Quản trị | Cùng mã nguồn, `--mode admin`, cổng 5174 | Tổng quan hệ thống, nhật ký, mô hình AI, người dùng, di trú, xuất thư viện | Như trên |
| `lib/api.ts` | fetch API | Bọc mọi lời gọi HTTP, gắn `Authorization`, chuyển lỗi HTTP thành `ApiError`, coi 404 của một số tuyến là “chưa có dữ liệu” chứ không phải lỗi | — |
| `lib/dzi.ts` | OpenSeadragon 6 | Dựng trình xem thu phóng sâu, gắn JWT vào từng yêu cầu lát ảnh | `GET /api/images/{id}/dzi` |
| `lib/portal.ts` | — | Định danh cổng, khóa lưu phiên riêng theo cổng, kiểm tra vai trò có thuộc cổng không | — |

Hai cổng dựng từ **một mã nguồn** và ship **cùng một gói**. Mã của màn quản trị vẫn nằm
trong gói của cổng bác sĩ; việc tách cổng không phải cơ chế bảo mật.

### 3.2. Tầng ứng dụng

| Thành phần | Tệp | Trách nhiệm |
|---|---|---|
| Lớp bảo mật | `security.py`, `deps.py` | Băm và kiểm mật khẩu (bcrypt), phát và giải mã JWT (HS256), hai phụ thuộc bảo vệ `get_current_user` và `require_admin` |
| Lớp API | `routers/` — 9 tệp | Nhận yêu cầu, kiểm tra nghiệp vụ, gọi dịch vụ, trả mã lỗi HTTP đúng ngữ nghĩa |
| Lớp hợp đồng dữ liệu | `schemas/` — Pydantic v2 | Ràng buộc dữ liệu vào và ra cho từng điểm cuối; ngăn rò rỉ trường nội bộ như đường dẫn tệp |
| Ghi nhật ký | `audit.py` | Hàm dùng chung, ghi bản ghi nhật ký trên cùng phiên giao dịch với thao tác gốc nên hai việc luôn cùng thành công hoặc cùng thất bại |
| Tiền xử lý | `preprocessing.py` | Phát hiện mờ, tách vùng mô, chuẩn hóa màu Macenko có điều kiện |
| Sinh tháp ảnh | `dzi.py` (pyvips) | Tạo tháp lát ảnh ở lần xem đầu tiên, lưu lại dùng cho các lần sau |
| Điều phối tác vụ nền | `routers/inference.py` | `BackgroundTasks` kết hợp `Semaphore(1)`: tối đa một lần suy diễn tại một thời điểm |
| Quy trình suy diễn | `inference/` — 6 tệp | `scale.py` xác định tỉ lệ vật lý → `tiling.py` cắt mảnh → `pipeline.py` chạy ba giai đoạn → `registry.py` nạp và giữ trọng số → `fusion.py` hợp nhất ISUP |

**Quyết định thiết kế cần nêu trong luận văn:**

- **Giới hạn một lần suy diễn đồng thời** không phải lựa chọn tùy tiện. Chạy hai ảnh WSI song song từng làm tiến trình máy chủ bị hệ điều hành kết thúc vì hết bộ nhớ, không để lại vết lỗi nào. Giới hạn này chỉ có tác dụng trong phạm vi một tiến trình; triển khai nhiều tiến trình sẽ cần hàng đợi dùng chung.
- **Tác vụ nền mở phiên cơ sở dữ liệu riêng.** Phiên của yêu cầu HTTP đã đóng trước khi tác vụ nền chạy, vì khung ứng dụng thực thi chúng sau khi phản hồi được gửi đi.
- **Trọng số được giữ trong bộ nhớ suốt vòng đời tiến trình.** Vì vậy có thêm điểm cuối tải lại: thay tệp trọng số mới trên đĩa mà không có bước này thì hệ thống vẫn chạy trọng số cũ.

### 3.3. Tầng dữ liệu

| Thành phần | Vị trí | Ghi chú |
|---|---|---|
| Cơ sở dữ liệu | `database/prostaai.db` | SQLite, 14 bảng. Lược đồ do `docs/schema.sql` sở hữu; không dùng cơ chế di trú tự động, mọi thay đổi cấu trúc áp thủ công vào cả hai nơi |
| Kho tệp | `backend/uploads/case_N/slide_M/` | Ảnh gốc, ảnh thu nhỏ, ảnh xem nhanh, ảnh chuẩn màu, mặt nạ mô, mặt nạ AI, thư mục tháp lát ảnh |
| Kho mô hình | `backend/models/` | 7 tệp `.pt` (4 phân loại, 3 phân đoạn) và 3 tệp của mô hình hợp nhất. Không đưa vào quản lý phiên bản mã nguồn |

Mọi tệp của cùng một ảnh dùng chung phần đầu tên là mã định danh duy nhất của ảnh, nên khi
xóa ảnh chỉ cần một phép quét theo tiền tố là dọn sạch, không đụng tới ảnh khác cùng thư mục.

---

## 4. Đặc tả luồng nghiệp vụ

Bảng dưới đặc tả từng bước trong sơ đồ `workflow_diagram.svg`.

| Bước | Làn | Hoạt động | Điều kiện vào | Kết quả |
|---|---|---|---|---|
| 1 | Bác sĩ | Tạo ca bệnh | Đã đăng nhập | Bản ghi ca mới; trùng mã số + mã năm bị từ chối |
| 2 | Bác sĩ | Thêm slide vào ca | Ca tồn tại | Slide được đánh số tự động; vượt 12 slide bị từ chối |
| 3 | Bác sĩ | Tải ảnh lên hoặc chụp trực tiếp | Slide tồn tại | Ảnh được lưu; vượt 8 ảnh mỗi slide hoặc quá dung lượng bị từ chối |
| 4 | Hệ thống | Tiền xử lý tự động | Ngay sau bước 3 | Bản ghi tiền xử lý: cờ mờ, điểm chất lượng, mặt nạ mô. Lỗi ở bước này **không** làm hỏng việc tải ảnh |
| 5 | Bác sĩ | Chọn kiến trúc mô hình | Ảnh tồn tại | Danh sách chỉ hiện kiến trúc thực sự có trọng số trên đĩa |
| 6 | Hệ thống | Tạo lần chạy, trạng thái chờ | Bác sĩ bấm bắt đầu | Trả kết quả ngay, không chờ xử lý xong |
| 7 | Quy trình AI | Xin chỗ chạy | Có tác vụ nền | Chờ nếu đang bận; trạng thái vẫn là *chờ* |
| 8 | Quy trình AI | Xác định µm/pixel và cắt mảnh | Được cấp chỗ | Mỗi mảnh phủ đúng khoảng cách vật lý như lúc huấn luyện |
| 9 | Quy trình AI | Giai đoạn 1 — phân đoạn 6 lớp | Có mảnh mô | Mặt nạ toàn ảnh, diện tích theo lớp |
| 10 | Quy trình AI | Giai đoạn 2 — phân loại 4 lớp | Có mảnh chứa điểm ảnh ung thư | Cặp mẫu trội/phụ theo diện tích |
| 11 | Quy trình AI | Giai đoạn 3 — hợp nhất ISUP | Có tệp mô hình hợp nhất | Nhóm ISUP kèm độ tin cậy. Thiếu tệp thì bỏ qua, lần chạy vẫn hoàn tất |
| 12 | Hệ thống | Lưu kết quả, ghi nhật ký | Ba giai đoạn xong | Trạng thái *hoàn tất* |
| 13 | Bác sĩ | Xem mặt nạ, đối chiếu tiêu bản | Lần chạy hoàn tất | Có thể bật/tắt lớp phủ, đo khoảng cách, khoanh vùng |
| 14 | Bác sĩ | Đọc cảnh báo độ tin cậy | Hệ thống tự đánh giá | Cảnh báo khi không rõ mô, hoặc khi phân đoạn và phân loại mâu thuẫn |
| 15 | Bác sĩ | Nhập kết luận | Không bắt buộc đã chạy AI | Bản nháp được ghi khi bấm lưu |
| 16 | Bác sĩ | Xác nhận và khóa | Có bản nháp | Trạng thái *đã xác nhận*, ghi thời điểm và người ký |
| 17 | Bác sĩ | Tổng hợp Gleason cấp ca, in phiếu | Có ít nhất một ảnh đã xác nhận | Điểm cấp ca tính theo trọng số diện tích |

**Nhánh rẽ và ngoại lệ**

| Điểm rẽ | Điều kiện | Xử lý |
|---|---|---|
| Sau bước 7 | Không còn chỗ chạy | Giữ trạng thái *chờ*, không báo lỗi, không chiếm bộ nhớ |
| Sau bước 11 | Lỗi bất kỳ | Trạng thái *thất bại* kèm thông điệp; bác sĩ chọn thử lại và quay về bước 5 |
| Sau bước 15 | Chưa đủ căn cứ để ký | Quay lại bước 15, bản nháp giữ nguyên |
| Bước 14 | AI không gán được mẫu dù phân đoạn thấy vùng ung thư | Hiển thị cảnh báo mâu thuẫn, vô hiệu hóa nút đồng ý với AI, không điền sẵn kết luận |

---

## 5. Đặc tả biểu đồ tuần tự

Bảng dưới đặc tả từng thông điệp trong sơ đồ `sequence_diagram.svg`, kèm hợp đồng API thật.

| # | Từ → Đến | Thông điệp | Hợp đồng |
|---|---|---|---|
| 1 | Bác sĩ → Giao diện | Chọn kiến trúc, bấm bắt đầu | — |
| 2 | Giao diện → API | `POST /api/images/{id}/inference` | Thân: `{segmentation_model?, classification_model?}`; thiếu thì dùng kiến trúc khuyến nghị. Header `Authorization: Bearer <JWT>` |
| 3 | API → CSDL | Thêm bản ghi lần chạy | `status = 'pending'`, ghi kèm hai kiến trúc đã chọn |
| 4 | API → Tác vụ nền | Lên lịch xử lý | Chạy sau khi phản hồi đã gửi đi |
| 5 | API → Giao diện | `201 Created` | Trả ngay, không chờ xử lý |
| 6 | Giao diện → API | `GET /api/images/{id}/inference` mỗi 2,5 giây | Lặp khi trạng thái còn *chờ* hoặc *đang chạy* |
| 7 | Tác vụ nền → chính nó | Xin chỗ chạy | Chờ nếu đang bận; trạng thái trong cơ sở dữ liệu vẫn là *chờ* |
| 8 | Tác vụ nền → CSDL | Cập nhật *đang chạy* | Mở phiên cơ sở dữ liệu riêng, không dùng phiên của yêu cầu HTTP |
| 9 | Tác vụ nền → CSDL | Đọc metadata ảnh và bảng hiệu chỉnh | — |
| 10 | CSDL → Tác vụ nền | Trả µm/pixel | Thứ tự ưu tiên: thẻ trong tệp ảnh → bảng hiệu chỉnh theo vật kính → không có thì không quy đổi |
| 11 | Tác vụ nền → Quy trình AI | Cắt mảnh theo tỉ lệ vật lý | Kích thước lưới tính từ µm/pixel để mỗi mảnh phủ 243,1 µm |
| 12 | Quy trình AI → chính nó | Nạp trọng số | Lấy từ bộ nhớ đệm; lần đầu mới đọc tệp |
| 13 | Quy trình AI → chính nó | Giai đoạn 1 | Phân đoạn từng mảnh, ghép mặt nạ không chồng lấn |
| 14 | Quy trình AI → chính nó | Giai đoạn 2 | Chỉ chạy trên mảnh mà giai đoạn 1 đánh dấu có ung thư |
| 15 | Quy trình AI → chính nó | Giai đoạn 3 | Chạy hai mạng phân loại trên **toàn bộ** mảnh mô, độc lập với bộ lọc của giai đoạn 2 |
| 16 | Quy trình AI → Kho tệp | Ghi tệp mặt nạ | Kích thước đúng bằng ảnh gốc |
| 17 | Quy trình AI → Tác vụ nền | Trả kết quả ba giai đoạn | — |
| 18 | Tác vụ nền → CSDL | Thêm ba bản ghi kết quả | Mỗi lần chạy tối đa một bản ghi mỗi loại |
| 19 | Tác vụ nền → CSDL | Cập nhật *hoàn tất*, ghi nhật ký | Cùng một phiên giao dịch |
| 20 | Tác vụ nền → chính nó | Trả lại chỗ chạy | Luôn thực hiện, kể cả khi có lỗi |
| 21 | Giao diện → API | Lần hỏi trạng thái cuối | Nhận `status: 'completed'` kèm toàn bộ kết quả |
| 22 | Giao diện → Bác sĩ | Hiển thị hoàn tất | Kèm nút chuyển sang trình xem kết quả |

**Nhánh lỗi.** Bất kỳ ngoại lệ nào trong các bước 8–19 đều được bắt, ghi trạng thái *thất
bại* kèm thông điệp lỗi, và trả lại chỗ chạy. Không có đường nào để lần chạy dừng vĩnh viễn
ở trạng thái *đang chạy* — đây là ràng buộc thiết kế, không phải hệ quả tình cờ.

**Mã lỗi HTTP liên quan**

| Mã | Khi nào |
|---|---|
| `401` | Thiếu JWT, JWT sai chữ ký hoặc hết hạn, tài khoản bị khóa |
| `403` | Vai trò không phải admin gọi tuyến quản trị |
| `404` | Không tìm thấy ảnh, hoặc chưa có lần chạy nào cho ảnh đó |
| `409` | Xác nhận một bản đánh giá đã được xác nhận trước đó |
| `413` | Tệp ảnh vượt dung lượng cho phép |
| `423` | Sửa một bản đánh giá đã khóa |
| `429` | Đăng nhập sai quá số lần cho phép trong khoảng thời gian khóa |
