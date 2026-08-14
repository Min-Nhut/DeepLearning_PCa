# Đặc tả use case — Hệ thống ProstaAI

Tài liệu đặc tả chi tiết cho ba use case trọng tâm của hệ thống, kèm một use case
phụ trợ gắn liền với luồng chẩn đoán. Sơ đồ tổng quát: [`usecase_diagram.svg`](usecase_diagram.svg).

Mọi luồng dưới đây mô tả **hành vi thực tế của mã nguồn hiện tại**, bao gồm cả các
nhánh lỗi đã được kiểm chứng, không phải hành vi dự kiến.

---

## UC-01. Chạy phân tích AI

| Mục | Nội dung |
|---|---|
| **Mã** | UC-01 |
| **Tên** | Chạy phân tích AI trên một ảnh vi trường |
| **Tác nhân chính** | Bác sĩ giải phẫu bệnh |
| **Tác nhân phụ** | Không |
| **Mô tả** | Bác sĩ chọn kiến trúc mô hình và khởi chạy quy trình suy diễn ba giai đoạn trên một ảnh, sau đó theo dõi tiến trình cho tới khi có kết quả. |
| **Mức độ** | Nhiệm vụ người dùng (user goal) |
| **Tần suất** | Mỗi ảnh vi trường một lần; có thể chạy lại khi đổi mô hình hoặc khi lần chạy trước thất bại. |

### Tiền điều kiện

1. Bác sĩ đã đăng nhập cổng Bác sĩ và phiên còn hiệu lực.
2. Ảnh đã tồn tại trong hệ thống và đã qua bước tiền xử lý tự động lúc tải lên.
3. Có ít nhất một tệp trọng số khả dụng trên đĩa cho mỗi tác vụ (phân đoạn và phân loại).

### Sự kiện kích hoạt

Bác sĩ chọn **"Kết quả AI"** trên một ảnh trong màn Chi tiết ca bệnh, rồi chọn
**"Chạy phân tích AI"**.

### Luồng sự kiện chính

1. Hệ thống truy vấn lần chạy gần nhất của ảnh. Không có lần chạy nào → chuyển sang màn chọn mô hình.
2. Hệ thống nạp danh sách kiến trúc, **chỉ hiển thị những kiến trúc thực sự có tệp trọng số trên đĩa**, và chọn sẵn kiến trúc khuyến nghị của từng tác vụ dựa trên chỉ số đánh giá đã ghi nhận (F1 cho phân loại, IoU cho phân đoạn).
3. Hệ thống đọc kết quả tiền xử lý của ảnh; nếu ảnh bị đánh dấu mờ, hiển thị cảnh báo trước khi bác sĩ khởi chạy.
4. Bác sĩ chọn kiến trúc phân đoạn và kiến trúc phân loại, rồi chọn **"Bắt đầu phân tích"**.
5. Hệ thống tạo một bản ghi lần chạy với trạng thái *chờ xử lý*, ghi lại hai kiến trúc đã chọn, và trả kết quả về ngay cho giao diện; công việc nặng được đẩy sang tác vụ nền.
6. Tác vụ nền xin **giấy phép chạy** từ cơ chế giới hạn đồng thời. Trong lúc chờ, trạng thái vẫn là *chờ xử lý*.
7. Khi được cấp phép, trạng thái chuyển sang *đang chạy*.
8. Hệ thống xác định độ phân giải vật lý của ảnh theo thứ tự ưu tiên: thẻ metadata trong tệp ảnh → bảng hiệu chỉnh µm/pixel theo vật kính → không có thì giữ nguyên, không quy đổi tỉ lệ.
9. Hệ thống cắt ảnh thành lưới mảnh, mỗi mảnh phủ đúng khoảng cách vật lý mà mô hình được huấn luyện, lọc bỏ mảnh không có mô, và chuẩn hóa màu cho những mảnh lệch xa phân phối huấn luyện.
10. **Giai đoạn 1** — phân đoạn từng mảnh có mô thành sáu lớp, ghép thành một mặt nạ toàn ảnh và lưu ra tệp ảnh màu.
11. **Giai đoạn 2** — phân loại **chỉ những mảnh mà phân đoạn đã đánh dấu có điểm ảnh ung thư**, rồi tổng hợp mẫu trội và mẫu phụ theo diện tích.
12. **Giai đoạn 3** — chạy độc lập hai mạng phân loại trên **toàn bộ** mảnh có mô, lấy trung bình phân bố lớp, và suy ra nhóm ISUP kèm độ tin cậy.
13. Hệ thống lưu kết quả ba giai đoạn, đặt trạng thái *hoàn tất*, và ghi một bản ghi nhật ký thao tác.
14. Giao diện tự động hỏi lại trạng thái theo chu kỳ trong lúc lần chạy còn *chờ xử lý* hoặc *đang chạy*, và hiển thị **trạng thái thô đúng như máy chủ báo** — không mô phỏng tiến độ theo bước.
15. Khi *hoàn tất*, bác sĩ chọn **"Xem kết quả"** để chuyển sang Trình xem tiêu bản.

### Luồng thay thế và ngoại lệ

| Mã | Tình huống | Xử lý |
|---|---|---|
| A1 | Ảnh đã có lần chạy trước đó | Bỏ qua màn chọn mô hình, hiển thị thẳng trạng thái của lần chạy gần nhất. |
| A2 | Ảnh bị đánh dấu mờ | Hiển thị cảnh báo ở bước 3. Bác sĩ vẫn được phép chạy — quyết định thuộc về bác sĩ. |
| A3 | Một lần chạy khác đang chiếm chỗ | Lần chạy mới giữ trạng thái *chờ xử lý* cho tới khi được cấp phép. Giao diện hiển thị đúng trạng thái chờ, không báo lỗi. |
| A4 | Không tìm thấy tệp trọng số của kiến trúc yêu cầu | Lần chạy vẫn được tạo rồi chuyển sang *thất bại* kèm thông báo cụ thể, thay vì từ chối yêu cầu ngay từ đầu. |
| A5 | Lỗi trong lúc suy diễn (giải mã ảnh hỏng, thiếu bộ nhớ…) | Trạng thái chuyển *thất bại* kèm thông điệp lỗi. Lần chạy **không bao giờ bị kẹt** ở trạng thái *đang chạy*. |
| A6 | Giai đoạn 3 thiếu tệp mô hình hoặc lỗi | Ghi log và bỏ qua; lần chạy vẫn *hoàn tất* với kết quả của hai giai đoạn đầu. Giai đoạn 3 là tín hiệu tăng cường, không phải điều kiện bắt buộc. |
| A7 | Bác sĩ chọn **"Thử lại"** sau khi thất bại | Quay lại màn chọn mô hình, điền sẵn lựa chọn của lần thất bại **chỉ khi kiến trúc đó vẫn còn tệp trọng số**; nếu không thì rơi về giá trị mặc định. |
| A8 | Không phát hiện được mô nào trong ảnh | Kết quả ghi diện tích mô bằng 0, giai đoạn phân loại không chạy. Trình xem hiển thị cảnh báo **"không phát hiện được mô"**, tuyệt đối không hiển thị là lành tính. |
| A9 | Phân đoạn thấy vùng ung thư nhưng phân loại không gán được mẫu | Trình xem hiển thị cảnh báo **hai mô hình mâu thuẫn**, kèm phán quyết của từng mạng phân loại; không hiển thị chip lành tính. |

### Hậu điều kiện

**Thành công:** tồn tại một bản ghi lần chạy trạng thái *hoàn tất*, gắn với kết quả phân
đoạn (mặt nạ, diện tích ung thư, diện tích mô), kết quả phân loại (mẫu trội, mẫu phụ, độ
tin cậy) và kết quả hợp nhất ISUP. Tệp mặt nạ nằm trên đĩa. Một bản ghi nhật ký thao tác
đã được ghi.

**Thất bại:** bản ghi lần chạy mang trạng thái *thất bại* kèm thông điệp lỗi; không có kết
quả bộ phận nào được trình bày như thể hợp lệ.

**Trong mọi trường hợp:** use case này **không tạo và không sửa** bất kỳ bản đánh giá chẩn
đoán nào của bác sĩ.

### Quy tắc nghiệp vụ

- **BR-01.** Phân đoạn luôn chạy trước và quyết định những mảnh nào được đưa vào phân loại.
- **BR-02.** Tại một thời điểm chỉ một lần chạy được thực thi trong mỗi tiến trình máy chủ.
- **BR-03.** Kiến trúc đã dùng được lưu cùng lần chạy, để mọi kết quả đều truy vết được về đúng phiên bản mô hình.
- **BR-04.** Giai đoạn 3 chạy trên toàn bộ mảnh có mô, độc lập với bộ lọc của giai đoạn 2 — nếu dùng lại kết quả đã bị lọc thì tỉ lệ lớp lành tính sẽ thấp một cách giả tạo, sai lệch so với dữ liệu mà mô hình hợp nhất được huấn luyện.

---

## UC-02. Lập và chỉnh sửa đánh giá chẩn đoán

| Mục | Nội dung |
|---|---|
| **Mã** | UC-02 |
| **Tên** | Lập và chỉnh sửa đánh giá chẩn đoán cho một ảnh |
| **Tác nhân chính** | Bác sĩ giải phẫu bệnh |
| **Mô tả** | Bác sĩ đọc tiêu bản cùng lớp phủ kết quả AI, rồi ghi lại kết luận của **chính mình**: mẫu Gleason trội và phụ, các dấu hiệu xâm lấn, vị trí sinh thiết và ghi chú. |
| **Mức độ** | Nhiệm vụ người dùng |

### Tiền điều kiện

1. Bác sĩ đã đăng nhập cổng Bác sĩ.
2. Ảnh tồn tại trong hệ thống.
3. **Không yêu cầu đã chạy AI.** Bản đánh giá cho phép không gắn với lần chạy nào, nên bác sĩ hoàn toàn có thể chẩn đoán thủ công.

### Sự kiện kích hoạt

Bác sĩ mở Trình xem tiêu bản của một ảnh.

### Luồng sự kiện chính

1. Hệ thống nạp song song: ảnh (dạng tháp thu phóng), kết quả AI gần nhất, bản đánh giá hiện có, các vùng khoanh thủ công, thông tin ảnh và bảng hiệu chỉnh µm/pixel. **Việc chưa có kết quả AI hoặc chưa có bản đánh giá được coi là trạng thái bình thường, không phải lỗi.**
2. Nếu chưa có bản nháp nào **và** AI cho ra một kết quả dùng được, biểu mẫu được điền sẵn theo mẫu trội/phụ của AI. Nếu AI không gán được mẫu, biểu mẫu để trống và tiêu đề điểm Gleason hiển thị **"Chưa chọn"**.
3. Bác sĩ bật tắt các lớp phủ (mặt nạ AI, mặt nạ thủ công), điều chỉnh độ mờ, phóng to và di chuyển trên tiêu bản.
4. Bác sĩ có thể đo chiều dài khối u bằng thước; nếu độ phóng đại của ảnh đã được hiệu chỉnh, kết quả hiện theo milimét kèm nút lưu vào phiếu, ngược lại chỉ hiện theo pixel kèm ghi chú **chưa hiệu chỉnh**.
5. Bác sĩ chọn mẫu trội và mẫu phụ, nhập vị trí sinh thiết, đánh dấu xâm lấn quanh thần kinh và xâm lấn mạch bạch huyết kèm ghi chú, nhập ghi chú tự do.
6. Bác sĩ chọn **"Lưu"**. Hệ thống tạo mới bản đánh giá nếu chưa có, hoặc cập nhật bản hiện tại.
7. Máy chủ tự tính tổng điểm và nhóm ISUP khi đã có đủ hai mẫu, và ghi lại **tỉ lệ diện tích ung thư lấy trực tiếp từ kết quả phân đoạn** — không bao giờ nhận số do người nhập.
8. Hệ thống ghi một bản ghi nhật ký thao tác và trả bản đánh giá đã lưu về giao diện.

### Luồng thay thế và ngoại lệ

| Mã | Tình huống | Xử lý |
|---|---|---|
| A1 | Bản đánh giá đã được xác nhận và khóa | Máy chủ trả mã **423 Locked**. Giao diện nạp lại bản đánh giá thay vì hiện lỗi thô — tình huống thường gặp khi bác sĩ đã xác nhận ở một thẻ trình duyệt khác. |
| A2 | Chưa có kết quả AI, hoặc AI không cho kết quả dùng được | Biểu mẫu vẫn hoạt động đầy đủ. Nút **"Đồng ý với AI"** bị vô hiệu hóa và đổi nhãn, để không thể ghi một kết luận mà AI chưa từng đưa ra. |
| A3 | Bác sĩ chọn **"Đồng ý với AI"** | Biểu mẫu đồng bộ về mẫu trội/phụ của AI. **Không tự lưu** — bác sĩ vẫn phải bấm Lưu, đúng quy ước lưu tường minh của toàn hệ thống. |
| A4 | Bác sĩ đánh dấu **"Cần hội chẩn"** | Bản đánh giá xuất hiện trong danh sách chờ hội chẩn và trên thẻ tương ứng ở màn Tổng quan của mọi bác sĩ. |
| A5 | Bác sĩ muốn khoanh vùng thủ công | Chuyển sang màn Đánh dấu thủ công; vùng vừa vẽ xong được **lưu ngay lập tức** để không mất khi bị gián đoạn, phần gán nhãn và ghi chú làm sau. |

### Hậu điều kiện

**Thành công:** tồn tại một bản đánh giá trạng thái *bản nháp* cho ảnh đó, có tổng điểm và
nhóm ISUP đã tính, có tỉ lệ diện tích ung thư thật, và một bản ghi nhật ký thao tác.

**Không lưu:** không có gì được ghi xuống cơ sở dữ liệu. Chỉ mở màn hình lên xem sẽ **không**
tạo ra bản ghi nào.

### Quy tắc nghiệp vụ

- **BR-05.** Kết quả AI là chỉ đọc; bản đánh giá là bản sao có thể sửa của bác sĩ, hai thứ luôn tách biệt.
- **BR-06.** Tỉ lệ diện tích ung thư là đại lượng do máy tính ra từ mặt nạ phân đoạn, không phải trường nhập tay.
- **BR-07.** Không có quyền sở hữu ca bệnh theo từng bác sĩ; mọi bác sĩ đều sửa được bản đánh giá chưa khóa, phù hợp mô hình phân quyền phẳng của hệ thống.

### Use case liên quan — UC-02b. Xác nhận và khóa đánh giá

Bác sĩ chọn **"Xác nhận & khóa"**. Hệ thống đặt trạng thái *đã xác nhận*, ghi thời điểm và
người xác nhận, rồi ghi nhật ký. Nếu chưa có bản nháp, máy chủ trả **404**; nếu đã xác nhận
trước đó, trả **409**. Sau khi khóa, biểu mẫu chuyển sang chỉ đọc, bản đánh giá được tính
vào điểm Gleason cấp ca bệnh, và tên người xác nhận xuất hiện trên phiếu kết quả.

Đây là **khóa mềm ở mức ứng dụng**, không phải chữ ký số có giá trị pháp lý.

---

## UC-03. Di trú dữ liệu từ hệ thống cũ

| Mục | Nội dung |
|---|---|
| **Mã** | UC-03 |
| **Tên** | Di trú dữ liệu từ phần mềm quản lý ảnh đang sử dụng |
| **Tác nhân chính** | Quản trị viên |
| **Tác nhân phụ** | Phần mềm ImageCapture (hệ thống ngoài, cung cấp tệp cơ sở dữ liệu và tệp ảnh) |
| **Mô tả** | Quản trị viên nạp dữ liệu ca bệnh, slide và ảnh từ phần mềm cũ vào hệ thống mới, qua một quy trình bốn bước có bước xem trước không ghi dữ liệu. |
| **Mức độ** | Nhiệm vụ người dùng |
| **Tần suất** | Hiếm — thường một lần khi triển khai, và bổ sung khi có dữ liệu tồn đọng. |

### Tiền điều kiện

1. Quản trị viên đã đăng nhập cổng Quản trị.
2. Có tệp cơ sở dữ liệu của phần mềm cũ, và (tùy chọn) các tệp ảnh tương ứng.
3. Đã xác nhận có quyền sử dụng dữ liệu bệnh nhân này.

### Sự kiện kích hoạt

Quản trị viên mở màn **"Di trú dữ liệu"**.

### Luồng sự kiện chính

1. **Bước 0** — Quản trị viên chọn loại nguồn: cơ sở dữ liệu của phần mềm cũ, hoặc tệp CSV xuất tay.
2. Quản trị viên chọn tệp cơ sở dữ liệu và, nếu có, chọn nhiều tệp ảnh đi kèm.
3. **Bước 1 — Xem trước.** Hệ thống ghi tệp tải lên ra thư mục tạm và mở nó ở **chế độ chỉ đọc**, sau đó kiểm tra sự tồn tại của bốn bảng bắt buộc.
4. Hệ thống trả về số lượng ca bệnh, slide và ảnh, danh sách ca theo từng dòng, cùng các mức độ phóng đại tìm thấy. **Bước này không ghi bất kỳ dữ liệu nào.**
5. **Bước 2** — Quản trị viên xác nhận có quyền sử dụng dữ liệu và chọn có ẩn danh hay không.
6. **Bước 3 — Nhập.** Hệ thống duyệt cấu trúc phân cấp của dữ liệu cũ, tạo các bản ghi ca bệnh, slide và ảnh tương ứng, đánh dấu nguồn là *nhập từ hệ thống cũ*, và mang theo mã định danh cũ, nhãn slide gốc cùng độ phóng đại.
7. Với mỗi bản ghi ảnh, hệ thống **đối chiếu theo tên tệp** với các tệp ảnh mà quản trị viên đã tải lên, rồi lưu trữ qua đúng quy trình của luồng tải ảnh thông thường: sinh ảnh thu nhỏ, ảnh xem nhanh và chạy tiền xử lý tự động.
8. Mỗi dòng dữ liệu được nhập trong một **điểm lưu riêng**, nên một dòng lỗi không làm hỏng cả mẻ nhập.
9. Hệ thống ghi một bản ghi nhật ký tổng hợp cho toàn bộ lần nhập.
10. **Bước 4** — Hiển thị kết quả: số bản ghi đã tạo, số bản ghi bị bỏ qua và lý do từng trường hợp.

### Luồng thay thế và ngoại lệ

| Mã | Tình huống | Xử lý |
|---|---|---|
| A1 | Tệp tải lên không phải cơ sở dữ liệu hợp lệ (chọn nhầm bảng tính, tệp hỏng) | Trả mã **400** kèm thông báo tiếng Việt rõ ràng. Trước khi có kiểm thử tự động, tình huống này từng thoát ra thành lỗi 500 và quản trị viên không nhận được thông tin gì hữu ích. |
| A2 | Thiếu bảng bắt buộc trong cơ sở dữ liệu | Trả **400** ngay, trước khi thực hiện bất kỳ thao tác nào. |
| A3 | Trùng mã số và mã năm với ca đã có | Bỏ qua đúng dòng đó nhờ cơ chế điểm lưu, các dòng còn lại vẫn được nhập bình thường. |
| A4 | Không có tệp ảnh khớp với một bản ghi ảnh | Vẫn tạo ca và slide ở mức siêu dữ liệu, tăng số ảnh bị bỏ qua và ghi lại lý do — không chặn cả lần nhập. |
| A5 | Chọn ẩn danh | Trường họ tên bệnh nhân bị loại bỏ khi ghi vào hệ thống mới. |
| A6 | Nguồn là tệp CSV | Bước xem trước hiển thị bản đồ cột thay vì danh sách ca; bước nhập chỉ tạo ca bệnh kèm một slide mặc định, không có ảnh. Đây là phương án dự phòng cho trường hợp chỉ xuất được CSV bằng tay. |

### Hậu điều kiện

**Thành công:** các bản ghi ca bệnh, slide và ảnh mới được tạo với nguồn *nhập từ hệ thống
cũ*; tệp ảnh nằm trong thư mục lưu trữ của hệ thống; kết quả tiền xử lý đã được sinh cho
từng ảnh; một bản ghi nhật ký tổng hợp đã được ghi.

**Ở bước xem trước:** cơ sở dữ liệu hoàn toàn không thay đổi.

**Trong mọi trường hợp:** cơ sở dữ liệu của phần mềm cũ **không bị sửa đổi**.

### Quy tắc nghiệp vụ

- **BR-08.** Cơ sở dữ liệu cũ luôn được mở ở chế độ chỉ đọc.
- **BR-09.** Đường dẫn tệp ảnh lưu trong dữ liệu cũ là đường dẫn tuyệt đối trên máy gốc nên không bao giờ hợp lệ ở máy mới; việc đối chiếu ảnh **chỉ dựa vào tên tệp**.
- **BR-10.** Xem trước và nhập là hai thao tác tách biệt; không có đường nào ghi dữ liệu mà không đi qua bước xem trước và bước xác nhận quyền.
- **BR-11.** Lỗi ở mức từng dòng được cô lập, không lan ra cả mẻ nhập.

---

## Ghi chú chung

**Ghi nhật ký thao tác.** Mọi use case làm thay đổi dữ liệu đều ghi một bản ghi nhật ký gồm
người thực hiện, hành động, loại đối tượng, mã đối tượng và mô tả. Sơ đồ use case chỉ vẽ
hai liên kết đại diện để giữ hình dễ đọc.

**Xác thực và phân quyền.** Mọi use case đều yêu cầu phiên đăng nhập hợp lệ. Các use case
của quản trị viên được máy chủ cưỡng chế kiểm tra vai trò trên từng lời gọi API; việc tách
hai cổng chỉ giải quyết xung đột phiên làm việc, **không phải** cơ chế kiểm soát truy cập.
