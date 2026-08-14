# PRODUCT REQUIREMENTS DOCUMENT (PRD)
## ProstaAI — Version 3.0 (Thesis-Scoped Edition)

AI-assisted Web System for Prostate Cancer Gleason Grading
*Đồ án tốt nghiệp — Cử nhân/Kỹ sư Công nghệ Thông tin*

---

## 0. Ghi chú về phạm vi tài liệu (Scope Note)

Bản PRD này được tổ chức thành **hai lớp phạm vi** để tránh nhầm lẫn giữa "cái sẽ build và bảo vệ trong đồ án" và "tầm nhìn dài hạn nếu phát triển thành sản phẩm thật":

- **🟢 MVP — Thesis Scope**: Toàn bộ mục 1–11 mô tả hệ thống mà Sea thực sự thiết kế, xây dựng, huấn luyện model và demo được trong khuôn khổ đồ án (huấn luyện trên Google Colab Pro, kiến trúc 3 tầng, dữ liệu PANDA — Radboud).
- **🔵 Production Vision — Future Work**: Mục 12 gom toàn bộ các yêu cầu cấp bệnh viện thật (LIS/HIS, pilot lâm sàng, chữ ký số pháp lý, hạ tầng production) — được giữ lại như *định hướng phát triển*, không phải yêu cầu phải hoàn thành.

Việc tách bạch này giúp hội đồng đánh giá đúng những gì Sea thực sự làm, đồng thời cho thấy Sea hiểu rõ con đường từ "prototype nghiên cứu" đến "sản phẩm lâm sàng".

---

## 1. Product Overview

- **Tên sản phẩm**: ProstaAI
- **Mô tả**: ProstaAI là một ứng dụng web hỗ trợ (decision-support prototype) cho việc phân loại thang điểm Gleason trên ảnh sinh thiết tuyến tiền liệt nhuộm H&E, sử dụng hai model AI độc lập (Gland Segmentation và Gleason Classification) được tích hợp vào một hệ thống full-stack. Đây là **sản phẩm nghiên cứu/prototype** minh chứng tính khả thi của pipeline AI hỗ trợ chẩn đoán, **không phải thiết bị y tế đã được kiểm định** và không dùng để chẩn đoán thay bác sĩ trên bệnh nhân thật.
- **Phạm vi triển khai (MVP)**: Web app chạy độc lập (local hoặc cloud demo — ví dụ Render/Railway/VPS sinh viên), người dùng là bác sĩ/giảng viên/hội đồng thử nghiệm với ảnh mẫu từ tập dữ liệu công khai (PANDA) hoặc ảnh do người dùng tự tải lên.

## 2. Product Vision

Xây dựng và chứng minh tính khả thi kỹ thuật của một pipeline AI hai-giai-đoạn (segmentation → classification) cho bài toán Gleason grading, đóng gói trong một web app hoàn chỉnh có thể demo end-to-end:

- Chứng minh khả năng phát hiện vùng nghi ngờ ung thư (cancer region proposal) từ ảnh mô học.
- Chứng minh khả năng phân loại Gleason Pattern trên các vùng đã phát hiện.
- Xây dựng giao diện web trực quan cho phép tải ảnh, chạy suy diễn AI và xem kết quả có annotation.
- Đặt nền móng kiến trúc (data schema, API, pipeline) có thể mở rộng lên quy mô production sau này — nhưng không cam kết production trong đồ án.

## 3. Problem Statement & Core Problems Addressed

- **Thiếu công cụ hỗ trợ tự động dễ tiếp cận**: Phần lớn công cụ AI hỗ trợ Gleason grading hiện có yêu cầu ảnh WSI (Whole Slide Imaging) từ máy scan chuyên dụng, chi phí cao — không phù hợp với các cơ sở chỉ có ảnh chụp từ camera gắn kính hiển vi hoặc dữ liệu ảnh patch công khai.
- **Đánh giá Gleason mang tính chủ quan**: Có sự khác biệt đáng kể giữa các bác sĩ khi đọc cùng một tiêu bản (inter-observer variability) — đây là vấn đề đã được nhiều nghiên cứu ghi nhận, và là động lực học thuật cho đồ án.
- **Chọn dataset để có được nhãn phân đoạn theo lớp mô**: Đồ án dùng tập **PANDA** (Kaggle Prostate cANcer graDe Assessment) và **chỉ lấy các slide từ Radboud UMC**. PANDA đến từ hai cơ sở với quy ước gán nhãn khác nhau — mask của Karolinska thô hơn (chỉ nền/lành tính/ung thư), nên việc giới hạn ở Radboud chính là điều kiện để có mask **6 lớp** (nền, mô đệm, lành tính, Gleason 3/4/5). Nhờ đó bài toán segmentation là **semantic segmentation 6 lớp** chứ không phải chỉ đề xuất vùng nghi ngờ nhị phân.
- **Hệ thống hiện có đã lỗi thời và rời rạc**: Cơ sở y tế đang dùng một ứng dụng desktop nội bộ (WinForms/DevExpress) để quản lý ca bệnh và thu thập ảnh vi trường (Mã số, Họ tên, Tuổi, Kết luận, kèm ảnh chụp qua camera kính hiển vi theo cấu trúc Ca bệnh → Slide → Ảnh). Công cụ này **đã và đang thu thập dữ liệu thật** nhưng chạy độc lập trên máy cục bộ, không có AI hỗ trợ, không truy cập được từ xa, và dữ liệu không được chuẩn hóa để phục vụ nghiên cứu/huấn luyện model. Đây vừa là **động lực thực tế** cho đồ án (số hóa và nâng cấp công cụ đang dùng thật), vừa là **nguồn dữ liệu tiềm năng** để bổ sung/đối chiếu bên cạnh tập PANDA.

## 4. Product Goals

**🟢 Mục tiêu học thuật/kỹ thuật (đo được trong đồ án):**
- Xây dựng thành công 2 model AI (semantic segmentation 6 lớp mô + classification 4 lớp: lành tính và Gleason Pattern 3/4/5) đạt hiệu năng chấp nhận được trên tập test PANDA (xem mục 11).
- Xây dựng hệ thống web full-stack 3 tầng (Frontend – FastAPI Backend – Model Serving) hoạt động end-to-end: tải ảnh → tiền xử lý → suy diễn AI → hiển thị kết quả.
- Thiết kế pipeline 7 bước hoàn chỉnh: Image Acquisition → Preprocessing → Tissue Detection → Gland Segmentation → Gleason Classification → Score Aggregation → Visualization.
- Huấn luyện model có kiểm soát tái lập (checkpoint/resume, chia train/val/test 80/10/10 **theo subject** — cùng một lần chia được dùng chung cho cả segmentation và classification để không rò rỉ dữ liệu giữa hai nhánh) trong giới hạn tài nguyên Google Colab Pro.
- Xây dựng cơ chế **di trú dữ liệu (data migration)** từ hệ thống desktop hiện có (Ca bệnh → Slide → Ảnh) vào cơ sở dữ liệu của hệ thống web mới, kèm bước ẩn danh hóa dữ liệu bệnh nhân thật trước khi dùng cho demo/nghiên cứu.

**🔵 Mục tiêu định hướng dài hạn (không bắt buộc trong đồ án — xem mục 12):**
- Chuẩn hóa theo tiêu chuẩn ISUP/WHO cho triển khai lâm sàng thật.
- Tích hợp LIS/HIS, chữ ký số pháp lý, pilot tại bệnh viện thật.

## 5. Scope of Work (MVP)

- Module tải ảnh & quản lý ca bệnh cơ bản (không cần đa vai trò phức tạp).
- Module tiền xử lý ảnh H&E (color normalization, tissue detection, kiểm tra chất lượng ảnh cơ bản).
- Module AI Inference: chạy model segmentation → model classification → tổng hợp điểm Gleason.
- Module hiển thị kết quả trực quan: overlay mask + heatmap Gleason Pattern lên ảnh gốc.
- Module lưu trữ kết quả cơ bản (SQLite): lịch sử các lần chạy, ảnh đã upload, kết quả AI.
- (Tùy chọn nếu còn thời gian) Cho phép người dùng chỉnh sửa/ghi chú thủ công lên kết quả AI để mô phỏng luồng "bác sĩ duyệt".

*Các mục sau đây được chuyển sang Production Vision vì không khả thi trong phạm vi đồ án: RBAC nâng cao đa vai trò, tích hợp LIS/HIS, chữ ký số có giá trị pháp lý, audit log không thể xóa cấp doanh nghiệp, triển khai on-premise 24/7.*

## 6. User Roles & Permissions (MVP — đơn giản hóa)

Vì đồ án không có nhiều người dùng thật đồng thời, MVP chỉ cần **2 vai trò cơ bản**, đủ để demo khái niệm phân quyền mà không cần xây dựng RBAC phức tạp:

- **User (Bác sĩ/Người dùng thử nghiệm)**: Tải ảnh, chạy phân tích AI, xem/điều chỉnh kết quả, xem lịch sử các lần chạy của chính mình.
- **Admin (tùy chọn, nếu còn thời gian)**: Xem toàn bộ lịch sử hệ thống, theo dõi trạng thái model.

*(RBAC chi tiết theo khoa/phòng ban, khóa tài khoản, sao lưu dữ liệu — chuyển sang mục 12, chỉ cần thiết khi triển khai đa người dùng thật.)*

## 7. User Journey (MVP)

Đăng nhập (hoặc dùng thử không cần đăng nhập) → Tải ảnh vi trường H&E lên → Hệ thống tự động tiền xử lý (chuẩn hóa màu, kiểm tra chất lượng) → Chạy pipeline AI (segmentation → classification) → Hiển thị kết quả: ảnh gốc + mask phân đoạn + heatmap Gleason Pattern + điểm tổng hợp → Người dùng xem/ghi chú kết quả → Lưu lại lịch sử ca xử lý.

## 8. Functional Modules Detail (MVP)

### 8.1. Authentication (đơn giản hóa)
- Đăng nhập cơ bản bằng JWT (không bắt buộc đổi mật khẩu định kỳ trong MVP).
- Mã hóa mật khẩu bằng BCrypt — giữ nguyên vì đây là best practice cơ bản, không tốn nhiều công sức triển khai.

### 8.2. Dashboard (đơn giản hóa)
- Danh sách các lần xử lý đã thực hiện (thay cho "Doctor Dashboard" phức tạp).
- Trạng thái xử lý hiện tại (đang chạy / hoàn thành / lỗi) — vì pipeline AI có thể mất vài giây đến vài chục giây tùy phần cứng demo.

### 8.3. Case Management (kế thừa cấu trúc từ hệ thống desktop hiện có)
- **Phân cấp dữ liệu** (giữ nguyên logic của ứng dụng desktop đang dùng thật, chỉ chuyển lên nền web):
  - **Ca bệnh (Case)**: Mã số, Mã năm, Họ tên bệnh nhân, Tuổi, Kết luận (chẩn đoán tổng hợp dạng text).
  - **Slide**: mỗi ca có thể gồm nhiều slide vật lý (hệ thống cũ hỗ trợ tối đa 12 slide, nhóm hiển thị theo cặp — MVP web kế thừa giới hạn này làm mặc định, có thể nới lỏng nếu cần).
  - **Ảnh chụp**: mỗi slide có thể có nhiều ảnh vi trường (hệ thống cũ giới hạn 8 ảnh/slide), mỗi ảnh kèm mô tả (xem chi tiết ở mục 8.4).
- **Danh sách ca bệnh (tương đương FrmCaseList)**: bảng danh sách với tìm kiếm/lọc theo Mã số, Họ tên, Tuổi, Kết luận, Ngày tạo — dùng component bảng dữ liệu chuẩn của frontend (không cần thư viện DevExpress, có thể dùng bảng React với filter/sort tương đương).
- **Thêm/sửa ca bệnh (tương đương FrmCase)**: form nhập Mã số, Mã năm, Họ tên bệnh nhân, Tuổi, Kết luận, và danh sách các slide thuộc ca.
- **Xuất thư viện (tương đương "Xuất thư viện")**: chức năng export dữ liệu ảnh + nhãn ra định dạng phục vụ nghiên cứu/huấn luyện (ví dụ CSV/JSON kèm đường dẫn ảnh) — hữu ích để đóng gói dữ liệu thật này thành tập dữ liệu bổ sung cho việc huấn luyện/đánh giá model, sau khi đã ẩn danh hóa.

**Module mới — Di trú dữ liệu từ hệ thống cũ (Legacy Data Migration)**:
- Vì hệ thống desktop hiện tại đang có dữ liệu thật (ảnh + chẩn đoán), cần một script/module import để đưa dữ liệu này vào database của hệ thống web mới.
- Các bước cần làm rõ trước khi triển khai (Sea cần kiểm tra thực tế):
  1. Xác định engine/định dạng lưu trữ hiện tại của ứng dụng desktop (thường là SQL Server, SQL Server Compact, SQLite hoặc file access cục bộ — cần mở project desktop hoặc file cấu hình để xác nhận).
  2. Xác định vị trí lưu file ảnh (local folder, đường dẫn theo Case/Slide) để viết script copy/liên kết ảnh sang storage mới.
  3. Kiểm tra chất lượng trường **"Kết Luận"**: đây hiện là text tự do — cần đánh giá xem có thể/nên trích xuất Gleason Pattern có cấu trúc từ đó hay không, hay giữ nguyên dạng ghi chú tự do và bổ sung các trường Gleason có cấu trúc riêng.
  4. Ẩn danh hóa: khi dùng dữ liệu này cho mục đích huấn luyện/nghiên cứu/demo trước hội đồng, cần loại bỏ hoặc mã hóa Họ tên bệnh nhân, chỉ giữ mã ca bệnh ẩn danh — vì đây là dữ liệu bệnh nhân thật, không phải dữ liệu công khai như PANDA (xem mục 9.3).
- **Giá trị học thuật**: Nếu số lượng ca đủ lớn và trường "Kết Luận" có thể chuẩn hóa thành nhãn Gleason, đây có thể trở thành **tập dữ liệu thật bổ sung** để đánh giá model (ngoài PANDA) — một điểm cộng lớn cho đồ án vì chứng minh được model hoạt động trên dữ liệu lâm sàng thật, không chỉ dataset benchmark công khai. Tuy nhiên **không nên cam kết chắc chắn điều này trong PRD** cho đến khi Sea đã kiểm tra thực tế số lượng ca, chất lượng nhãn, và xin được phép sử dụng dữ liệu (xem lưu ý đạo đức/pháp lý bên dưới).

*Tích hợp LIS/HIS chuẩn HL7 (đồng bộ tự động với hệ thống bệnh viện khác) vẫn chuyển sang mục 12 — khác với việc kế thừa dữ liệu từ chính ứng dụng desktop nội bộ này, vốn khả thi vì Sea có quyền truy cập trực tiếp.*

**⚠️ Lưu ý đạo đức/pháp lý quan trọng**: Vì đây là dữ liệu bệnh nhân thật (có họ tên, tuổi, chẩn đoán), Sea cần xác nhận với cơ sở y tế/giảng viên hướng dẫn về việc: (1) có được phép sử dụng dữ liệu này cho mục đích huấn luyện AI và trình bày trong đồ án hay không, (2) có cần quy trình xin phép/ẩn danh hóa theo quy định của cơ sở y tế đó hay không. Đây là điều kiện tiên quyết trước khi đưa dữ liệu thật vào bất kỳ phần nào của hệ thống hoặc báo cáo.

### 8.4. Image Reception & Preprocessing
- **Nguồn ảnh đầu vào**: Ảnh vi trường được thu nhận qua một công cụ chụp ảnh từ camera gắn kính hiển vi (tham khảo giao diện FrmCapture), gắn với từng **Slide** thuộc một **Ca bệnh** (xem cấu trúc phân cấp ở mục 8.3), với luồng thao tác:
  - Khung xem trước (Live Preview) hiển thị hình ảnh trực tiếp từ camera kính hiển vi.
  - Người dùng nhấn nút **"Lưu"** để chụp lại khung hình đang hiển thị thành ảnh tĩnh.
  - Mỗi ảnh chụp có thể kèm theo một **ô Mô tả (ghi chú)** — ví dụ vị trí sinh thiết, đặc điểm quan sát được.
  - Cho phép chụp **tối đa 8 ảnh (Hình 1–Hình 8) cho mỗi Slide**, hiển thị dưới dạng dải thumbnail để người dùng xem lại và chọn ảnh trước khi đưa vào pipeline AI.
  - *(MVP)*: Nếu dùng lại được dữ liệu ảnh đã có sẵn từ hệ thống desktop (qua module Di trú dữ liệu ở 8.3), chức năng chụp trực tiếp có thể **không cần triển khai lại từ đầu** trong giai đoạn đầu của MVP — ưu tiên import ảnh có sẵn trước, sau đó mới bổ sung upload ảnh mới/live capture nếu còn thời gian. Việc tích hợp camera trực tiếp qua SDK/driver phần cứng (thay vì dùng lại app desktop song song) chuyển sang Production Vision (mục 12).
- Định dạng hỗ trợ: JPG, PNG, TIFF.
- Tiền xử lý tự động:
  - Color Normalization (Macenko hoặc Reinhard) — đã có trong pipeline hiện tại.
  - Tissue Detection (phân biệt vùng mô với nền/background).
  - Kiểm tra chất lượng cơ bản (phát hiện ảnh quá mờ bằng biến thiên Laplacian) — mức đơn giản, không cần thuật toán vignetting correction phức tạp trừ khi ảnh mẫu thực sự bị lỗi.
- Lưu metadata: ngày tải lên, độ phân giải, độ phóng đại (nếu người dùng nhập).

### 8.5. AI Analysis Engine
- **Pipeline 7 bước** (đã thiết kế và đang huấn luyện):
  1. Image Acquisition
  2. Preprocessing
  3. Tissue Detection
  4. Tissue Segmentation (PyTorch qua `segmentation-models-pytorch`, encoder EfficientNet_b0 / DenseNet121; output: **mask semantic 6 lớp** — nền, mô đệm, lành tính, Gleason 3/4/5)
  5. Gleason Classification (4 lớp: lành tính và Pattern 3/4/5, chỉ chạy trên các patch mà segmentation đã đánh dấu là mô liên quan ung thư)
  6. Score Aggregation (tổng hợp Primary/Secondary Pattern → Total Gleason Score → Grade Group theo công thức ISUP — đây là **phép tính quy tắc**, không phải model AI riêng)
  7. Visualization (sinh overlay mask + heatmap)
- **Output AI (đã kiểm chứng khả thi với nhãn dataset hiện có)**:
  - Mask phân đoạn 6 lớp (nền / mô đệm / lành tính / Gleason 3 / 4 / 5), lưu dưới dạng PNG không mất dữ liệu.
  - Gleason Pattern Area (Pattern 3/4/5) kèm Confidence Score.
  - Grade Group (tính toán, không phải dự đoán).

**⚠️ Điều chỉnh quan trọng so với v2**: PNI (Perineural Invasion) và LVI (Lymphovascular Invasion) **không phải output của AI** vì PANDA không có nhãn này. Hai trường này chuyển thành **trường nhập tay** ở mục 8.6 bên dưới, mô phỏng luồng làm việc thật của bác sĩ mà không cường điệu khả năng model.

### 8.6. Review & Diagnostic Fields (đơn giản hóa)
- Người dùng xem kết quả AI, có thể chỉnh sửa nhãn (nếu còn thời gian triển khai công cụ vẽ lại vùng).
- Trường lưu trữ:
  - Vị trí sinh thiết (nhập tay, tùy chọn).
  - Primary/Secondary Gleason Pattern (từ AI, cho phép sửa).
  - Total Score & Grade Group (tính tự động theo Primary+Secondary).
  - Tỷ lệ phần trăm vùng ung thư (tính từ diện tích mask/tổng diện tích mô).
  - **PNI/LVI**: trường nhập tay (checkbox + ghi chú), không phải output AI.
  - Ghi chú tự do.
- **Ký số**: đổi thành "Xác nhận kết quả" (Confirm & Lock) — đóng băng bản ghi trong hệ thống demo, **không tuyên bố giá trị pháp lý y khoa** vì điều đó đòi hỏi hạ tầng PKI/CA được công nhận nằm ngoài phạm vi đồ án.

### 8.7. Image Viewer (giữ phần lõi, giảm độ phức tạp)
- Zoom, Pan, bật/tắt layer overlay (ảnh gốc / mask / heatmap) — đây là phần khả thi và có giá trị demo cao, nên giữ.
- Side-by-side view — khả thi, giữ lại.
- Digital Caliper/Ruler — **tùy chọn (nice-to-have)**: chỉ triển khai nếu có thời gian, vì cần thông số độ phóng đại camera chính xác để đo đúng đơn vị µm — nếu không có calibration thật, số đo sẽ không đáng tin cậy, nên ghi rõ "ước lượng, không phải đo lường y khoa chính xác" nếu triển khai.

### 8.8. Report Export
- Xuất PDF/HTML đơn giản: thông tin ca, ảnh + overlay, điểm Gleason, ghi chú. Dùng thư viện PDF thông thường (ví dụ WeasyPrint/ReportLab), không cần định dạng "chuẩn hóa y khoa" phức tạp.

### 8.9. History & Log (đơn giản hóa)
- Lưu lịch sử các lần chạy: ai chạy, khi nào, kết quả gì, có sửa hay không.
- **Bỏ yêu cầu "audit log không thể xóa cấp doanh nghiệp"** trong MVP — chỉ cần log cơ bản trong SQLite, đủ để demo khái niệm truy vết.

## 9. Non-functional Requirements (MVP — có thể đo được)

### 9.1. Performance
- Thời gian suy diễn AI: đo thực tế trên phần cứng demo cụ thể (ví dụ: GPU T4 trên Colab, hoặc CPU nếu demo local) — **ghi rõ cấu hình đo**, không đưa ra con số tuyệt đối không kèm ngữ cảnh.
- Độ trễ UI: mục tiêu trải nghiệm mượt (không cam kết số ms cụ thể trừ khi đã benchmark thật).

### 9.2. Reliability (đơn giản hóa)
- Xử lý lỗi cơ bản: nếu AI inference lỗi, hệ thống hiển thị thông báo lỗi rõ ràng và cho phép chạy lại — không cần cơ chế hàng đợi chịu lỗi cấp production.
- *(Bỏ yêu cầu "hoạt động độc lập 24/7" — không có ý nghĩa với một demo/thesis project.)*

### 9.3. Security (mức cơ bản hợp lý)
- HTTPS khi deploy public demo.
- Mật khẩu hash bằng BCrypt.
- **Dữ liệu công khai (PANDA)**: không có vấn đề PII vì đã ẩn danh sẵn.
- **Dữ liệu thật từ hệ thống desktop (qua module Di trú dữ liệu, mục 8.3)**: đây là dữ liệu bệnh nhân thật (Họ tên, Tuổi, Kết luận), nên bắt buộc:
  - Ẩn danh hóa (loại bỏ hoặc mã hóa Họ tên, chỉ giữ mã ca bệnh) trước khi dùng cho huấn luyện model, demo công khai, hoặc đưa vào báo cáo/slide bảo vệ đồ án.
  - Không public demo (link công khai không yêu cầu đăng nhập) nếu hệ thống còn chứa dữ liệu chưa ẩn danh.
  - Có disclaimer rõ ràng nếu người dùng khác (giảng viên/hội đồng) được cấp quyền truy cập thử hệ thống với dữ liệu thật.

## 10. Technology Stack (MVP — khớp với những gì đã build)

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Frontend | React (TypeScript) hoặc React đơn giản + TailwindCSS | Giữ nguyên, không cần ShadCN đầy đủ nếu tốn thời gian |
| Backend API | FastAPI (Python) | Giữ nguyên |
| Xử lý bất đồng bộ | FastAPI BackgroundTasks (thay vì Celery+Redis) | Đủ cho quy mô demo 1 người dùng tại một thời điểm; Celery/Redis chuyển sang Production Vision |
| AI / Deep Learning | PyTorch, `torchvision` (classification), `segmentation-models-pytorch` (segmentation) | Khớp với notebook đã xây dựng |
| Image Processing | OpenCV / Histolab (Macenko normalization) | Giữ nguyên |
| Database | **SQLite** | Khớp với kiến trúc 3 tầng đã thống nhất; đủ cho demo, không cần PostgreSQL |
| File Storage | Local File System | Không cần MinIO cho quy mô demo |
| Containerization | Docker (tùy chọn, cho tiện triển khai demo) | Không bắt buộc Docker Compose full stack nhiều service |

*Toàn bộ Postgres/MinIO/Celery/Redis/on-premise Docker Compose multi-service chuyển sang mục 12 — là lựa chọn đúng nếu sau này phát triển thành sản phẩm thật, nhưng không cần thiết để chứng minh luận điểm của đồ án.*

## 11. Success Metrics (MVP — đo được trong phạm vi đồ án)

**Chỉ số AI (đo trên tập test PANDA, chia 80/10/10 theo subject — xem lưu ý bên dưới):**
- Segmentation: pixel accuracy, mean IoU, mean DSC, tính trên 4 lớp mô (lành tính, Gleason 3/4/5); nền và mô đệm không tính vào điểm.
- Classification: accuracy, F1, precision, sensitivity, specificity (macro) trên 4 lớp — lành tính và Gleason Pattern 3/4/5.
- **Lưu ý phương pháp, bắt buộc nêu khi báo cáo**: bài báo tham chiếu dùng 5-fold cross-validation theo subject; đồ án này dùng **một lần chia 80/10/10 tĩnh** (đánh đổi vì giới hạn thời gian/tài nguyên Colab), nên **không so trực tiếp** các con số Accuracy/F1 ở đây với bảng của bài báo.
- *(Bỏ yêu cầu "Cohen's Kappa so với hội đồng chuyên gia" trừ khi Sea thực sự có bác sĩ hợp tác đánh giá lại — nếu có, đây sẽ là điểm cộng rất lớn cho đồ án, nhưng không nên đặt làm chỉ số bắt buộc.)*

**Chỉ số hệ thống:**
- Pipeline chạy end-to-end thành công (upload → kết quả) không lỗi trên tập ảnh demo.
- Thời gian xử lý trung bình một ảnh, đo thực tế trên phần cứng cụ thể.

**Chỉ số trình bày (giá trị học thuật):**
- Có thể trực quan hóa kết quả rõ ràng (overlay, heatmap) — quan trọng cho việc bảo vệ đồ án vì hội đồng cần "nhìn thấy" AI hoạt động.

## 12. 🔵 Production Vision — Future Work (không thuộc phạm vi đồ án)

Phần này giữ lại nguyên vẹn tinh thần của bản PRD v2 như một **định hướng phát triển sau đồ án**, thể hiện Sea đã suy nghĩ đến việc đưa hệ thống ra thực tế:

- Tích hợp LIS/HIS chuẩn HL7, đồng bộ dữ liệu hành chính bệnh nhân thật.
- RBAC đầy đủ theo khoa/phòng ban, quản trị viên bệnh viện, sao lưu/khôi phục dữ liệu.
- Chữ ký số có giá trị pháp lý y khoa (yêu cầu CA được công nhận).
- Audit Log không thể xóa cấp doanh nghiệp, phục vụ rà soát lỗi y khoa.
- Hạ tầng production: PostgreSQL, MinIO, Celery + Redis, Docker Compose multi-service, triển khai on-premise 24/7 tại bệnh viện.
- Mở rộng nhãn dữ liệu để dự đoán PNI/LVI bằng AI (cần dataset có nhãn tương ứng, hợp tác với khoa Giải phẫu bệnh để gán nhãn).
- Nghiên cứu đánh giá Cohen's Kappa với hội đồng chuyên gia, đo lường giảm inter-observer variance thực tế.
- Pilot Deployment thật tại một khoa Giải phẫu bệnh, với dữ liệu ảnh chụp từ camera kính hiển vi thực tế của bệnh viện.
- Tích hợp trực tiếp SDK/driver camera kính hiển vi (live capture, tương tự công cụ FrmCapture tham khảo) thay vì luồng upload ảnh tĩnh thủ công của MVP.

## 13. Roadmap (Thesis Timeline — thực tế)

- **Giai đoạn 1 — Nền tảng & Dữ liệu** *(đã hoàn thành phần lớn)*: Phân tích dataset PANDA (lọc riêng slide Radboud, QC nhiều bước), thiết kế bài toán segmentation 6 lớp, xây dựng notebook training PyTorch với đầy đủ hạ tầng huấn luyện (mixed precision, chia 80/10/10 theo subject, checkpoint/resume, early stopping).
  - *(Bổ sung mới)*: Khảo sát database của hệ thống desktop hiện có (engine lưu trữ, số lượng ca/slide/ảnh thực tế, chất lượng trường "Kết Luận") để đánh giá khả năng dùng làm dữ liệu bổ sung; xác nhận với cơ sở y tế về việc được phép sử dụng dữ liệu.
- **Giai đoạn 2 — Huấn luyện & Đánh giá Model**: Hoàn tất huấn luyện 2 model trên Colab Pro, đánh giá kết quả trên tập test, ghi nhận số liệu cho báo cáo.
- **Giai đoạn 3 — Xây dựng Web App (3 tầng)**: FastAPI backend + model serving (SQLite), frontend cơ bản, pipeline upload → inference → hiển thị kết quả. Xây dựng module Case Management (Ca bệnh → Slide → Ảnh) và script di trú dữ liệu từ hệ thống desktop.
- **Giai đoạn 4 — Hoàn thiện demo & Viết báo cáo**: Hoàn thiện Image Viewer (overlay, side-by-side), export báo cáo PDF đơn giản, chuẩn bị demo trực tiếp cho hội đồng, viết phần "Hướng phát triển" dựa trên mục 12.

---

*Tài liệu này thay thế PRD v2.0 cho mục đích đồ án tốt nghiệp. Mục 12 được giữ lại nguyên trạng để dùng làm phần "Hướng phát triển" trong báo cáo luận văn.*
