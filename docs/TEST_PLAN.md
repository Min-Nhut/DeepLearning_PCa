# Kế hoạch kiểm thử hệ thống — ProstaAI

**Trạng thái (2026-08-07): kế hoạch đã thực hiện hết — P0, P1, P2 và kịch bản thủ công.
203 test backend + 29 test frontend, xanh hết.** Chi tiết ở §9.

```bash
cd backend && python -m pytest
```

```bash
npm test --prefix frontend
```

Kịch bản thủ công: [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md) (47 mục).

Trước đó không có một test tự động nào; mọi kiểm chứng là thủ công bằng `curl` + trình
duyệt thật, ghi lại trong [CLAUDE.md](../CLAUDE.md). Tài liệu này là kế hoạch chuyển phần
đáng giá nhất của việc đó thành test chạy được.

Quy mô hệ thống cần phủ: **43 endpoint** trên 9 router, **14 màn hình** frontend, **9 hàm
logic thuần** trong pipeline AI.

---

## 1. Mục tiêu — và giới hạn phải nói rõ

**Test ở đây chứng minh được:**
- Đường ống dữ liệu đúng: cắt patch, ghép mask, cộng diện tích, tổng hợp điểm Gleason.
- Ràng buộc nghiệp vụ được thực thi: trần 12 slide / 8 ảnh, khoá review sau xác nhận,
  phân quyền admin.
- Không hồi quy: mỗi lỗi đã tìm ra có một test giữ chỗ.

**Test ở đây KHÔNG chứng minh được — phải ghi rõ trong luận văn:**
- **Độ chính xác lâm sàng của model.** Con số accuracy/F1/DSC đến từ notebook huấn luyện
  (một lần chia 80/10/10 tĩnh, không phải 5-fold CV như bài báo gốc). Test trong repo này
  chỉ kiểm tra *hệ thống gọi model đúng cách*, không kiểm tra *model đúng hay sai*.
- Chất lượng chẩn đoán trên ảnh kính hiển vi thật — chưa có ground truth cho loại ảnh đó.
- Luồng chụp ảnh trực tiếp — máy phát triển không có camera.

Nhầm hai điều này là dạng overclaim nguy hiểm nhất với một đề tài y tế.

---

## 2. Phân tầng

| Tầng | Phạm vi | Công cụ | Thời gian chạy | Ưu tiên |
|---|---|---|---|---|
| **A** | Hàm logic thuần (không DB, không torch) | pytest | < 5 giây | Cao nhất |
| **B** | API tích hợp (TestClient + DB tạm) | pytest + `fastapi.testclient` | < 30 giây | Cao |
| **C** | Pipeline AI (model giả; 1 smoke test model thật) | pytest, đánh dấu `slow` | vài giây / vài phút | Trung bình |
| **D** | Frontend unit (adapter, api, portal) | Vitest | < 10 giây | Trung bình |
| **E** | Kịch bản thủ công trên trình duyệt | checklist viết tay | ~30 phút/lượt | Bắt buộc, không tự động hoá |

Tầng A+B cho giá trị cao nhất trên mỗi giờ bỏ ra: **mọi lỗi tìm được trong đợt rà soát
2026-08-07 đều nằm ở tầng A hoặc B** (toán học cắt/ghép patch, bộ lọc mô, đếm trùng diện
tích, thoát sớm sai trong handler, nuốt lỗi im lặng).

Tầng E không phải phần thừa: phần lớn hệ thống là giao diện, và một kịch bản thủ công viết
sẵn là thứ đưa thẳng vào phụ lục luận văn được.

---

## 3. Hạ tầng bắt buộc (làm trước, không có thì mọi test đều rủi ro)

### 3.1 Cách ly cơ sở dữ liệu — điều kiện tiên quyết
Test **tuyệt đối không được** chạm vào `database/prostaai.db` (đang chứa ca `0001` thật).
Fixture tạo một file SQLite tạm, dựng từ `docs/schema.sql`, bật `PRAGMA foreign_keys=ON`,
huỷ sau mỗi phiên.

Lợi ích kép: dự án này áp DDL **bằng tay vào hai nơi** (`docs/schema.sql` và file DB thật —
xem ghi chú migration trong CLAUDE.md). Dựng DB test từ `schema.sql` biến việc "hai nơi lệch
nhau" thành lỗi test đỏ ngay, thay vì một quả bom nằm im tới lần cài đặt mới.

### 3.2 Thư mục upload tạm
`UPLOAD_ROOT` trỏ vào `tmp_path` của pytest, để test xoá ảnh/slide kiểm được file trên đĩa
mà không đụng `backend/uploads/`.

### 3.3 Model giả
`registry.load()` bị monkeypatch trả về một module trả logits xác định trước. Nhờ vậy tầng
B/C chạy trong vài giây, không cần 7 file `.pt`, và **kết quả tất định** — điều kiện để test
được các bất biến về diện tích. Chỉ một smoke test dùng checkpoint thật.

### 3.4 Ảnh test sinh tại chỗ
Sinh bằng numpy có seed cố định, **không commit ảnh lớn** (`test_image/` hiện không nằm
trong git và nặng vài trăm MB). Cần: ảnh mô đặc, ảnh kính trắng, ảnh kính có nhiễu, ảnh
nhỏ hơn 500px, ảnh không phải ảnh (rác).

### 3.5 Reset trạng thái toàn cục giữa các test
Có thật trong code và sẽ gây test "nhiễm" nhau nếu bỏ qua: `_failed_attempts` (khoá đăng
nhập), `_inference_semaphore`, cache model của `registry`, cache của `fusion`.

---

## 4. Danh sách ca kiểm thử, theo thứ tự ưu tiên

### P0 — bắt buộc (giữ chỗ cho những lỗi đã từng xảy ra thật)

| # | Ca kiểm thử | Tầng | Vì sao |
|---|---|---|---|
| 1 | `_grid_starts` + `_exclusive_extents`: phủ **chính xác**, liền mạch, không chồng, không hở — với 193/500/1200/2752/6144/26112 | A | Lỗi đếm trùng +7,4% và crash ảnh nhỏ đều từ đây |
| 2 | Bất biến ghép mask: tổng diện tích từng pattern == số pixel đếm trên `full_mask` | C (model giả) | Chính là bất biến mà lỗi đếm trùng phá vỡ |
| 3 | Ảnh nhỏ hơn 500px chạy hết `run_pipeline`: không crash, mask đúng kích thước gốc | C | Từng ném `ValueError: could not broadcast (500,500) into (120,193)` |
| 4 | `_grade_group`: bảng đầy đủ 3+3 … 5+5 | A | Công thức ISUP, dùng ở cả review lẫn tổng hợp ca |
| 5 | Tổng hợp Gleason cấp ca: trọng số theo diện tích; 0 ảnh xác nhận → `null`; toàn lành tính → `null` nhưng `images_confirmed > 0` | B | Logic thuần, nhiều nhánh, chỉ mới kiểm tay một lần |
| 6 | Phân quyền: bác sĩ gọi `/api/admin/*` → **403**; admin → 200 | B | Ranh giới bảo mật thật duy nhất trong hệ thống |
| 7 | Khoá đăng nhập: 5 lần sai → 401, lần 6 → **429**; tài khoản khác không bị ảnh hưởng | B | Trạng thái toàn cục, dễ vỡ thầm lặng |
| 8 | Mật khẩu < 8 ký tự → **422** | B | |
| 9 | Trần: slide thứ 13 → 400; ảnh thứ 9 → 400; file > 200MB → 413; file không decode được → 400 | B | Ràng buộc PRD §8.3/§8.4 |
| 10 | Vòng đời review: PATCH tạo mới → confirm → PATCH tiếp **423** → confirm lại **409** | B | Khoá mềm của báo cáo đã ký |
| 11 | Xoá ảnh: xoá dòng DB cascade + **mọi file dẫn xuất**, ảnh cùng thư mục không bị đụng | B | Đã từng suýt `IsADirectoryError` với thư mục deep-zoom |
| 12 | Xoá slide: xoá ảnh + file + thư mục rỗng; số thứ tự **để trống**, không đánh số lại | B | Vừa xây, chưa có test |
| 13 | Đổi thứ tự slide: hoán vị đúng, quá đầu/cuối → 400, **nhãn ở lại với slide của nó** | B | Ràng buộc `UNIQUE(case_id, slide_number)` dễ vỡ |

### P1 — nên có

| # | Ca kiểm thử | Tầng | Vì sao |
|---|---|---|---|
| 14 | `patch_size_for`: 40x/20x/10x/4x đều ra ~243,1µm; không có dữ liệu → giữ 500px | A | Quy đổi tỉ lệ vật lý mới bật |
| 15 | Thứ tự ưu tiên nguồn µm/px: metadata file **thắng** calibration | B | Sai chỗ này thì file PANDA gắn nhầm "40x" bị resample sai |
| 16 | Bộ lọc mô: mô thật giữ 100%; kính có nhiễu σ=6 và σ=12 → **0 patch** | A | Ngưỡng chọn bằng số liệu, cần chốt lại |
| 17 | Stage 3 dựng vector 8 chiều **đúng thứ tự `feature_columns`** trong metadata | A | Sai thứ tự = dự đoán sai âm thầm |
| 18 | Nhập CSV: dòng lỗi bị bỏ qua bằng SAVEPOINT, **không huỷ cả lô** | B | |
| 19 | Xuất thư viện: một dòng / ảnh; `scope=reviewed` lọc theo ảnh; ca 0 ảnh vẫn có 1 dòng; **luôn bỏ `patient_name`** | B | Ẩn danh hoá là yêu cầu PRD §9.3 |
| 20 | `GET /api/stats/doctor` khớp truy vấn SQL trực tiếp | B | |
| 21 | Frontend: `caseAdapter`, `roleMatchesPortal`, `getReview` 404 → `null`, ánh xạ lỗi của `apiFetch` | D | Logic thuần, rẻ, hay hỏng |

### P2 — có thì tốt

| # | Ca kiểm thử | Tầng |
|---|---|---|
| 22 | DZI chặn path traversal ở tên file tile | B |
| 23 | `area_percentage` của annotation (công thức shoelace) | A |
| 24 | Smoke test **model thật**: 1 kiến trúc, ảnh nhỏ, chỉ kiểm "chạy tới `completed`" — đánh dấu `slow`, không nằm trong lần chạy mặc định | C |

---

## 5. Kịch bản thủ công (tầng E) — checklist cho phụ lục luận văn

Tự động hoá không đáng cho phần này, nhưng vẫn phải chạy trước mỗi mốc nộp:

1. Đăng nhập hai cổng cùng lúc (5173 + 5174), reload cổng bác sĩ → phiên còn nguyên.
2. Đăng nhập sai cổng → thông báo đúng, không ghi token.
3. Tạo ca → thêm slide → tải ảnh → chạy AI → xem mask chồng lên ảnh, bật/tắt lớp, kéo
   thanh độ mờ, đọc chú giải màu.
4. Phóng to sâu ảnh WSI (deep-zoom) tới mức thấy cấu trúc tuyến.
5. Vẽ vùng thủ công, sửa đỉnh, xoá.
6. Đo khoảng cách khi **có** và **không có** calibration (phải hiện pixel + ghi chú "chưa
   hiệu chỉnh", không được bịa mm).
7. Sửa chẩn đoán → Lưu → Xác nhận & khoá → form bị khoá → xem báo cáo → In.
8. Đánh dấu "cần hội chẩn" → xuất hiện ở thẻ trên Tổng quan → bấm vào mở đúng ảnh.
9. Admin: tạo user, khoá/mở user, xem log, nhập dữ liệu cũ (CSV và `.db`), xuất thư viện.
10. Xoá slide có ảnh → xác nhận hộp thoại cảnh báo đúng số ảnh.

**Hai điều không kiểm được ở máy phát triển này, phải ghi chú thẳng:** chụp ảnh trực tiếp
từ camera (không có thiết bị), và chụp màn hình tự động (khung xem của trình duyệt
automation không kết xuất khung hình).

---

## 6. Lộ trình đề xuất

| Bước | Nội dung | Ước lượng |
|---|---|---|
| 1 | Hạ tầng §3 (fixture DB tạm, upload tạm, model giả, ảnh sinh sẵn) | ~2–3 giờ |
| 2 | P0 #1–5 (logic pipeline + tổng hợp Gleason) | ~2 giờ |
| 3 | P0 #6–13 (API: quyền, trần, vòng đời, xoá/sắp xếp) | ~3 giờ |
| 4 | P1 #14–20 (backend còn lại) | ~2–3 giờ |
| 5 | P1 #21 (Vitest cho frontend) | ~1–2 giờ |
| 6 | Viết checklist §5 thành tài liệu nộp kèm | ~1 giờ |

Bước 1–3 là phần đáng làm nhất; dừng ở đó vẫn là một kế hoạch kiểm thử tử tế cho luận văn.

---

## 7. Tiêu chí "đủ"

Không lấy phần trăm coverage làm đích — dễ đạt bằng test vô nghĩa. Tiêu chí đề xuất:

1. **Mọi lỗi đã ghi trong CLAUDE.md của các đợt rà soát 2026-08-07 đều có một test đỏ
   được nếu revert bản sửa.** Đây là tiêu chí kiểm được, và là thứ đáng viết trong luận văn.
2. Toàn bộ P0 xanh.
3. Chạy được bằng một lệnh, không cần checkpoint `.pt`, không đụng DB thật.

---

## 8. Mẫu báo cáo kết quả (cho luận văn)

| Nhóm | Số ca | Đạt | Không đạt | Ghi chú |
|---|---|---|---|---|
| Logic pipeline AI | | | | |
| API nghiệp vụ | | | | |
| Bảo mật / phân quyền | | | | |
| Frontend unit | | | | |
| Thủ công (giao diện) | | | | |

Kèm một mục "Hạn chế của bộ kiểm thử" nhắc lại đúng §1: bộ test này kiểm tra hệ thống, không
kiểm tra độ chính xác lâm sàng của model.

---

## 9. Đã triển khai (2026-08-07) — trọn bước 1–6

### Backend — `backend/tests/`, chạy `python -m pytest`

| File | Phủ | Số test |
|---|---|---|
| `conftest.py` | Hạ tầng §3 | — |
| `test_tiling.py` | P0 #1, P1 #14 #16 | 37 |
| `test_pipeline.py` | P0 #2 #3 | 13 |
| `test_grading.py` | P0 #4 | 11 |
| `test_case_gleason.py` | P0 #5 | 8 |
| `test_auth_permissions.py` | P0 #6 #7 #8 | 24 |
| `test_limits.py` | P0 #9 | 10 |
| `test_review_lifecycle.py` | P0 #10 | 9 |
| `test_slide_management.py` | P0 #11 #12 #13 | 14 |
| `test_scale_resolution.py` | P1 #15 | 11 |
| `test_stage3_fusion.py` | P1 #17 | 6 (+1 `slow`) |
| `test_migration.py` | P1 #18 | 11 |
| `test_library_export.py` | P1 #19 | 9 |
| `test_doctor_stats.py` | P1 #20 | 8 |
| `test_annotations.py` | P2 #23 | 14 |
| `test_dzi.py` | P2 #22 | 18 |
| | **Tổng** | **203** (+2 `slow`) |

### Frontend — `frontend/src/lib/*.test.ts`, chạy `npm test`

| File | Phủ | Số test |
|---|---|---|
| `caseAdapter.test.ts` | P1 #21 | 9 |
| `portal.test.ts` | P1 #21 | 9 |
| `api.test.ts` | P1 #21 | 11 |
| | **Tổng** | **29** |

Không dùng jsdom và không render component: những thứ đã thật sự hỏng trong dự án này là
lớp adapter, cổng phân vai và ánh xạ lỗi của `fetch` — đều là logic thuần. Phần tương tác
do §5 phủ.

### Kịch bản thủ công
[MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md) — 47 mục chia 7 nhóm, có ô đánh dấu và
bảng ghi kết quả, kèm mục "không kiểm được ở máy phát triển".

### Hạ tầng (đúng §3)
DB tạm dựng từ `docs/schema.sql` (schema lệch = test đỏ), thư mục upload riêng **cho từng
test**, model giả thay checkpoint `.pt`, ảnh sinh bằng numpy có seed, reset trạng thái toàn
cục giữa các test. Xác nhận sau mỗi lần chạy đầy đủ: `database/prostaai.db` và
`backend/uploads/` **không hề bị đụng**.

### Ba lỗi thật do chính bộ test phát hiện
1. **`Case.slides` không có `order_by`** → SQLite trả slide theo thứ tự vật lý tuỳ ý, và
   thứ tự đó đổi sau `UPDATE`. Tính năng sắp xếp slide vì thế không có tác dụng đáng tin.
   Kiểm thử tay bỏ sót vì lần thử đó thứ tự *tình cờ* đúng. Đã thêm `order_by` cho cả
   `Case.slides` và `Slide.images`.
2. **Nhập nhầm file không phải SQLite → lỗi 500.** `_open_legacy_sqlite` chỉ bắt trường hợp
   "thiếu bảng", còn file hỏng/không phải DB làm `sqlite3.DatabaseError` thoát ra ngoài. Đã
   bắt và trả 400 kèm thông báo tiếng Việt.
3. **`GET /api/images/{id}/annotations` trả `200 []` cho ảnh không tồn tại**, lệch với mọi
   endpoint per-image khác (`/file`, `/review`, `/preprocessing` đều 404) và khiến "ảnh đã
   bị xoá" không phân biệt được với "chưa đánh dấu vùng nào". Đã thêm kiểm tra tồn tại.

### Kiểm thử bảo mật đường dẫn (P2 #22)
11 chuỗi tấn công path traversal (`../../../../etc/passwd`, `..%2f`, `....//`, sai phần mở
rộng, sai chữ hoa/thường, khoảng trắng thừa…) đều bị chặn, và mọi phản hồi được kiểm là
không rò nội dung hệ thống tệp. Kèm kiểm tra tile và descriptor đều **bắt buộc đăng nhập**
— app này chủ ý không có URL ảnh công khai nào.

### Smoke test model thật (P2 #24)
`pytest -m slow` chạy 2 test dùng checkpoint `.pt` và artifact Stage 3 thật: xác nhận
`registry.load()` còn nạp được, pipeline chạy tới cùng, mask đúng kích thước gốc và chỉ
dùng 6 màu hợp lệ; artifact Stage 3 vẫn đúng 8 đặc trưng. Đã chạy thật, xanh. Tách khỏi lần
chạy mặc định để bộ test chính không phụ thuộc file `.pt`.

### Đã hoàn tất
Toàn bộ P0, P1, P2 và kịch bản thủ công.
