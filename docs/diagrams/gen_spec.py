"""Generate the data dictionary and permission matrix from the running system."""
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, r"D:\LV\backend")
DB = Path(r"D:\LV\database\prostaai.db")

TABLES = {
    "users": "Tài khoản đăng nhập. Hai vai trò: bác sĩ (user) và quản trị viên (admin).",
    "cases": "Ca bệnh — đơn vị được ký trên phiếu kết quả theo phác đồ CAP.",
    "slides": "Lam kính thuộc một ca. Tối đa 12 slide mỗi ca.",
    "images": "Ảnh vi trường chụp từ một slide. Tối đa 8 ảnh mỗi slide.",
    "preprocessing_results": "Kết quả tiền xử lý tự động, sinh ngay khi ảnh được tải lên.",
    "inference_runs": "Một lần chạy quy trình AI trên một ảnh.",
    "segmentation_results": "Đầu ra giai đoạn 1 — mặt nạ phân đoạn và diện tích theo lớp.",
    "classification_results": "Đầu ra giai đoạn 2 — cặp mẫu Gleason trội/phụ ở mức ảnh.",
    "stage3_results": "Đầu ra giai đoạn 3 — nhóm ISUP do mô hình hợp nhất suy ra.",
    "diagnostic_reviews": "Kết luận của bác sĩ. Bản sao có thể sửa, tách hẳn khỏi đầu ra AI.",
    "manual_annotations": "Vùng khoanh thủ công trên ảnh, độc lập với AI.",
    "reports": "Lịch sử phiếu kết quả đã kết xuất. Chưa dùng trong phạm vi đề tài.",
    "audit_logs": "Nhật ký mọi thao tác làm thay đổi dữ liệu.",
    "magnification_calibration": "Số µm ứng với một điểm ảnh, đo bằng thước hiệu chuẩn cho từng vật kính.",
}

D = {
    "users.id": "Khóa chính.",
    "users.username": "Tên đăng nhập, duy nhất. Trùng dạng địa chỉ thư điện tử nhưng không phải cột email.",
    "users.password_hash": "Mật khẩu đã băm bằng bcrypt. Không bao giờ lưu dạng thô.",
    "users.full_name": "Họ tên hiển thị; dùng làm tên người ký trên phiếu kết quả.",
    "users.role": "Vai trò: user (bác sĩ) hoặc admin.",
    "users.is_active": "Tài khoản bị khóa vẫn đăng nhập thất bại dù mật khẩu đúng.",
    "users.created_at": "Thời điểm tạo tài khoản.",

    "cases.id": "Khóa chính.",
    "cases.case_code": "Mã số ca theo cách đánh của cơ sở y tế.",
    "cases.case_year": "Mã năm. Cùng với mã số tạo thành cặp duy nhất.",
    "cases.patient_name": "Họ tên bệnh nhân. Bị loại bỏ khi nhập dữ liệu ở chế độ ẩn danh.",
    "cases.patient_age": "Tuổi bệnh nhân.",
    "cases.conclusion": "Kết luận dạng văn bản tự do ở mức ca.",
    "cases.is_anonymized": "Đánh dấu ca đã ẩn danh, quyết định việc dùng dữ liệu định danh.",
    "cases.source": "Nguồn: new (tạo mới) hoặc legacy_import (nhập từ phần mềm cũ).",
    "cases.legacy_case_id": "Mã ca trong phần mềm cũ, giữ lại để đối chiếu.",
    "cases.created_by": "Người tạo ca.",
    "cases.created_at": "Thời điểm tạo.",
    "cases.updated_at": "Thời điểm sửa gần nhất.",

    "slides.id": "Khóa chính.",
    "slides.case_id": "Ca bệnh chứa slide này.",
    "slides.slide_number": "Số thứ tự trong ca. Duy nhất theo từng ca. Xóa slide để lại khoảng trống, không đánh số lại.",
    "slides.legacy_slide_label": "Nhãn thật của lam kính, ví dụ “Slide 3-4”. Nhãn gắn với miếng kính nên không đổi khi sắp xếp lại thứ tự.",
    "slides.created_at": "Thời điểm tạo.",

    "images.id": "Khóa chính.",
    "images.slide_id": "Slide chứa ảnh này.",
    "images.image_number": "Số thứ tự trong slide. Duy nhất theo từng slide.",
    "images.file_path": "Đường dẫn tệp gốc trên máy chủ. Không bao giờ trả ra ngoài qua API.",
    "images.description": "Mô tả tự do. Với dữ liệu nhập từ phần mềm cũ, đây là nhãn Gleason viết tay.",
    "images.width_px": "Chiều rộng thật của ảnh gốc, dùng cho phép đo khoảng cách.",
    "images.height_px": "Chiều cao thật của ảnh gốc.",
    "images.format": "Định dạng do Pillow giải mã ra, không tin theo phần mở rộng tên tệp.",
    "images.captured_at": "Thời điểm chụp, nếu biết.",
    "images.uploaded_by": "Người tải lên hoặc chụp.",
    "images.source": "upload (chọn tệp), live_capture (chụp qua camera), legacy_import.",
    "images.legacy_image_id": "Mã ảnh trong phần mềm cũ.",
    "images.created_at": "Thời điểm ghi nhận.",
    "images.magnification": "Vật kính lúc chụp: 4x, 10x, 20x hoặc 40x. Là khóa tra bảng hiệu chỉnh µm/pixel.",

    "preprocessing_results.id": "Khóa chính.",
    "preprocessing_results.image_id": "Ảnh tương ứng. Quan hệ một–một.",
    "preprocessing_results.normalized_image_path": "Ảnh đã chuẩn hóa màu, chỉ dùng để kiểm tra chất lượng.",
    "preprocessing_results.tissue_mask_path": "Mặt nạ vùng mô tách bằng ngưỡng Otsu trên kênh bão hòa.",
    "preprocessing_results.is_blurry": "Cờ ảnh mờ; hiển thị cảnh báo trước khi bác sĩ chạy AI.",
    "preprocessing_results.quality_score": "Phương sai Laplacian. Ngưỡng phân loại mờ là heuristic, chưa hiệu chỉnh lâm sàng.",
    "preprocessing_results.processed_at": "Thời điểm xử lý.",

    "inference_runs.id": "Khóa chính.",
    "inference_runs.image_id": "Ảnh được phân tích.",
    "inference_runs.status": "pending (chờ chỗ chạy) → running → completed hoặc failed.",
    "inference_runs.segmentation_model_version": "Kiến trúc phân đoạn đã dùng, để mọi kết quả truy vết được về đúng mô hình.",
    "inference_runs.classification_model_version": "Kiến trúc phân loại đã dùng.",
    "inference_runs.error_message": "Nguyên nhân thất bại. Lần chạy không bao giờ kẹt ở trạng thái running.",
    "inference_runs.triggered_by": "Người khởi chạy.",
    "inference_runs.started_at": "Thời điểm thực sự bắt đầu chạy, sau khi được cấp chỗ.",
    "inference_runs.completed_at": "Thời điểm kết thúc.",
    "inference_runs.created_at": "Thời điểm tạo yêu cầu.",

    "segmentation_results.id": "Khóa chính.",
    "segmentation_results.run_id": "Lần chạy tương ứng. Quan hệ một–một.",
    "segmentation_results.mask_file_path": "Tệp PNG mặt nạ màu, kích thước đúng bằng ảnh gốc.",
    "segmentation_results.cancer_area_px": "Số điểm ảnh thuộc Gleason 3, 4 hoặc 5.",
    "segmentation_results.total_tissue_area_px": "Số điểm ảnh biểu mô (lành tính + ung thư). Không tính nền và mô đệm.",
    "segmentation_results.cancer_area_percentage": "Tỉ lệ hai cột trên. Bằng 0 điểm ảnh mô nghĩa là AI không đọc được ảnh, không phải kết luận lành tính.",
    "segmentation_results.created_at": "Thời điểm ghi.",

    "classification_results.id": "Khóa chính.",
    "classification_results.run_id": "Lần chạy tương ứng. Quan hệ một–một.",
    "classification_results.primary_pattern": "Mẫu trội theo diện tích. NULL nghĩa là không gán được mẫu, không phải lành tính.",
    "classification_results.primary_confidence": "Độ tin cậy mẫu trội, lưu dạng phân số 0–1.",
    "classification_results.secondary_pattern": "Mẫu phụ. Bằng mẫu trội khi chỉ có một mẫu.",
    "classification_results.secondary_confidence": "Độ tin cậy mẫu phụ.",
    "classification_results.heatmap_file_path": "Cột cũ, luôn NULL từ khi bỏ tính năng bản đồ nhiệt. Giữ lại để tránh sửa lược đồ trên cơ sở dữ liệu đang chạy.",
    "classification_results.created_at": "Thời điểm ghi.",

    "stage3_results.id": "Khóa chính.",
    "stage3_results.run_id": "Lần chạy tương ứng. Quan hệ một–một.",
    "stage3_results.isup_grade": "Nhóm độ ác tính ISUP 0–5 do mô hình hợp nhất suy ra.",
    "stage3_results.confidence": "Xác suất của lớp được chọn.",
    "stage3_results.classification_pct_json": "Tám đặc trưng đầu vào dạng JSON, lưu để truy vết — mô hình không phải hộp đen.",
    "stage3_results.created_at": "Thời điểm ghi.",

    "diagnostic_reviews.id": "Khóa chính.",
    "diagnostic_reviews.image_id": "Ảnh được đánh giá.",
    "diagnostic_reviews.run_id": "Lần chạy AI tham chiếu. Cho phép NULL — bác sĩ chẩn đoán được mà không cần chạy AI.",
    "diagnostic_reviews.primary_pattern": "Mẫu trội do bác sĩ kết luận.",
    "diagnostic_reviews.secondary_pattern": "Mẫu phụ do bác sĩ kết luận.",
    "diagnostic_reviews.total_score": "Tổng điểm Gleason, máy chủ tự tính khi đã có đủ hai mẫu.",
    "diagnostic_reviews.grade_group": "Nhóm ISUP suy từ cặp mẫu. Vẫn tính và lưu nhưng không hiển thị cho bác sĩ.",
    "diagnostic_reviews.cancer_area_percentage": "Chép từ kết quả phân đoạn thật, không phải trường nhập tay.",
    "diagnostic_reviews.biopsy_location": "Vị trí sinh thiết.",
    "diagnostic_reviews.pni_present": "Xâm lấn quanh thần kinh — bác sĩ tự nhận định, AI không sinh ra.",
    "diagnostic_reviews.pni_notes": "Ghi chú kèm theo.",
    "diagnostic_reviews.lvi_present": "Xâm lấn mạch bạch huyết — bác sĩ tự nhận định.",
    "diagnostic_reviews.lvi_notes": "Ghi chú kèm theo.",
    "diagnostic_reviews.free_notes": "Ghi chú tự do.",
    "diagnostic_reviews.status": "draft (còn sửa được) hoặc confirmed (đã khóa).",
    "diagnostic_reviews.reviewed_by": "Người xác nhận. Tên được tra ra để in lên phiếu.",
    "diagnostic_reviews.confirmed_at": "Thời điểm xác nhận. Khóa mềm ở mức ứng dụng, không phải chữ ký số.",
    "diagnostic_reviews.created_at": "Thời điểm tạo bản nháp.",
    "diagnostic_reviews.updated_at": "Thời điểm sửa gần nhất.",
    "diagnostic_reviews.tumor_length_mm": "Chiều dài khối u đo bằng thước, chỉ ghi được khi vật kính đã hiệu chỉnh.",
    "diagnostic_reviews.needs_second_opinion": "Cờ cần hội chẩn; đưa bản đánh giá vào danh sách chờ chung.",
    "diagnostic_reviews.second_opinion_notes": "Lý do cần hội chẩn.",

    "manual_annotations.id": "Khóa chính.",
    "manual_annotations.image_id": "Ảnh chứa vùng khoanh.",
    "manual_annotations.points": "Danh sách đỉnh đa giác dạng JSON, tọa độ 0–100 theo phần trăm kích thước ảnh nên đúng ở mọi mức hiển thị.",
    "manual_annotations.gleason_pattern": "Mẫu Gleason gán cho vùng. NULL nghĩa là lành tính.",
    "manual_annotations.note": "Ghi chú cho vùng.",
    "manual_annotations.created_by": "Người vẽ.",
    "manual_annotations.created_at": "Thời điểm vẽ. Vùng được lưu ngay khi vẽ xong, trước cả khi gán nhãn.",
    "manual_annotations.updated_at": "Thời điểm sửa gần nhất.",

    "reports.id": "Khóa chính.",
    "reports.case_id": "Ca bệnh của phiếu.",
    "reports.file_path": "Đường dẫn tệp phiếu.",
    "reports.generated_by": "Người kết xuất.",
    "reports.generated_at": "Thời điểm kết xuất.",

    "audit_logs.id": "Khóa chính.",
    "audit_logs.user_id": "Người thực hiện.",
    "audit_logs.action": "Tên hành động, ví dụ create_case, confirm_review, reload_model.",
    "audit_logs.entity_type": "Loại đối tượng bị tác động.",
    "audit_logs.entity_id": "Mã đối tượng.",
    "audit_logs.details": "Mô tả bổ sung.",
    "audit_logs.created_at": "Thời điểm ghi, chỉ chính xác tới giây nên khi đọc phải sắp xếp kèm theo id.",

    "magnification_calibration.magnification": "Vật kính, đồng thời là khóa chính.",
    "magnification_calibration.um_per_pixel": "Số µm ứng với một điểm ảnh, đo bằng thước hiệu chuẩn trên kính hiển vi.",
    "magnification_calibration.updated_by": "Người nhập số đo.",
    "magnification_calibration.updated_at": "Thời điểm cập nhật.",
}

db = sqlite3.connect(DB)
cur = db.cursor()
out = []
w = out.append

w("## 1. Đặc tả cơ sở dữ liệu\n")
w("Sinh trực tiếp từ `database/prostaai.db` bằng `docs/diagrams/gen_spec.py`, nên danh sách")
w("cột và ràng buộc không thể lệch khỏi lược đồ đang chạy.\n")

w("### 1.1. Tổng quan các bảng\n")
w("| # | Bảng | Số cột | Mục đích |")
w("|---|---|---|---|")
for i, (t, desc) in enumerate(TABLES.items(), 1):
    n = len(list(cur.execute(f"PRAGMA table_info({t})")))
    w(f"| {i} | `{t}` | {n} | {desc} |")
w("")

w("### 1.2. Từ điển dữ liệu\n")
missing = []
for t, desc in TABLES.items():
    cols = list(cur.execute(f"PRAGMA table_info({t})"))
    fks = {f[3]: (f[2], f[4]) for f in cur.execute(f"PRAGMA foreign_key_list({t})")}
    w(f"#### `{t}` — {desc}\n")
    w("| Cột | Kiểu | Ràng buộc | Ý nghĩa |")
    w("|---|---|---|---|")
    for cid, name, typ, notnull, dflt, pk in cols:
        tags = []
        if pk:
            tags.append("PK")
        if name in fks:
            tags.append(f"FK → `{fks[name][0]}.{fks[name][1]}`")
        if notnull and not pk:
            tags.append("NOT NULL")
        if dflt is not None:
            tags.append(f"mặc định `{dflt}`")
        key = f"{t}.{name}"
        if key not in D:
            missing.append(key)
        w(f"| `{name}` | {typ or '—'} | {', '.join(tags) or '—'} | {D.get(key, '')} |")
    w("")

w("### 1.3. Ràng buộc toàn vẹn\n")
w("| Bảng | Ràng buộc |")
w("|---|---|")
rows = []
for (name, sql) in cur.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
    for k in re.findall(r"CHECK\s*\(([^)]*(?:\([^)]*\))?[^)]*)\)", sql or "", re.I):
        rows.append((name, "CHECK", " ".join(k.split()) + ")"))
    for u in re.findall(r"UNIQUE\s*\(([^)]*)\)", sql or "", re.I):
        rows.append((name, "UNIQUE", u.strip()))
for name, kind, body in rows:
    w(f"| `{name}` | **{kind}** `{body}` |")
w("")
w("Khóa ngoại trỏ tới `images.id` và `inference_runs.id` đều khai báo `ON DELETE CASCADE`:")
w("xóa một ảnh sẽ kéo theo kết quả tiền xử lý, mọi lần chạy AI cùng ba bảng kết quả, bản")
w("đánh giá và các vùng khoanh thủ công. Tệp trên đĩa **không** nằm trong cơ chế này nên")
w("phải xóa tường minh trong mã xử lý.\n")
w("Khóa ngoại chỉ có hiệu lực khi mỗi kết nối tự bật `PRAGMA foreign_keys = ON`; hệ thống")
w("bật sẵn qua một listener của SQLAlchemy trong `app/database.py`.\n")

w("### 1.4. Chỉ mục\n")
w("| Bảng | Chỉ mục |")
w("|---|---|")
for (n, t) in cur.execute("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY tbl_name, name"):
    w(f"| `{t}` | `{n}` |")
w("")
db.close()

# ---------------- permission matrix ----------------
from fastapi.routing import APIRoute  # noqa: E402
from app.main import app  # noqa: E402

VN = {
    "PUBLIC": ("Công khai", "Công khai"),
    "get_current_user": ("✔", "✔"),
    "require_admin": ("✖ 403", "✔"),
}
GROUPS = [
    ("Xác thực", ("/api/auth", "/api/health")),
    ("Ca bệnh, slide, ảnh", ("/api/cases",)),
    ("Ảnh và kết quả trên ảnh", ("/api/images", "/api/inference-runs")),
    ("Đánh giá chẩn đoán", ("/api/reviews",)),
    ("Mô hình, thống kê, hiệu chỉnh", ("/api/models", "/api/stats", "/api/calibration")),
    ("Quản trị", ("/api/admin",)),
]

routes = []
for r in app.routes:
    if not isinstance(r, APIRoute) or r.path.startswith("/openapi") or r.path in ("/docs", "/redoc", "/docs/oauth2-redirect"):
        continue
    deps = {d.call.__name__ for d in r.dependant.dependencies if d.call}
    sec = "require_admin" if "require_admin" in deps else ("get_current_user" if "get_current_user" in deps else "PUBLIC")
    for m in sorted(r.methods - {"HEAD", "OPTIONS"}):
        routes.append((m, r.path, sec))

w("## 2. Ma trận phân quyền\n")
w(f"Toàn bộ **{len(routes)} điểm cuối** của hệ thống, đọc trực tiếp từ bảng định tuyến FastAPI")
w("lúc chạy — không phải chép tay, nên không thể sót hay lệch so với mã nguồn.\n")
w("Cột *Cơ chế* là phần phụ thuộc bảo vệ được gắn ở cấp router hoặc cấp tuyến.\n")

for title, prefixes in GROUPS:
    sel = [r for r in routes if any(r[1].startswith(p) for p in prefixes)]
    if not sel:
        continue
    w(f"### {title}\n")
    w("| Phương thức | Đường dẫn | Bác sĩ | Quản trị viên | Cơ chế |")
    w("|---|---|---|---|---|")
    for m, path, sec in sorted(sel, key=lambda x: (x[1], x[0])):
        doc, adm = VN[sec]
        mech = "—" if sec == "PUBLIC" else f"`{sec}`"
        w(f"| `{m}` | `{path}` | {doc} | {adm} | {mech} |")
    w("")

n_pub = sum(1 for r in routes if r[2] == "PUBLIC")
n_any = sum(1 for r in routes if r[2] == "get_current_user")
n_adm = sum(1 for r in routes if r[2] == "require_admin")
w(f"**Tổng kết:** {n_pub} tuyến công khai, {n_any} tuyến cần đăng nhập ở bất kỳ vai trò nào,")
w(f"{n_adm} tuyến chỉ dành cho quản trị viên.\n")
w("Mô hình phân quyền phẳng: không có quyền sở hữu ca bệnh theo từng bác sĩ, nên mọi bác sĩ")
w("đều thao tác được trên mọi ca chưa khóa. Đây là lựa chọn có chủ ý, phù hợp quy mô một")
w("khoa giải phẫu bệnh, và được nêu rõ trong phần Giới hạn đề tài.\n")

Path(r"D:\LV\docs\_spec_generated.md").write_text("\n".join(out), encoding="utf-8")
print("generated;", len(routes), "routes")
if missing:
    print("MISSING DESCRIPTIONS:", missing)
