# Sơ đồ chương Thiết kế hệ thống

Sáu sơ đồ cho chương Thiết kế, dựng trực tiếp từ mã nguồn và lược đồ cơ sở dữ liệu
đang chạy. Mỗi sơ đồ có hai định dạng: `.svg` (vector, dùng cho Word 2016+) và `.png`
300 DPI (dùng cho Word bản cũ hoặc khi nộp bản in).

| # | Sơ đồ | Tệp | Nội dung |
|---|---|---|---|
| 1 | Kiến trúc ba tầng | `architecture_diagram.svg` | React 19 → FastAPI → SQLite, kèm phân hệ AI và kho tệp |
| 2 | Quan hệ thực thể (ERD) | `erd_diagram.svg` | **14 bảng**, đầy đủ cột, khóa chính/ngoại và quan hệ 1–N |
| 3 | Use case | `usecase_diagram.svg` | Bác sĩ, Quản trị viên, camera, phần mềm cũ |
| 4 | Luồng nghiệp vụ | `workflow_diagram.svg` | Ba làn: bác sĩ → hệ thống → quy trình AI, từ tạo ca đến in phiếu |
| 5 | Biểu đồ tuần tự — chạy phân tích AI | `sequence_diagram.svg` | Một yêu cầu phân tích AI, từ nút bấm tới kết quả |
| 6 | Phân quyền & tách cổng | `authorization_diagram.svg` | Chuỗi kiểm tra trên mọi yêu cầu, ranh giới hai cổng |

Bốn hình bổ sung cho chương AI:

| # | Hình | Tệp | Nội dung |
|---|---|---|---|
| 7 | Luồng dữ liệu qua ba giai đoạn AI | `pipeline_dataflow.svg` | Kích thước tensor trên từng bước, cổng lọc giữa GĐ1 và GĐ2, nhánh độc lập của GĐ3 |
| 8 | Ảnh hưởng của sai tỉ lệ vật lý | `chart_scale_ablation.svg` | Độ chính xác và độ tin cậy theo ba điều kiện thí nghiệm |
| 9 | Sụp đổ theo từng lớp mô | `chart_scale_per_class.svg` | Chỉ lớp lành tính sống sót khi sai tỉ lệ |
| 10 | Chuẩn bị dữ liệu và chia tập | `dataset_split_diagram.svg` | PANDA → lọc Radboud → kiểm soát chất lượng → chia 80/10/10 theo ca |

Hình 7, 8, 9, 10 dựng bằng `python docs/diagrams/gen_ai_figs.py`.

Năm biểu đồ tuần tự cho các chức năng còn lại:

| # | Chức năng | Tệp | Điểm đáng chú ý |
|---|---|---|---|
| 11 | Đăng nhập và thiết lập phiên | `sequence_login.svg` | Khóa sau 5 lần sai, kiểm tra vai trò có thuộc cổng đang mở |
| 12 | Tải ảnh lên / chụp trực tiếp | `sequence_upload.svg` | Đọc theo khối, xác thực bằng Pillow, tiền xử lý chạy ở luồng phụ |
| 13 | Đánh giá, xác nhận, tổng hợp cấp ca | `sequence_review.svg` | 404 là “chưa có” chứ không phải lỗi; 423 khi đã khóa |
| 14 | Xem tiêu bản thu phóng sâu | `sequence_deepzoom.svg` | Tháp lát ảnh sinh lười một lần; mọi lát đều qua kiểm tra xác thực |
| 15 | Di trú dữ liệu từ hệ thống cũ | `sequence_migration.svg` | Xem trước không ghi; mỗi dòng một điểm lưu riêng |

Hình 11–15 dựng bằng `python docs/diagrams/gen_sequences.py`.

Đặc tả chi tiết bốn use case trọng tâm: [`DAC_TA_USECASE.md`](DAC_TA_USECASE.md);
đặc tả cho các sơ đồ còn lại: [`DAC_TA_THIET_KE.md`](DAC_TA_THIET_KE.md).

## Dựng lại sơ đồ

Sơ đồ 2 sinh trực tiếp từ `database/prostaai.db`, nên **không thể lệch** khỏi lược đồ
thật — thêm hay bớt một cột là chạy lại được ngay:

```bash
python docs/diagrams/gen_erd.py
```

Các sơ đồ 1, 4, 5, 6 dựng từ một bộ sinh chung:

```bash
python docs/diagrams/gen_diagrams.py
```

Sơ đồ 3 có thêm bản nguồn PlantUML (`usecase_diagram.puml`) để chỉnh bằng công cụ UML
thông thường.

Xuất PNG 300 DPI từ SVG (cần môi trường ảo của backend, đã có `pyvips`):

```bash
cd backend && .venv/Scripts/python.exe -c "import pyvips; pyvips.Image.new_from_file('../docs/erd_diagram.svg', dpi=300).write_to_file('../docs/erd_diagram.png')"
```

## Ghi chú về số bảng

Tài liệu cũ nhắc tới "11 bảng". Con số đúng ở thời điểm hiện tại là **14**: ba bảng
được bổ sung sau đó là `manual_annotations` (vùng khoanh thủ công), `magnification_calibration`
(hiệu chỉnh µm/pixel theo vật kính) và `stage3_results` (kết quả hợp nhất ISUP). Nếu
chương Thiết kế còn ghi 11, cần sửa lại cho khớp.

## Cách kiểm tra sơ đồ trước khi nộp

Các sơ đồ đã được kiểm bằng chương trình chứ không chỉ nhìn mắt: không có khối nào
chồng nhau, không có chữ tràn khung, và không có đường nối nào cắt xuyên qua một khối
khác. Nếu bạn chỉnh tay tệp SVG, nên kiểm lại — một lỗi thường gặp là ký tự `<` hoặc
`&` chưa được escape sẽ làm hỏng toàn bộ tệp XML mà không báo lỗi rõ ràng (đã gặp thật
với chuỗi `Bearer <JWT>`).

## Chèn vào Word

Insert → Pictures → This Device. Với PNG 300 DPI, nhớ đặt lại chiều rộng khoảng 16 cm
cho vừa lề A4 — ảnh gốc rất lớn nên Word sẽ chèn tràn trang nếu để nguyên. Sơ đồ 4 và 5
cao hơn rộng, nên cân nhắc đặt chúng ở trang ngang (landscape).
