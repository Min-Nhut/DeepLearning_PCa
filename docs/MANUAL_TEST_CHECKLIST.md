# Kịch bản kiểm thử thủ công — ProstaAI

Phần tự động hoá phủ logic và API ([docs/TEST_PLAN.md](TEST_PLAN.md) — 203 test backend +
29 test frontend). Tài liệu này phủ phần còn lại: **giao diện, tương tác và thiết bị**, là
những thứ không đáng hoặc không thể tự động hoá trong phạm vi đề tài.

Ba mục **B6, B7 và E8b** là chốt hồi quy cho ba lỗi giao diện đã sửa nhưng nằm trong
component nên không có test tự động — đừng bỏ qua chúng.

Chạy trọn bộ trước mỗi mốc nộp. Thời lượng ~30 phút.

## Chuẩn bị

| | |
|---|---|
| Backend | `cd backend && uvicorn app.main:app --port 8000` |
| Cổng Bác sĩ | `cd frontend && npm run dev` → http://localhost:5173 |
| Cổng Quản trị | `npm run dev:admin --prefix frontend` → http://localhost:5174 |
| Tài khoản | bác sĩ `lam.nguyen@benhvien.vn` / admin `admin@prostaai.vn` |
| Ảnh test | 1 ảnh WSI PANDA (`.tiff`) + 1 ảnh chụp nhỏ (JPG/PNG) |

> **Không dùng ca bệnh thật để test.** Tạo ca riêng, xoá sau khi xong.

---

## A. Hai cổng và phiên đăng nhập

| # | Bước | Kỳ vọng | Đạt |
|---|---|---|---|
| A1 | Mở 5173, đăng nhập tài khoản bác sĩ | Vào Tổng quan, nhãn "Cổng Bác sĩ" ở thanh bên | ☐ |
| A2 | Mở 5174 ở tab khác, đăng nhập admin | Vào Tổng quan hệ thống, nhãn "Cổng Quản trị" | ☐ |
| A3 | Quay lại tab 5173, tải lại trang | **Phiên bác sĩ còn nguyên**, không bị đá ra đăng nhập | ☐ |
| A4 | Ở 5174 đăng xuất, thử đăng nhập tài khoản **bác sĩ** | Báo "Tài khoản này thuộc Cổng Bác sĩ…" + link chuyển; không vào được | ☐ |
| A5 | Bấm link "Mở Cổng Quản trị" ở thanh bên cổng bác sĩ | Mở tab mới sang 5174, phiên hiện tại không bị ảnh hưởng | ☐ |

## B. Ca bệnh, slide, ảnh

| # | Bước | Kỳ vọng | Đạt |
|---|---|---|---|
| B1 | Tạo ca bệnh mới | Vào màn hình chi tiết ca | ☐ |
| B2 | Bấm "Thêm slide mới" 2 lần | Có 2 slide, nhãn "Slide 1-2" và "Slide 3-4" | ☐ |
| B3 | Bấm mũi tên xuống ở slide đầu | Hai slide đổi chỗ, **nhãn đi theo slide của nó** | ☐ |
| B4 | Bấm mũi tên lên ở slide đang đứng đầu | Nút bị khoá (không bấm được) | ☐ |
| B5 | "Chụp / Thêm ảnh" → chọn độ phóng đại 40x → tải ảnh WSI lên | Ảnh hiện trong lưới, có nhãn "40x" | ☐ |
| B6 | Vào màn hình Tải ảnh, mở ô chọn slide, chọn "**+ Slide mới**" | Tạo slide mới và tự chọn nó (đây là chỗ từng không phản hồi) | ☐ |
| B7 | Tắt backend, bấm "Thêm slide mới" | Hiện **thông báo lỗi đỏ**, không im lặng. Bật lại backend | ☐ |
| B8 | Xoá một ảnh (nút ×) | Hỏi xác nhận, ảnh biến mất | ☐ |
| B9 | Xoá một slide còn ảnh | Hộp xác nhận **nêu đúng số ảnh** sẽ mất | ☐ |

## C. Pipeline AI và trình xem

| # | Bước | Kỳ vọng | Đạt |
|---|---|---|---|
| C1 | Ở ảnh chưa chạy AI, bấm "Kết quả AI" | Hiện lời mời chạy phân tích, **không phải banner lỗi** | ☐ |
| C2 | Chạy phân tích, chọn model phân đoạn + phân loại | Chỉ hiện model có checkpoint, kèm chỉ số thật | ☐ |
| C3 | Chờ chạy xong | Trạng thái đổi pending → running → completed, không có bước giả | ☐ |
| C4 | Bật lớp "Mặt nạ AI" | Mask chồng lên mô, **vẫn thấy mô hồng bên dưới** | ☐ |
| C5 | Xem chú giải màu | 6 lớp: Nền / Mô đệm / Lành tính / Pattern 3 / 4 / 5, màu khớp mask | ☐ |
| C6 | Kéo thanh độ mờ | Cả mask AI và mask thủ công đổi độ mờ cùng lúc | ☐ |
| C7 | Tắt hết lớp phủ | Chú giải màu biến mất | ☐ |
| C8 | Phóng to sâu vào ảnh WSI (cuộn chuột) | **Thấy rõ cấu trúc tuyến**, không vỡ hạt | ☐ |
| C9 | Kéo để di chuyển, nhấp đúp để phóng | Mượt như bản đồ, lớp phủ dịch chuyển theo đúng vị trí | ☐ |

## D. Đo đạc và đánh dấu thủ công

| # | Bước | Kỳ vọng | Đạt |
|---|---|---|---|
| D1 | Chưa hiệu chỉnh: dùng "Đo khoảng cách", nhấp 2 điểm | Hiện **pixel** kèm ghi chú "chưa hiệu chỉnh", **không bịa mm** | ☐ |
| D2 | Vào cổng admin → Model AI → nhập µm/pixel cho 40x | Lưu được từng độ phóng đại riêng | ☐ |
| D3 | Quay lại đo lại | Hiện mm thật + nút "Lưu vào báo cáo" | ☐ |
| D4 | "Vẽ / sửa mask thủ công" → giữ và kéo vẽ một vùng | Vùng được **lưu ngay** khi thả tay, rồi mới hỏi pattern | ☐ |
| D5 | Chọn vùng đã vẽ → "Sửa hình dạng" → kéo một đỉnh → Lưu | Hình đổi đúng theo đỉnh đã kéo | ☐ |
| D6 | Về trình xem, bật lớp "Mask thủ công" | Vùng hiện đúng vị trí và đúng màu pattern | ☐ |

## E. Chẩn đoán và báo cáo

| # | Bước | Kỳ vọng | Đạt |
|---|---|---|---|
| E1 | Sửa Primary/Secondary khác với AI | Nút đổi thành "Đồng ý với AI" | ☐ |
| E2 | Bấm "Đồng ý với AI" | Ô chọn nhảy về giá trị AI, điểm Gleason tính lại | ☐ |
| E3 | Tích PNI / LVI, nhập ghi chú, bấm "Lưu" | Lưu thành công (chỉ lưu khi bấm, không tự lưu) | ☐ |
| E4 | Tích "Cần hội chẩn" + ghi chú → Lưu | Xuất hiện ở thẻ "Cần hội chẩn" trên Tổng quan | ☐ |
| E5 | Bấm dòng đó ở Tổng quan | Mở đúng ảnh đó trong trình xem | ☐ |
| E6 | "Xác nhận & khóa" | Form bị khoá, huy hiệu đổi "Đã khóa" | ☐ |
| E7 | "Xem báo cáo" | Hiện dữ liệu thật, **không có chữ ký bác sĩ bịa** | ☐ |
| E8 | Kiểm tra báo cáo có diện tích ung thư và chiều dài u | Hiện số thật, không phải "Chưa có…" | ☐ |
| E8b | Đọc "Độ tin cậy AI" ở cả trình xem và báo cáo | Phần trăm hợp lý (vd 68%), **không phải 1%** — độ tin cậy lưu dạng 0–1, từng bị hiển thị thiếu nhân 100 | ☐ |
| E9 | Bấm "In" | Mở hộp thoại in của trình duyệt | ☐ |
| E10 | Về chi tiết ca | Điểm Gleason **cấp ca** + dòng "x/y ảnh đã xác nhận" | ☐ |

## F. Quản trị

| # | Bước | Kỳ vọng | Đạt |
|---|---|---|---|
| F1 | Tổng quan hệ thống | Số liệu thật, hoạt động gần đây có mục vừa làm ở trên | ☐ |
| F2 | Người dùng → tạo tài khoản mới | Tạo được; mật khẩu dưới 8 ký tự bị từ chối | ☐ |
| F3 | Bấm huy hiệu trạng thái của một user | Đổi khoá/mở, tải lại vẫn giữ trạng thái | ☐ |
| F4 | Lịch sử & Log | Có bản ghi cho các thao tác vừa thực hiện | ☐ |
| F5 | Di trú dữ liệu → CSV: xem trước rồi nhập | Ánh xạ cột đúng; dòng thiếu mã số bị bỏ qua, các dòng khác vẫn vào | ☐ |
| F6 | Di trú dữ liệu → chọn nhầm file không phải `.db` | Báo lỗi rõ ràng, không phải lỗi 500 | ☐ |
| F7 | Xuất thư viện | Tải được file; mở ra **không có cột họ tên bệnh nhân** | ☐ |
| F8 | Mở Console trình duyệt, gọi `fetch('http://localhost:8000/api/admin/stats')` bằng token bác sĩ | Trả **403** — ẩn menu không phải là phân quyền | ☐ |

## G. Dọn dẹp

| # | Bước | Đạt |
|---|---|---|
| G1 | Xoá toàn bộ ca bệnh test vừa tạo | ☐ |
| G2 | Xoá tài khoản test (hoặc khoá lại) và dòng hiệu chỉnh test | ☐ |
| G3 | Xác nhận ca bệnh thật không bị đụng | ☐ |

---

## Không kiểm được ở máy phát triển — phải ghi rõ trong luận văn

1. **Chụp ảnh trực tiếp từ camera kính hiển vi.** Máy phát triển không có thiết bị; chỉ
   kiểm được nhánh xử lý khi không có camera / bị từ chối quyền. Cần chạy lại trên máy
   thật có camera gắn vào.
2. **Ảnh chụp màn hình tự động.** Khung xem của trình duyệt automation không kết xuất
   khung hình, nên mọi ảnh minh hoạ trong luận văn phải chụp thủ công.
3. **Độ chính xác lâm sàng.** Không có kịch bản nào ở đây đánh giá model đúng hay sai —
   xem [TEST_PLAN.md §1](TEST_PLAN.md).

## Ghi kết quả

| Nhóm | Số mục | Đạt | Không đạt | Ghi chú |
|---|---|---|---|---|
| A. Hai cổng | 5 | | | |
| B. Ca/slide/ảnh | 9 | | | |
| C. Pipeline AI & trình xem | 9 | | | |
| D. Đo đạc & đánh dấu | 6 | | | |
| E. Chẩn đoán & báo cáo | 11 | | | |
| F. Quản trị | 8 | | | |
| **Tổng** | **48** | | | |

Người kiểm thử: ……………………  Ngày: ……………  Phiên bản/commit: ……………………
