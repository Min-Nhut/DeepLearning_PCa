# Tóm tắt

Chấm điểm Gleason trên tiêu bản sinh thiết tuyến tiền liệt là bước quyết định hướng điều trị,
nhưng kết quả phụ thuộc nhiều vào kinh nghiệm và có sự khác biệt đáng kể giữa các bác sĩ khi
đọc cùng một tiêu bản. Các công cụ hỗ trợ bằng trí tuệ nhân tạo hiện có phần lớn yêu cầu ảnh
toàn tiêu bản từ máy quét chuyên dụng, chi phí cao và không phù hợp với các cơ sở chỉ có ảnh
chụp qua camera gắn kính hiển vi. Đề tài xây dựng ProstaAI — một ứng dụng web hỗ trợ chẩn
đoán, cho phép quản lý ca bệnh, thu nhận ảnh vi trường, chạy suy diễn AI và kết xuất phiếu kết
quả, nhằm chứng minh tính khả thi kỹ thuật của một quy trình hỗ trợ chấm điểm Gleason hoàn
chỉnh từ đầu đến cuối.

Hệ thống được huấn luyện trên tập dữ liệu công khai PANDA, giới hạn ở các tiêu bản của Radboud
University Medical Center vì chỉ nhóm này có mặt nạ phân đoạn đủ sáu lớp mô (nền, mô đệm, lành
tính, Gleason 3, 4 và 5). Ảnh được cắt thành các mảnh 500×500 điểm ảnh ở độ phân giải gốc,
tương ứng 0,48619 µm mỗi điểm ảnh, và chia theo ca bệnh với tỉ lệ 80/10/10 dùng chung cho cả
hai nhánh mô hình để tránh rò rỉ dữ liệu. Quy trình suy diễn gồm hai giai đoạn: phân đoạn ngữ
nghĩa sáu lớp xác định vùng mô liên quan, sau đó phân loại bốn lớp trên chính các mảnh đã được
đánh dấu, rồi tổng hợp thành cặp mẫu trội và mẫu phụ theo diện tích. Về mặt kỹ thuật, phần
máy chủ dùng FastAPI và SQLAlchemy trên SQLite, phần giao diện dùng React và TypeScript, kèm
trình xem thu phóng sâu theo cơ chế lát ảnh nhiều mức, công cụ khoanh vùng thủ công, thước đo
khoảng cách có hiệu chỉnh µm mỗi điểm ảnh, và bộ chuyển đổi dữ liệu từ phần mềm quản lý ảnh
đang được dùng thực tế tại cơ sở y tế.

Kết quả đánh giá trên tập kiểm thử cho thấy mô hình phân đoạn tốt nhất, U-Net với bộ mã hóa
DenseNet121, đạt độ chính xác điểm ảnh 88,98%, IoU trung bình 65,28% và hệ số Dice trung bình
78,86% trên bốn lớp mô; mô hình phân loại tốt nhất, EfficientNet_b0, đạt độ chính xác 87,85%
và F1 trung bình 86,85%. Toàn bộ quy trình đã được kiểm chứng chạy thông suốt trên ảnh thật,
kèm 233 kiểm thử tự động phía máy chủ và 29 kiểm thử phía giao diện. Cần nhấn mạnh rằng đây là
sản phẩm nghiên cứu, không phải thiết bị y tế đã được kiểm định, và bác sĩ giải phẫu bệnh vẫn
là người ra quyết định cuối cùng. Các chỉ số nêu trên được đo trên một lần chia dữ liệu tĩnh
thay vì kiểm định chéo nhiều lần, nên không so sánh trực tiếp được với các công bố dùng phương
pháp đánh giá khác. Thí nghiệm đo đạc trong đề tài cũng cho thấy ảnh chụp trực tiếp qua kính
hiển vi lệch khoảng 40 đơn vị màu trong không gian LAB so với dữ liệu huấn luyện, nghĩa là
hiệu năng trên nguồn ảnh này chưa được kiểm chứng và là hướng cần tiếp tục giải quyết.

**Từ khóa**: ung thư tuyến tiền liệt, điểm Gleason, phân đoạn ngữ nghĩa, học sâu, hỗ trợ chẩn
đoán, giải phẫu bệnh số.
