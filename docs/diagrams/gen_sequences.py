"""Sequence diagrams for the remaining functions.

Declarative: each diagram is a list of steps, the layout is computed. The first
sequence diagram (an AI request) was hand-positioned; this generator replaces
that approach so all of them stay visually consistent and stay easy to edit.
"""
from pathlib import Path

OUT = Path(r"D:\LV\docs")
FONT = "Segoe UI, Arial, sans-serif"
INK, MUTED, LINE = "#12263f", "#6b7c92", "#42536b"
FILL_A, FILL_C = "#e8eef7", "#fdf3e3"
BORD_A = "#2c4a6e"
ALT_FILL, ALT_BORD, ALT_INK = "#fff5f5", "#d98a8a", "#a34a4a"
FRAME_BORD, FRAME_INK = "#9fb3c8", "#5a7794"


def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Sequence:
    """Lifelines are laid out evenly; y advances per step."""

    TOP = 82
    GAP = 40          # plain message
    GAP_NOTE = 52     # message carrying a sub-caption
    GAP_SELF = 54     # self-call
    SELF_W, SELF_H = 46, 26

    def __init__(self, title, sub, actors, width=1500, lane=None):
        self.title, self.sub, self.actors = title, sub, actors
        self.w = width
        n = len(actors)
        self.lane = lane or (width - 300) / (n - 1)
        self.x = {a[0]: 150 + i * self.lane for i, a in enumerate(actors)}
        self.body, self.frames = [], []
        self.y = self.TOP + 74

    # ---- primitives -------------------------------------------------
    def _t(self, x, y, s, size=10.5, fill="#3d4f66", weight="400", anchor="middle", italic=False):
        it = ' font-style="italic"' if italic else ""
        self.body.append(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" '
                         f'font-weight="{weight}" fill="{fill}"{it}>{esc(s)}</text>')

    def msg(self, a, b, label, note=None, dashed=False):
        x1, x2 = self.x[a], self.x[b]
        st = ' stroke-dasharray="5 4"' if dashed else ""
        self.body.append(f'<line x1="{x1}" y1="{self.y}" x2="{x2}" y2="{self.y}" stroke="{LINE}" '
                         f'stroke-width="1.4"{st} marker-end="url(#a)"/>')
        self._t((x1 + x2) / 2, self.y - 7, label)
        if note:
            self._t((x1 + x2) / 2, self.y + 13, note, 9.5, MUTED, italic=True)
        self.y += self.GAP_NOTE if note else self.GAP

    def ret(self, a, b, label, note=None):
        self.msg(a, b, label, note, dashed=True)

    def selfmsg(self, a, label, note=None):
        x = self.x[a]
        self.body.append(f'<polyline points="{x},{self.y} {x+self.SELF_W},{self.y} '
                         f'{x+self.SELF_W},{self.y+self.SELF_H} {x+4},{self.y+self.SELF_H}" '
                         f'fill="none" stroke="{LINE}" stroke-width="1.4" marker-end="url(#a)"/>')
        self._t(x + self.SELF_W + 10, self.y + self.SELF_H / 2 + 4, label, 10.5, "#3d4f66", "400", "start")
        if note:
            self._t(x + self.SELF_W + 10, self.y + self.SELF_H / 2 + 19, note, 9.5, MUTED, "400", "start", italic=True)
            self.y += 14
        self.y += self.GAP_SELF

    def frame(self, kind, condition, a, b, pad_left=110, pad_right=150):
        """Open a loop/alt frame; returns a handle for close()."""
        x1, x2 = sorted((self.x[a], self.x[b]))
        top = self.y - 20
        self._t(max(20, x1 - pad_left) + 8, top + 14, f"{kind}  {condition}", 10, FRAME_INK, "700", "start")
        self.y += 12
        left = max(20, x1 - pad_left)
        right = min(self.w - 20, x2 + pad_right)
        return {"x": left, "w": right - left, "top": top}

    def close(self, h):
        self.frames.append(f'<rect x="{h["x"]}" y="{h["top"]}" width="{h["w"]}" '
                           f'height="{self.y - h["top"] - 6}" rx="4" fill="none" '
                           f'stroke="{FRAME_BORD}" stroke-dasharray="4 3"/>')
        self.y += 10

    def alt(self, lines, a=None, b=None):
        """A red 'this is what happens when it goes wrong' band."""
        x1 = max(20, self.x[a] - 60) if a else 80
        w = (min(self.w - 20, self.x[b] + 180) - x1) if b else self.w - 200
        h = 16 + len(lines) * 15
        self.body.append(f'<rect x="{x1}" y="{self.y-14}" width="{w}" height="{h}" rx="4" '
                         f'fill="{ALT_FILL}" stroke="{ALT_BORD}"/>')
        for i, ln in enumerate(lines):
            self._t(x1 + 12, self.y + 1 + i * 15, ln, 10, ALT_INK, "700" if i == 0 else "400", "start")
        self.y += h + 14

    def gap(self, n=1):
        self.y += 14 * n

    def save(self, name):
        h = self.y + 40
        p = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {h}" width="{self.w}" '
             f'height="{h}" font-family="{FONT}">',
             '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
             f'orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{LINE}"/></marker></defs>',
             f'<rect width="{self.w}" height="{h}" fill="#ffffff"/>',
             f'<text x="{self.w//2}" y="32" text-anchor="middle" font-size="17" font-weight="700" '
             f'fill="{INK}">{esc(self.title)}</text>',
             f'<text x="{self.w//2}" y="52" text-anchor="middle" font-size="11" fill="{MUTED}">{esc(self.sub)}</text>']
        bw = min(self.lane - 22, 200)
        for key, lines in self.actors:
            x = self.x[key]
            bh = 34 + (len(lines) - 1) * 14
            p.append(f'<rect x="{x-bw/2}" y="{self.TOP}" width="{bw}" height="{bh}" rx="6" fill="{FILL_A}" '
                     f'stroke="{BORD_A}" stroke-width="1.5"/>')
            for i, ln in enumerate(lines):
                fw = "700" if i == 0 else "400"
                p.append(f'<text x="{x}" y="{self.TOP+20+i*14}" text-anchor="middle" font-size="{11.5 if i==0 else 10}" '
                         f'font-weight="{fw}" fill="{INK if i==0 else "#3d4f66"}">{esc(ln)}</text>')
            p.append(f'<line x1="{x}" y1="{self.TOP+bh}" x2="{x}" y2="{h-24}" stroke="#c6d3e2" '
                     f'stroke-width="1.2" stroke-dasharray="4 4"/>')
        p += self.frames + self.body + ["</svg>"]
        (OUT / name).write_text("\n".join(p), encoding="utf-8")
        print("wrote", name, f"({self.w}x{h})")


# =====================================================================
# SD-1 — Đăng nhập
# =====================================================================
s = Sequence("Biểu đồ tuần tự — Đăng nhập và thiết lập phiên làm việc",
             "Kèm cơ chế khóa sau nhiều lần sai và kiểm tra vai trò có thuộc cổng đang mở hay không",
             [("U", ["Người dùng"]),
              ("UI", ["Giao diện", "Login.tsx"]),
              ("API", ["API", "routers/auth.py"]),
              ("CNT", ["Bộ đếm lần sai", "trong bộ nhớ tiến trình"]),
              ("DB", ["CSDL SQLite"])], width=1420)

s.msg("U", "UI", "nhập tên đăng nhập và mật khẩu")
s.msg("UI", "API", "POST /api/auth/login  { username, password }")
s.msg("API", "CNT", "kiểm tra khóa theo tên đăng nhập", note="5 lần sai trong 15 phút")
s.ret("CNT", "API", "còn hạn / đã bị khóa")
s.alt(["alt  [đã bị khóa]", "429 Too Many Requests — dừng tại đây, không truy vấn cơ sở dữ liệu"], "API", "CNT")
s.msg("API", "DB", "SELECT users WHERE username = ?")
s.ret("DB", "API", "bản ghi người dùng hoặc rỗng")
s.selfmsg("API", "verify_password — so khớp bcrypt")
s.alt(["alt  [sai mật khẩu hoặc không có tài khoản]",
       "ghi nhận một lần sai vào bộ đếm → 401 Unauthorized",
       "alt  [tài khoản bị khóa: is_active = 0]",
       "401 Unauthorized — không cấp token dù mật khẩu đúng"], "API", "CNT")
s.msg("API", "CNT", "xóa lịch sử sai của tài khoản này")
s.selfmsg("API", "create_access_token — JWT HS256", note="mang id, username, role")
s.ret("API", "UI", "200  { access_token }")
s.selfmsg("UI", "lưu token vào localStorage", note="khóa riêng theo cổng: prostaai_token_doctor / _admin")
s.msg("UI", "API", "GET /api/auth/me")
s.ret("API", "UI", "200  { id, username, role, is_active }")
s.selfmsg("UI", "roleMatchesPortal(role)")
s.alt(["alt  [vai trò không thuộc cổng đang mở]",
       "xóa token vừa lưu, hiện thông báo kèm liên kết sang cổng còn lại —",
       "không nạp giao diện sai vai trò rồi để mọi lời gọi API trả 403"], "UI", "API")
s.msg("UI", "U", "vào màn Tổng quan đúng vai trò")
s.save("sequence_login.svg")


# =====================================================================
# SD-2 — Tải ảnh lên / chụp trực tiếp
# =====================================================================
s = Sequence("Biểu đồ tuần tự — Tải ảnh lên hoặc chụp trực tiếp qua kính hiển vi",
             "Cùng một điểm cuối cho cả hai cách đưa ảnh vào; tiền xử lý chạy tự động ngay sau khi lưu",
             [("BS", ["Bác sĩ"]),
              ("UI", ["Giao diện", "Upload.tsx"]),
              ("API", ["API", "routers/cases.py"]),
              ("TP", ["Luồng phụ", "run_in_threadpool"]),
              ("FS", ["Kho tệp"]),
              ("DB", ["CSDL SQLite"])], width=1560)

s.msg("BS", "UI", "chọn tệp ảnh, hoặc bấm chụp từ camera")
s.selfmsg("UI", "nếu là chụp: lấy khung hình vào canvas → toBlob", note="cùng một điểm cuối, chỉ khác trường source")
s.selfmsg("UI", "kiểm tra dung lượng phía client (200 MB)", note="chỉ để tránh một vòng gửi vô ích")
s.msg("UI", "API", "POST /api/cases/slides/{id}/images  (multipart)",
      note="file · description · source · magnification")
s.selfmsg("API", "kiểm tra source và độ phóng đại hợp lệ")
s.msg("API", "DB", "đếm số ảnh hiện có của slide")
s.alt(["alt  [đã đủ 8 ảnh trong slide]", "400 Bad Request"], "API", "DB")
s.selfmsg("API", "đọc theo từng khối 1 MB", note="vượt 200 MB → 413, không nạp cả tệp vào bộ nhớ")
s.msg("API", "TP", "_process_and_store(dữ liệu thô)")
s.selfmsg("TP", "Pillow giải mã thật để xác thực", note="không tin phần mở rộng tên tệp")
s.alt(["alt  [không giải mã được thành JPG / PNG / TIFF]", "400 Bad Request"], "TP", "FS")
s.msg("TP", "FS", "ghi ảnh gốc + thu nhỏ ≤ 320 px + xem nhanh ≤ 2400 px")
s.ret("TP", "API", "định dạng, chiều rộng, chiều cao")
s.msg("API", "DB", "INSERT images (image_number = số hiện có + 1)")
s.msg("API", "TP", "run_preprocessing(ảnh xem nhanh)", note="chạy trên bản 2400 px, không phải ảnh gốc")
s.selfmsg("TP", "độ mờ (Laplacian) · tách mô (Otsu HSV) · chuẩn màu Macenko")
s.msg("TP", "FS", "ghi mặt nạ mô (PNG) và ảnh chuẩn màu (JPG)")
s.ret("TP", "API", "cờ mờ, điểm chất lượng, đường dẫn tệp")
s.msg("API", "DB", "INSERT preprocessing_results  ·  INSERT audit_logs")
s.alt(["alt  [tiền xử lý lỗi]",
       "ghi log và bỏ qua — ảnh đã được Pillow xác thực và lưu thành công rồi,",
       "một sự cố ở bước phụ không được phép làm hỏng việc tải ảnh"], "API", "DB")
s.ret("API", "UI", "201 Created  { image }")
s.msg("UI", "BS", "hiện ảnh trong lưới, kèm nhãn độ phóng đại")
s.save("sequence_upload.svg")


# =====================================================================
# SD-3 — Đánh giá chẩn đoán, xác nhận và tổng hợp cấp ca
# =====================================================================
s = Sequence("Biểu đồ tuần tự — Lập đánh giá, xác nhận và tổng hợp điểm Gleason cấp ca",
             "Kết quả AI là chỉ đọc; bản đánh giá là bản sao có thể sửa của bác sĩ",
             [("BS", ["Bác sĩ"]),
              ("UI", ["Giao diện", "Viewer.tsx"]),
              ("API", ["API", "reviews.py · cases.py"]),
              ("DB", ["CSDL SQLite"])], width=1380)

s.msg("BS", "UI", "mở trình xem tiêu bản của một ảnh")
s.msg("UI", "API", "GET .../inference · .../review · .../annotations · /api/images/{id}")
s.ret("API", "UI", "kết quả AI, bản đánh giá (404 nếu chưa có), vùng khoanh, metadata ảnh")
s.selfmsg("UI", "404 của review được coi là “chưa có”, không phải lỗi")
s.selfmsg("UI", "chỉ điền sẵn từ AI khi kết quả dùng được",
          note="AI không gán được mẫu → để trống, hiện cảnh báo mâu thuẫn")
s.msg("BS", "UI", "chọn mẫu trội / phụ, nhập PNI, LVI, ghi chú")
s.msg("BS", "UI", "bấm Lưu")
s.msg("UI", "API", "PATCH /api/images/{id}/review",
      note="cancer_area_percentage lấy từ kết quả phân đoạn, không phải người nhập")
s.msg("API", "DB", "lấy bản đánh giá mới nhất của ảnh (tạo mới nếu chưa có)")
s.alt(["alt  [bản đánh giá đã được xác nhận]",
       "423 Locked — giao diện nạp lại bản đánh giá thay vì hiện lỗi thô",
       "(thường gặp khi đã xác nhận ở một thẻ trình duyệt khác)"], "API", "DB")
s.selfmsg("API", "tính total_score và grade_group từ cặp mẫu")
s.msg("API", "DB", "UPDATE diagnostic_reviews  ·  INSERT audit_logs")
s.ret("API", "UI", "200  { bản đánh giá đã lưu }")
s.gap()
s.msg("BS", "UI", "bấm Xác nhận & khóa")
s.msg("UI", "API", "POST /api/images/{id}/review/confirm")
s.alt(["alt  [chưa có bản nháp] → 404      alt  [đã xác nhận trước đó] → 409"], "API", "DB")
s.msg("API", "DB", "status = 'confirmed', confirmed_at, reviewed_by  ·  INSERT audit_logs")
s.ret("API", "UI", "200 — biểu mẫu chuyển sang chỉ đọc")
s.gap()
s.msg("UI", "API", "GET /api/cases/{case_id}/gleason")
s.msg("API", "DB", "đọc mọi đánh giá đã xác nhận của ca (qua slide → ảnh)")
s.selfmsg("API", "_aggregate_gleason — trọng số theo diện tích ung thư",
          note="hòa thì nghiêng về grade cao hơn; tính khi đọc, không lưu sẵn")
s.ret("API", "UI", "mẫu trội, mẫu phụ, tổng điểm, số ảnh đã xác nhận")
s.msg("UI", "BS", "hiện điểm Gleason cấp ca và phiếu kết quả")
s.save("sequence_review.svg")


# =====================================================================
# SD-4 — Xem tiêu bản với thu phóng sâu
# =====================================================================
s = Sequence("Biểu đồ tuần tự — Xem tiêu bản với thu phóng sâu",
             "Tháp lát ảnh sinh một lần ở lần xem đầu tiên; mọi lát đều đi qua kiểm tra xác thực",
             [("BS", ["Bác sĩ"]),
              ("OSD", ["OpenSeadragon", "trong trình duyệt"]),
              ("API", ["API", "routers/dzi.py"]),
              ("TP", ["Luồng phụ", "pyvips"]),
              ("FS", ["Kho tệp"])], width=1420)

s.msg("BS", "OSD", "mở trình xem tiêu bản")
s.msg("OSD", "API", "GET /api/images/{id}/dzi", note="Authorization: Bearer — không có ảnh nào công khai")
s.msg("API", "TP", "ensure_dzi(đường dẫn ảnh gốc)")
s.msg("TP", "FS", "tháp lát ảnh đã tồn tại chưa?")
h = s.frame("alt", "[chưa có — lần xem đầu tiên]", "TP", "FS")
s.selfmsg("TP", "dzsave: lát 256 px, chồng mép 1 px, JPEG chất lượng 85")
s.msg("TP", "FS", "ghi tệp mô tả .dzi và toàn bộ thư mục lát theo từng mức")
s.close(h)
s.ret("TP", "API", "đường dẫn tệp mô tả", note="lần xem sau chỉ là một lần đọc tệp có sẵn")
s.ret("API", "OSD", "200 application/xml — kích thước gốc và mẫu URL lát")
h = s.frame("loop", "[mỗi lát nằm trong khung nhìn hiện tại]", "OSD", "FS")
s.msg("OSD", "API", "GET .../dzi_files/{level}/{col}_{row}.jpg", note="kèm JWT trong mỗi yêu cầu lát")
s.selfmsg("API", "đối chiếu tên tệp với biểu thức chính quy",
          note="chặn đường dẫn vượt thư mục; tên sai → 400")
s.msg("API", "FS", "đọc lát đã lưu")
s.ret("API", "OSD", "200 image/jpeg")
s.close(h)
s.msg("BS", "OSD", "kéo và phóng to")
s.selfmsg("OSD", "chỉ tải lát của mức phân giải và vùng đang xem",
          note="không bao giờ tải toàn bộ ảnh gigapixel về trình duyệt")
s.save("sequence_deepzoom.svg")


# =====================================================================
# SD-5 — Di trú dữ liệu từ hệ thống cũ
# =====================================================================
s = Sequence("Biểu đồ tuần tự — Di trú dữ liệu từ phần mềm quản lý ảnh cũ",
             "Xem trước không ghi dữ liệu; mỗi dòng nhập trong một điểm lưu riêng nên lỗi không lan cả mẻ",
             [("QT", ["Quản trị viên"]),
              ("UI", ["Giao diện", "Migration.tsx"]),
              ("API", ["API", "routers/admin.py"]),
              ("OLD", ["Tệp .db cũ", "mở chế độ chỉ đọc"]),
              ("DB", ["CSDL + kho tệp"])], width=1480)

s.msg("QT", "UI", "chọn tệp .db của phần mềm cũ và các tệp ảnh đi kèm")
s.msg("UI", "API", "POST /api/admin/migration/sqlite-preview  (multipart)")
s.selfmsg("API", "ghi dữ liệu tải lên ra tệp tạm")
s.msg("API", "OLD", "mở kết nối chế độ chỉ đọc (mode=ro)")
s.alt(["alt  [không phải cơ sở dữ liệu SQLite] → 400 kèm thông báo tiếng Việt",
       "alt  [thiếu bảng bắt buộc] → 400, dừng trước khi làm bất cứ việc gì"], "API", "OLD")
s.msg("API", "OLD", "đếm ca / slide / ảnh, liệt kê độ phóng đại")
s.ret("API", "UI", "bản xem trước — KHÔNG ghi bất kỳ dữ liệu nào")
s.msg("QT", "UI", "xác nhận có quyền dùng dữ liệu, chọn ẩn danh hay không")
s.msg("UI", "API", "POST /api/admin/migration/sqlite-import?anonymize=…")
h = s.frame("loop", "[mỗi ca bệnh trong tệp cũ]", "API", "DB")
s.selfmsg("API", "mở điểm lưu (SAVEPOINT) cho riêng dòng này")
s.msg("API", "DB", "tạo ca / slide / ảnh với source = 'legacy_import'",
      note="giữ lại mã cũ, nhãn lam kính gốc và độ phóng đại")
s.selfmsg("API", "đối chiếu tệp ảnh theo TÊN TỆP",
          note="đường dẫn trong dữ liệu cũ là đường dẫn máy gốc, không bao giờ hợp lệ")
s.msg("API", "DB", "lưu ảnh qua đúng quy trình tải ảnh thông thường",
      note="thu nhỏ, xem nhanh và tiền xử lý tự động")
s.alt(["alt  [lỗi ở dòng này — trùng mã số, thiếu tệp ảnh…]",
       "quay lui điểm lưu, ghi lý do vào danh sách bỏ qua, tiếp tục dòng sau"], "API", "DB")
s.close(h)
s.msg("API", "DB", "một bản ghi nhật ký tổng hợp cho cả lần nhập")
s.ret("API", "UI", "số bản ghi đã tạo, số bỏ qua và lý do từng trường hợp")
s.msg("UI", "QT", "hiện kết quả ở bước cuối của trình hướng dẫn")
s.save("sequence_migration.svg")
