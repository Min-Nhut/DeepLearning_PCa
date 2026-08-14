# Ablation: hiệu chỉnh tỉ lệ vật lý (µm/pixel) trước khi suy diễn

**Ngày:** 2026-08-08
**Script:** [`backend/scripts/ablation_scale.py`](../backend/scripts/ablation_scale.py)
**Lệnh chạy:** `python scripts/ablation_scale.py --regions-per-slide 10`

## Câu hỏi

Một ảnh có độ phân giải vật lý thô hơn dữ liệu huấn luyện thì mô hình phân loại
sai đến mức nào, và việc hiệu chỉnh lại tỉ lệ có lấy lại được bao nhiêu?

Câu hỏi này nảy ra từ một sự cố thật: một mảnh ảnh SICAPv2 tải lên hệ thống cho
kết quả **"lành tính"** trong khi mô hình phân đoạn đánh dấu 100% biểu mô là
Gleason 3 và 4. SICAPv2 lưu mảnh 512×512 ở khoảng **1,0 µm/pixel** (10x), còn
mảnh huấn luyện PANDA là 500×500 ở **0,48619 µm/pixel** — thô hơn khoảng 2,06 lần.

## Thiết kế

Mọi phép đo dùng vùng ảnh PANDA thật kèm mặt nạ nhãn gốc
(`test_image/PANDA_image_test/`), nên có nhãn thật để chấm điểm — khác với phép
đo trên SICAPv2 vốn không có nhãn.

Mỗi vùng gốc rộng **1000×1000 pixel level-0** (chứa đúng 2×2 trường huấn
luyện). Từ đó dựng ba điều kiện, tất cả chấm trên **cùng một nhãn**:

| Điều kiện | Mô tả |
|---|---|
| `ceiling` | Bốn góc phần tư 500px ở độ phân giải gốc, đúng tỉ lệ huấn luyện. Mức tốt nhất có thể đạt trên vùng này. |
| `no_correct` | **Hành vi hiện tại của hệ thống** với ảnh không rõ độ phân giải: cả file 485px được coi là một mảnh, nên mô hình nhìn thấy gấp đôi lượng mô so với bất kỳ mảnh huấn luyện nào. |
| `corrected` | Khi đã biết µm/pixel: `scale.patch_size_for()` thu lưới xuống 243px, mỗi ô lại phủ đúng 243,1 µm. |

`no_correct` và `corrected` chịu **cùng một mức mất chi tiết** (đều đọc từ file
485px đã bị làm thô), nên chênh lệch giữa hai cột này cô lập đúng yếu tố **tỉ
lệ**. Cột `ceiling` cho biết phần mất mát do giảm độ phân giải mà không cách nào
cắt lưới lại lấy về được.

Nhãn theo đúng quy tắc gán nhãn lúc huấn luyện: `benign` yêu cầu 100% biểu mô
lành tính; `gleason_3/4/5` yêu cầu mẫu đó chiếm ≥50% diện tích biểu mô. Vùng
không đạt ngưỡng nào thì bỏ qua, y như lúc huấn luyện.

## Kết quả

**324 vùng có nhãn từ 35 slide.** Phân bố nhãn: lành tính 45, Gleason 3 96,
Gleason 4 133, Gleason 5 50.

| Điều kiện | EfficientNet_b0 | DenseNet121 | Inception_v3 | ViT-B/16 | **Gộp 4 mô hình** | Tin cậy khi gộp |
|---|---|---|---|---|---|---|
| `ceiling` | 79,0% | 80,6% | 75,6% | 80,6% | **83,6%** | 64,1% |
| `no_correct` | 35,5% | 26,9% | 28,4% | 37,7% | **33,0%** | **79,1%** |
| `corrected` | 75,9% | 79,3% | 75,3% | 77,8% | **79,6%** | 63,8% |

Độ chính xác của mô hình gộp, theo từng lớp:

| Lớp | n | `ceiling` | `no_correct` | `corrected` |
|---|---|---|---|---|
| Lành tính | 45 | 100,0% | **100,0%** | 97,8% |
| Gleason 3 | 96 | 78,1% | 49,0% | 72,9% |
| Gleason 4 | 133 | 88,0% | **9,8%** | 87,2% |
| Gleason 5 | 50 | 68,0% | **4,0%** | 56,0% |

## Kết luận

**1. Sai tỉ lệ làm sụp đổ độ chính xác, và hiệu chỉnh lấy lại gần hết.**
33,0% → 79,6%, so với mức trần 83,6% — tức lấy lại khoảng 92% khoảng cách.

**2. Điều kiện sai nhất lại là điều kiện tự tin nhất.** 79,1% khi sai so với
64,1% ở mức trần. Đây chính là hiện tượng quan sát được trên màn hình thật: mô
hình khẳng định "lành tính" ở 93% tin cậy bên cạnh một mặt nạ đầy tuyến ung thư.

**3. Bảng theo lớp giải thích trọn vẹn sự cố ban đầu.** Khi sai tỉ lệ, **lành
tính là lớp duy nhất còn sống sót** (100%), còn Gleason 4 rơi xuống 9,8% và
Gleason 5 xuống 4,0%. Ảnh thô hơn dữ liệu huấn luyện sẽ bị đọc thành lành tính —
đúng loại sai sót nguy hiểm nhất về mặt lâm sàng, vì nó là **âm tính giả**.

**4. Gộp nhiều mô hình có ích nhưng không cứu được sai tỉ lệ.** Ở `ceiling`, gộp
4 mô hình cho 83,6%, cao hơn mô hình đơn tốt nhất (80,6%). Nhưng ở `no_correct`,
gộp chỉ được 33,0% — không hơn gì trung bình các mô hình đơn, vì cả bốn cùng sai
theo một hướng. Gộp mô hình chống được nhiễu ngẫu nhiên, không chống được lệch
hệ thống.

## Đề xuất

Cho phép khai báo **µm/pixel** cho ảnh tải lên. Toàn bộ cơ chế xử lý đã có sẵn
trong [`backend/app/inference/scale.py`](../backend/app/inference/scale.py) và
đang hoạt động đúng — nó chỉ không bao giờ được kích hoạt, vì hiện chỉ có hai
nguồn µm/pixel: thẻ metadata trong file ảnh (JPEG không có) và bảng hiệu chỉnh
theo vật kính (dành cho kính hiển vi thật, và cũng chưa được đo). Thiếu đúng
một đường: khai báo thủ công khi tải ảnh từ một bộ dữ liệu đã biết độ phân giải.

## Giới hạn của phép đo này

- **Không kiểm tra được split.** 35 slide này nằm trong `selected_train.csv` của
  PANDA, còn file chia tách (`classification_manifest_with_split.csv`) ở trên
  Drive chứ không có trong repo. Nếu một số slide thuộc tập huấn luyện thì cả ba
  cột đều bị nâng lên như nhau — phép **so sánh** vẫn hợp lệ, nhưng con số tuyệt
  đối 83,6% không nên trích dẫn như độ chính xác trên tập kiểm thử độc lập.
- **Mô phỏng, không phải ảnh SICAPv2 thật.** Việc làm thô bằng `cv2.resize` không
  tái tạo mọi khác biệt của một máy quét khác (nhiễu cảm biến, nén JPEG, khác
  biệt nhuộm màu). Nó cô lập đúng yếu tố tỉ lệ, và chỉ nên đọc như vậy.
- **Hệ số 2,06 là suy ra, không phải đo.** Suy từ bước lưới 1024 pixel level-0
  trong tên file SICAPv2 với chồng lấp 50%, khớp với tài liệu bộ dữ liệu (10x).

## Lỗi phát hiện được nhờ thí nghiệm này

Lần chạy đầu tiên cho `inception_v3` **16,4%** ở điều kiện `ceiling` — thấp hơn
cả mức ngẫu nhiên 25% của bài toán 4 lớp, và thấp hơn chính cột `corrected` của
nó. Con số vô lý đó dẫn tới một lỗi thật:
[`architectures.py`](../backend/app/inference/architectures.py) dựng
`inception_v3` mà không đặt `transform_input=True`. torchvision tự bật cờ này
khi truyền `weights=` (đúng điều notebook huấn luyện đã làm), nhưng ở suy diễn
mã truyền `weights=None` nên cờ về `False`, và mạng bị đưa đầu vào chuẩn hóa sai
hệ. Đo trên 62 mảnh PANDA thật có nhãn: **16,1%** (dự đoán Gleason 5 cho 56/62
mảnh) so với **83,9%** sau khi sửa; độ chính xác báo cáo từ huấn luyện của nó là
86,11%.

`load_state_dict(strict=True)` không bắt được vì `transform_input` là một thuộc
tính bool chứ không phải tham số. Đã sửa, kèm test canh giữ trong
[`backend/tests/test_architectures.py`](../backend/tests/test_architectures.py).
Mọi số liệu trong tài liệu này là của lần chạy **sau khi** sửa.

## Sai sót trong thiết kế thí nghiệm, đã sửa

Phiên bản đầu tiên nhân hệ số làm thô vào kích thước vùng gốc
(`region_px = 500 × 2,06 × 2`), khiến các góc phần tư của `ceiling` rộng 1030
pixel gốc — tức 500 µm, gấp đôi một trường huấn luyện. "Mức trần" khi đó cũng
đang ở sai tỉ lệ và chỉ đạt 19,3%, thấp hơn `corrected`. Vùng gốc phải luôn là
2 × 500 pixel gốc bất kể hệ số làm thô; hệ số chỉ quyết định file lưu tốn bao
nhiêu pixel cho vùng đó. Lý do được ghi ngay trong mã để không lặp lại.
