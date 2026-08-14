# Thí nghiệm: gộp nhiều model phân đoạn có tốt hơn dùng một model không?

**Ngày chạy**: 2026-08-07 · **Script**: `backend/scripts/ablation_ensemble.py` ·
**Dữ liệu**: 150 patch từ 5 slide PANDA, có ground-truth mask

## Câu hỏi

Hệ thống có **3 checkpoint phân đoạn** nhưng mỗi lần chạy chỉ dùng **một**. Gộp chúng lại
không tốn công huấn luyện — checkpoint đã nằm sẵn trên đĩa — và về lý thuyết có lợi nhất
đúng ở chỗ hệ thống yếu nhất: dữ liệu lệch miền, nơi các kiến trúc khác nhau sai theo cách
khác nhau.

"Về lý thuyết" không phải bằng chứng, nên đo trước khi nối vào pipeline.

## Kết quả

| Cấu hình | mean IoU | mean DSC | so với model đơn tốt nhất |
|---|---:|---:|---:|
| **2 U-Net (densenet + efficientnet)** | **0,5543** | **0,7029** | **+0,0118** |
| unet_densenet121 | 0,5425 | 0,6978 | — (tốt nhất đơn lẻ) |
| trọng số theo IoU (cả 3) | 0,5106 | 0,6576 | −0,0319 |
| unet_densenet121 + deeplabv3+ | 0,4350 | 0,5518 | −0,1075 |
| cả 3, trung bình đều | 0,4347 | 0,5615 | −0,1078 |
| unet_efficientnet_b0 | 0,3741 | 0,5326 | |
| unet_efficientnet + deeplabv3+ | 0,3195 | 0,4446 | −0,2230 |
| deeplabv3plus_efficientnet_b0 | 0,2809 | 0,4047 | |

IoU theo lớp (chỉ các cấu hình đáng chú ý):

| Lớp | densenet121 | 2 U-Net |
|---|---:|---:|
| benign | 0,5350 | **0,5645** |
| gleason_3 | **0,3852** | 0,3342 |
| gleason_4 | 0,6053 | **0,6366** |
| gleason_5 | 0,6445 | **0,6819** |

## Kết luận: **không** nối ensemble vào pipeline

Chỉ 1 trong 7 tổ hợp vượt được model đơn tốt nhất, và vượt **+0,0118 IoU (+2,2% tương đối)**.
Không đủ để trả cái giá:

- **Thời gian chạy gấp đôi**, trên máy đã từng hết bộ nhớ vì chạy đồng thời, nơi một WSI vốn
  đã mất ~90 giây cộng thêm Stage 3.
- **Chưa chắc là thật**: một mẫu 150 patch, một lần chạy, không có khoảng tin cậy. Chênh lệch
  cỡ này hoàn toàn có thể là may mắn của mẫu.
- **Thua đúng ở lớp quan trọng nhất**: gleason_3 (0,3342 so với 0,3852) — ranh giới giữa lành
  tính và ung thư có ý nghĩa lâm sàng.

Cơ chế cũng đã rõ: ensemble chỉ có lợi khi các thành viên **tương đương chất lượng** và sai
**độc lập**. Kéo `deeplabv3plus` vào bất kỳ tổ hợp nào cũng làm tệ đi, vì nó đạt IoU
**0,0000 ở gleason_3** — gần như không bao giờ dự đoán lớp này — nên trung bình vào là giết
luôn lớp đó.

## Lưu ý quan trọng: phép đo này KHÔNG dùng để xếp hạng model

Chỉ số huấn luyện của chính dự án (`ai_models_config.py`, từ tập test chuẩn của toàn bộ
manifest) cho khoảng cách **hẹp hơn nhiều**:

| mean IoU | Eval huấn luyện | Thí nghiệm này |
|---|---:|---:|
| unet_densenet121 | 0,6528 | 0,5425 |
| unet_efficientnet_b0 | 0,6193 | 0,3741 |
| deeplabv3plus_efficientnet_b0 | 0,5928 | 0,2809 |

**Thứ tự giống nhau, mức độ khác hẳn.** Eval huấn luyện đáng tin hơn: hàng nghìn patch, nhiều
slide, cắt đúng quy tắc gán nhãn lúc huấn luyện. Thí nghiệm này chỉ có 150 patch cắt theo
lưới, và mean IoU bị chi phối mạnh bởi gleason_3 vốn rất hiếm trong mẫu.

Vì vậy **không được dùng bảng này để loại bỏ model nào** — chênh 0,59 so với 0,65 theo eval
chuẩn là không đủ cơ sở. Đề xuất bỏ `deeplabv3plus` đã được rút lại vì lý do này.

## Thứ thực sự đã sửa nhờ thí nghiệm

Cả hai nguồn số liệu **đồng ý về thứ tự**, và điều đó đủ để sửa một lỗi thật: mặc định của
picker trước đây là "phần tử đầu tiên trong một danh sách cứng". Với phân đoạn thì tình cờ
đúng, nhưng với **phân loại thì sai** — `densenet121` (F1 0,8634) che mất `efficientnet_b0`
(F1 0,8685). Bác sĩ nào không mở picker sẽ âm thầm nhận model tốt thứ nhì.

Nay mặc định được **suy ra từ chỉ số** (`recommended_arch()`), và tuỳ chọn tốt nhất được ghi
"(khuyến nghị)" ngay trong danh sách, nên lựa chọn có căn cứ thay vì đoán.
