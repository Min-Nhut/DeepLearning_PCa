> Xem thêm: [ABLATION_ENSEMBLE.md](ABLATION_ENSEMBLE.md) — thí nghiệm gộp nhiều model.

# Thí nghiệm: chuẩn hoá màu Macenko lúc suy luận — giúp hay hại?

**Ngày chạy**: 2026-08-07 · **Script**: `backend/scripts/ablation_stain_norm.py` ·
**Model**: `unet_densenet121`

## Câu hỏi

Hai model được huấn luyện trên patch **thô** — chỉ resize + chuẩn hoá ImageNet, **không hề
có chuẩn hoá màu, cũng không có bất kỳ augmentation màu nào** (notebook chỉ lật ngang/dọc và
xoay 90°). Nhưng hệ thống hiện tại lại chuẩn hoá Macenko **mọi patch** trước khi đưa vào
model, với lập luận: ảnh chụp kính hiển vi thật cần được kéo về gần phân phối màu của PANDA.

Đó là một độ lệch phân phối train/inference có thật, và trước thí nghiệm này nó mới chỉ được
*ghi chú*, chưa bao giờ được **đo**.

## Kết quả A — PANDA, có nhãn thật (150 patch từ 5 slide)

| Chỉ số (lớp mô 2–5) | Thô | Có chuẩn hoá | Chênh lệch |
|---|---:|---:|---:|
| mean IoU | **0,5849** | 0,1025 | **−0,4824** |
| mean DSC | **0,7286** | 0,1672 | **−0,5614** |

IoU theo từng lớp:

| Lớp | Thô | Có chuẩn hoá | Chênh lệch |
|---|---:|---:|---:|
| benign | 0,5862 | 0,2949 | −0,2913 |
| gleason_3 | 0,3756 | **0,0000** | −0,3756 |
| gleason_4 | 0,6335 | 0,0225 | −0,6111 |
| gleason_5 | 0,7443 | 0,0926 | −0,6518 |

**Chuẩn hoá làm mean IoU giảm 82% tương đối, và khả năng phát hiện Gleason Pattern 3 về
đúng bằng 0.**

## Kết quả B — ảnh kính hiển vi thật (59 ảnh, `test_image/YD_image_test`)

Không có nhãn thật nên không đo được độ chính xác; chỉ đo được mức độ dịch chuyển của dự
đoán: **23,58% pixel mô đổi lớp** khi bật chuẩn hoá (dao động 2,3%–55,8% tuỳ ảnh).

Nghĩa là ở đúng trường hợp mà bước chuẩn hoá sinh ra để phục vụ, nó cũng **không phải thao
tác vô hại** — nó đổi gần một phần tư số pixel, theo hướng chưa ai biết là đúng hay sai.

## Đây không phải lỗi cài đặt

Đã kiểm riêng đầu ra của `normalize_stain()` trên patch PANDA thật: **0,00% pixel bị đẩy
trắng**, 0,01% bị clip ở bất kỳ kênh nào, trung bình kênh chỉ dịch ~11/255. Ảnh ra hoàn toàn
bình thường — mức biến đổi là *nhẹ*.

Việc một biến đổi nhẹ như vậy phá sập độ chính xác lại chính là điều đáng nói: model **chưa
bao giờ thấy augmentation màu trong lúc huấn luyện**, nên nó không có chút bền vững nào với
dịch chuyển màu. Một thay đổi hệ thống nhỏ về tông màu cũng đủ đẩy nó ra khỏi vùng phân phối
đã học.

## Kết quả C — khoảng cách màu giữa hai miền

Kết quả A một mình dẫn tới kết luận "nên tắt chuẩn hoá". **Kết luận đó sai**, và phản biện
đúng là: nếu tắt thì ảnh kính hiển vi thật lệch hoàn toàn so với tập huấn luyện. Đo trực tiếp
(trung bình LAB trên pixel mô):

| | L | a | b | Khoảng cách tới PANDA |
|---|---:|---:|---:|---:|
| PANDA (tập huấn luyện) | 179,2 | 152,4 | 125,0 | — |
| Kính hiển vi — thô | 137,8 | 147,7 | 109,6 | **40,4** |
| Kính hiển vi — chuẩn hoá | 147,3 | 150,3 | 115,0 | **29,3** (thu hẹp 27%) |

Ghép ba kết quả lại thì bức tranh tệ hơn cả hai lựa chọn nhị phân:

- Ảnh kính hiển vi lệch **40,4**; ngay cả sau chuẩn hoá vẫn còn **29,3**.
- Trong khi đó một dịch chuyển **nhỏ hơn nhiều** (~11/255 mỗi kênh) đã đủ làm sập 82% IoU.

Nghĩa là **model gần như chắc chắn hoạt động rất kém trên ảnh kính hiển vi thật, dù bật hay
tắt chuẩn hoá**. Không có thủ thuật màu nào ở khâu suy luận xử lý được khoảng cách này.

## Hệ quả — đã triển khai: chuẩn hoá **có điều kiện**

Vì hai loại sai không đối xứng — chuẩn hoá nhầm ảnh in-domain mất 82% IoU, còn bỏ sót ảnh
lệch miền chỉ để nó ở nguyên chỗ cũ (chuẩn hoá cũng chỉ kéo lại được 27%) — quyết định được
đưa **theo từng patch** thay vì bật/tắt toàn cục.

`needs_stain_normalization()` (`app/preprocessing.py`) đo khoảng cách LAB của patch tới tham
chiếu huấn luyện và chỉ chuẩn hoá khi vượt **30**. Ngưỡng chọn từ phân bố đo được, không đoán:

| | n | p50 | p75 | p90 | p95 |
|---|---:|---:|---:|---:|---:|
| PANDA | 139 | 12,4 | 20,1 | 24,4 | 36,0 |
| Kính hiển vi | 120 | 40,9 | 59,5 | 72,8 | 77,4 |

Ngưỡng 30 nằm **trên** phân vị 90 của PANDA và **dưới** trung vị của ảnh kính hiển vi. Kiểm
lại bằng chính hàm đã cài: PANDA chỉ **6,2%** patch bị chuẩn hoá, ảnh kính hiển vi **83,3%**.

### Kiểm chứng: độ chính xác in-domain được giữ nguyên

Chạy lại thí nghiệm A với ba nhánh trên cùng một mẫu patch (45 patch, 3 slide — cổng lọc chỉ
chuẩn hoá 2/45 = 4,4%):

| Chỉ số (lớp mô 2–5) | Thô | Luôn chuẩn hoá | **Có điều kiện** |
|---|---:|---:|---:|
| mean IoU | 0,4631 | 0,0723 | **0,4690** |
| mean DSC | 0,5635 | 0,1310 | **0,5688** |

IoU theo lớp: benign 0,401 / 0,128 / **0,417** · gleason_4 0,698 / 0,063 / **0,701** ·
gleason_5 0,754 / 0,098 / **0,759**.

Chuẩn hoá có điều kiện **bằng hoặc nhỉnh hơn** nhánh thô, trong khi chuẩn hoá vô điều kiện
vẫn sập như cũ. Tức là cổng lọc đã lấy lại trọn phần độ chính xác bị mất, mà vẫn giữ khả năng
kéo ảnh lệch miền về gần tập huấn luyện.

*(Con số tuyệt đối ở đây thấp hơn bảng 5-slide phía trên vì mẫu nhỏ hơn và khác slide — chỉ
nên so các cột **trong cùng một lần chạy** với nhau.)*

Ngoài ra:

1. Giữ nguyên bản dẫn xuất `{uuid}_normalized.jpg` lúc tải ảnh — đó là ảnh QC cho người xem,
   không đi vào model.
2. **Rẻ nhất và nên làm trước**: khoảng cách bị chi phối bởi độ sáng (L lệch −41). Chỉnh phơi
   sáng / cân bằng trắng của camera cho khớp tông PANDA đóng được phần lớn khoảng cách ngay
   tại nguồn, không phải bù bằng phần mềm.
3. **Cách sửa đúng gốc**: huấn luyện lại có **augmentation màu**, hoặc áp chuẩn hoá stain cho
   *cả* train lẫn inference. Model hiện tại không có chút bền vững màu nào vì notebook chỉ
   lật và xoay. Chuẩn hoá có điều kiện chỉ là biện pháp giảm thiểu, không phải lời giải.

## Giới hạn của thí nghiệm

Một kiến trúc (`unet_densenet121`), một mẫu patch lấy theo bước đều, một lần chạy. Con số này
**định lượng ảnh hưởng của bước chuẩn hoá**, không phải một bản đánh giá model. Nếu đưa vào
luận văn, nên nêu rõ như vậy.
