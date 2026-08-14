"""Generate the remaining design-chapter diagrams as standalone SVG files."""
from pathlib import Path

OUT = Path(r"D:\LV\docs")
FONT = "Segoe UI, Arial, sans-serif"

NAVY, INK, MUTE, LINE = "#1e3a5f", "#12263f", "#6b7c92", "#42536b"
FILL_A, FILL_B, FILL_C = "#e8eef7", "#eef7f0", "#fdf3e3"
BORD_A, BORD_B, BORD_C = "#2c4a6e", "#2f6f4f", "#b8860b"


def esc(t):
    """SVG is XML: a literal < or & in a label silently corrupts the whole file.
    Caught for real — "Bearer <JWT>" was parsed as an element and three of the
    four diagrams failed to load."""
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Svg:
    def __init__(self, w, h, title, subtitle=None):
        self.w, self.h = w, h
        self.p = [
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="{FONT}">',
            '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
            f'orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{LINE}"/></marker>'
            '<marker id="ao" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" '
            f'orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="{LINE}" stroke-width="1.4"/></marker></defs>',
            f'<rect width="{w}" height="{h}" fill="#ffffff"/>',
            f'<text x="{w//2}" y="32" text-anchor="middle" font-size="18" font-weight="700" fill="{INK}">{esc(title)}</text>',
        ]
        if subtitle:
            self.p.append(f'<text x="{w//2}" y="52" text-anchor="middle" font-size="11.5" fill="{MUTE}">{esc(subtitle)}</text>')

    def add(self, s):
        self.p.append(s)

    def box(self, x, y, w, h, lines, fill="#ffffff", border=BORD_A, r=6, size=12, bold_first=True, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{border}" stroke-width="1.5"{d}/>')
        if isinstance(lines, str):
            lines = [lines]
        total = len(lines) * (size + 4) - 4
        ty = y + h / 2 - total / 2 + size - 2
        for i, ln in enumerate(lines):
            fw = "700" if (i == 0 and bold_first) else "400"
            col = INK if (i == 0 and bold_first) else "#3d4f66"
            fs = size if (i == 0 and bold_first) else size - 1
            self.add(f'<text x="{x + w/2}" y="{ty + i*(size+4)}" text-anchor="middle" font-size="{fs}" font-weight="{fw}" fill="{col}">{esc(ln)}</text>')

    def band(self, x, y, w, h, label, fill="#f7f9fc", border="#d8e0ea"):
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{border}" stroke-dasharray="5 4"/>')
        self.add(f'<text x="{x+14}" y="{y+20}" font-size="12" font-weight="700" fill="#42536b">{esc(label)}</text>')

    def arrow(self, pts, label=None, lx=None, ly=None, dashed=False, colour=None, open_head=False, anchor="middle"):
        d = " ".join(f"{a},{b}" for a, b in pts)
        st = ' stroke-dasharray="5 4"' if dashed else ""
        c = colour or LINE
        head = "ao" if open_head else "a"
        self.add(f'<polyline points="{d}" fill="none" stroke="{c}" stroke-width="1.4"{st} marker-end="url(#{head})"/>')
        if label:
            self.add(f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" font-size="10.5" fill="#5a6b82">{esc(label)}</text>')

    def line(self, x1, y1, x2, y2, colour="#c6d3e2", dashed=False, width=1.2):
        st = ' stroke-dasharray="4 4"' if dashed else ""
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{colour}" stroke-width="{width}"{st}/>')

    def text(self, x, y, s, size=11, fill="#3d4f66", weight="400", anchor="start", italic=False):
        it = ' font-style="italic"' if italic else ""
        self.add(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" font-weight="{weight}" fill="{fill}"{it}>{esc(s)}</text>')

    def note(self, x, y, w, lines, fill="#fffbe9", border="#d9c98a", colour="#6b5b23"):
        h = 14 + len(lines) * 16
        self.add(f'<path d="M {x} {y} h {w} v {h-12} l -12 12 h -{w-12} z" fill="{fill}" stroke="{border}"/>')
        for i, ln in enumerate(lines):
            self.add(f'<text x="{x+12}" y="{y+20+i*16}" font-size="10.5" fill="{colour}">{esc(ln)}</text>')
        return h

    def save(self, name):
        self.p.append("</svg>")
        (OUT / name).write_text("\n".join(self.p), encoding="utf-8")
        print("wrote", name)


# =====================================================================
# 1. Kiến trúc ba tầng
# =====================================================================
s = Svg(1420, 940, "Kiến trúc hệ thống ba tầng — ProstaAI")

s.band(50, 70, 1320, 190, "TẦNG TRÌNH BÀY  —  React 19 + TypeScript + Vite (một mã nguồn, hai bản dựng)")
s.box(80, 108, 300, 130, ["Cổng Bác sĩ  ·  :5173", "Tổng quan · Ca bệnh · Tải ảnh",
                          "Trình xem tiêu bản · Đánh dấu", "Phiếu kết quả"], FILL_A)
s.box(410, 108, 300, 130, ["Cổng Quản trị  ·  :5174", "Tổng quan hệ thống · Nhật ký",
                           "Model AI · Người dùng", "Di trú dữ liệu · Xuất thư viện"], FILL_A)
s.box(745, 108, 285, 130, ["Thư viện dùng chung", "lib/api.ts — bọc fetch, gắn JWT",
                           "lib/dzi.ts — OpenSeadragon", "lib/portal.ts — định danh cổng"])
s.box(1060, 108, 280, 130, ["Trình duyệt", "localStorage tách theo origin:",
                            "prostaai_token_doctor", "prostaai_token_admin"])

s.arrow([(710, 285), (710, 320)])
s.text(725, 306, "HTTP/JSON  ·  Authorization: Bearer <JWT>  ·  CORS chỉ cho phép :5173 và :5174", 11, MUTE)

s.band(50, 335, 1320, 300, "TẦNG ỨNG DỤNG  —  FastAPI + SQLAlchemy 2.0  ·  Uvicorn :8000 (một tiến trình)")
s.box(80, 375, 250, 96, ["Lớp bảo mật", "security.py — bcrypt, JWT HS256",
                         "deps.py — get_current_user,", "require_admin"], FILL_B, BORD_B)
s.box(80, 490, 250, 118, ["Lớp API (routers/)", "auth · cases · reviews",
                          "annotations · inference · dzi", "calibration · stats · admin"], FILL_A)
s.box(355, 375, 265, 96, ["Lớp hợp đồng dữ liệu", "schemas/ — Pydantic v2",
                          "kiểm tra vào/ra từng endpoint"])
s.box(355, 490, 265, 118, ["Dịch vụ dùng chung", "audit.py — ghi nhật ký",
                           "preprocessing.py — mờ, mô, màu", "dzi.py — tháp ảnh (pyvips)"])
s.box(650, 375, 300, 96, ["Điều phối tác vụ nền", "BackgroundTasks + Semaphore(1)",
                          "tối đa một lần suy diễn đồng thời"], FILL_C, BORD_C)
s.box(650, 490, 300, 118, ["Quy trình suy diễn (inference/)", "scale.py → tiling.py → pipeline.py",
                           "registry.py — nạp & cache trọng số", "fusion.py — hợp nhất ISUP"], FILL_C, BORD_C)
s.box(975, 375, 365, 233, ["Thư viện xử lý & học sâu", "PyTorch (CPU) · torchvision",
                           "segmentation-models-pytorch", "OpenCV · NumPy · Pillow · pyvips",
                           "scikit-learn · joblib (Stage 3)"])

s.arrow([(500, 660), (500, 700)])
s.text(515, 686, "SQLAlchemy ORM  ·  PRAGMA foreign_keys = ON theo từng kết nối", 11, MUTE)

s.band(50, 715, 1320, 165, "TẦNG DỮ LIỆU  —  lưu trữ cục bộ trên một máy trạm")
s.box(80, 752, 380, 108, ["Cơ sở dữ liệu — SQLite", "database/prostaai.db",
                          "14 bảng, lược đồ do docs/schema.sql sở hữu"], FILL_A)
s.box(490, 752, 400, 108, ["Kho tệp — hệ thống tệp", "backend/uploads/case_N/slide_M/",
                           "ảnh gốc · thu nhỏ · xem nhanh · mặt nạ · tháp DZI"], FILL_A)
s.box(920, 752, 420, 108, ["Kho mô hình", "backend/models/classification · segmentation",
                           "7 tệp .pt  +  machine_learning_fusion/*.joblib"], FILL_C, BORD_C)

s.note(80, 890, 700, ["Không dùng Docker, không hàng đợi tác vụ ngoài, không dịch vụ đám mây — toàn bộ chạy trên một máy trạm phòng thí nghiệm."])
s.save("architecture_diagram.svg")


# =====================================================================
# 2. Sơ đồ luồng nghiệp vụ (activity, ba làn)
# =====================================================================
s = Svg(1380, 1200, "Sơ đồ luồng nghiệp vụ — từ tạo ca bệnh đến phiếu kết quả")

LANES = [(50, 400, "BÁC SĨ"), (470, 420, "HỆ THỐNG (FastAPI)"), (910, 420, "QUY TRÌNH AI (tác vụ nền)")]
for x, w, label in LANES:
    s.add(f'<rect x="{x}" y="70" width="{w}" height="1080" fill="#fbfcfe" stroke="#d8e0ea"/>')
    s.add(f'<rect x="{x}" y="70" width="{w}" height="30" fill="#e8eef7" stroke="#d8e0ea"/>')
    s.text(x + w / 2, 90, label, 12, "#42536b", "700", "middle")

C1, C2, C3 = 250, 680, 1120

s.add(f'<circle cx="{C1}" cy="130" r="12" fill="{NAVY}"/>')
s.arrow([(C1, 142), (C1, 168)])
s.box(C1 - 150, 168, 300, 46, "Tạo ca bệnh (mã số, mã năm, bệnh nhân)")
s.arrow([(C1, 214), (C1, 240)])
s.box(C1 - 150, 240, 300, 46, "Thêm slide vào ca")
s.arrow([(C1, 286), (C1, 312)])
s.box(C1 - 150, 312, 300, 54, ["Tải ảnh lên hoặc chụp trực tiếp", "qua camera kính hiển vi"])
s.arrow([(C1 + 150, 339), (C2 - 150, 339)])
s.box(C2 - 150, 312, 300, 54, ["Tiền xử lý tự động", "kiểm tra mờ · tách mô · chuẩn màu"], FILL_B, BORD_B)
s.arrow([(C2 - 150, 339), (C2 - 180, 339), (C2 - 180, 415), (C1 + 150, 415)])
s.box(C1 - 150, 392, 300, 46, "Chọn kiến trúc mô hình")
s.arrow([(C1, 438), (C1, 464)])
s.box(C1 - 150, 464, 300, 46, 'Bấm "Bắt đầu phân tích"')
s.arrow([(C1 + 150, 487), (C2 - 150, 487)])
s.box(C2 - 150, 464, 300, 46, ["Tạo lần chạy · trạng thái chờ"], FILL_B, BORD_B)

# decision: slot free?
s.add(f'<path d="M {C3} 540 L {C3+110} 585 L {C3} 630 L {C3-110} 585 z" fill="#fdf3e3" stroke="{BORD_C}" stroke-width="1.5"/>')
s.text(C3, 580, "Có chỗ chạy?", 11, INK, "700", "middle")
s.text(C3, 596, "(tối đa 1 lần/lúc)", 10, "#8a7a3f", "400", "middle")
s.arrow([(C2 + 150, 487), (C3, 487), (C3, 540)])
s.arrow([(C3, 630), (C3 - 150, 630), (C3 - 150, 566), (C3 - 110, 566)],
        label="không → giữ trạng thái chờ", lx=C3 - 155, ly=652, anchor="end")
s.arrow([(C3 + 110, 585), (C3 + 150, 585), (C3 + 150, 640), (C3, 640), (C3, 660)], label="có", lx=C3 + 158, ly=580, anchor="start")

s.box(C3 - 160, 660, 320, 54, ["Xác định µm/pixel và cắt mảnh", "theo đúng tỉ lệ vật lý huấn luyện"], FILL_C, BORD_C)
s.arrow([(C3, 714), (C3, 740)])
s.box(C3 - 160, 740, 320, 46, "Giai đoạn 1 — phân đoạn mô 6 lớp", FILL_C, BORD_C)
s.arrow([(C3, 786), (C3, 812)])
s.box(C3 - 160, 812, 320, 54, ["Giai đoạn 2 — phân loại 4 lớp", "trên mảnh có điểm ảnh ung thư"], FILL_C, BORD_C)
s.arrow([(C3, 866), (C3, 892)])
s.box(C3 - 160, 892, 320, 46, "Giai đoạn 3 — hợp nhất ISUP", FILL_C, BORD_C)
s.arrow([(C3, 938), (C3, 964)])

s.add(f'<path d="M {C3} 964 L {C3+100} 1006 L {C3} 1048 L {C3-100} 1006 z" fill="#fdf3e3" stroke="{BORD_C}" stroke-width="1.5"/>')
s.text(C3, 1010, "Thành công?", 11, INK, "700", "middle")
s.arrow([(C3 - 100, 1006), (C2 + 150, 1006)], label="không → ghi lỗi, cho thử lại", lx=C2 + 160, ly=996, anchor="start")
s.arrow([(C3, 1048), (C3, 1075), (C2 + 150, 1075)], label="có", lx=C3 + 14, ly=1066, anchor="start")
s.box(C2 - 150, 1052, 300, 46, "Lưu kết quả · ghi nhật ký", FILL_B, BORD_B)
s.arrow([(C2 - 150, 1075), (C1 + 180, 1075), (C1 + 180, 579), (C1 + 150, 579)])

s.box(C1 - 150, 552, 300, 54, ["Xem mặt nạ AI, đối chiếu tiêu bản,", "đo khoảng cách, khoanh vùng"])
s.box(C1 - 150, 620, 300, 66, ["Hệ thống cảnh báo nếu kết quả", "không đáng tin (không rõ mô, hai",
                               "mô hình mâu thuẫn)"], "#fff5f5", "#d98a8a")
s.arrow([(C1, 606), (C1, 620)])
s.arrow([(C1, 686), (C1, 712)])
s.box(C1 - 150, 712, 300, 54, ["Nhập kết luận của bác sĩ", "mẫu Gleason · PNI · LVI · ghi chú"])
s.arrow([(C1, 766), (C1, 792)])
s.box(C1 - 150, 792, 300, 40, 'Lưu bản nháp')
s.arrow([(C1, 832), (C1, 856)])

s.add(f'<path d="M {C1} 856 L {C1+110} 898 L {C1} 940 L {C1-110} 898 z" fill="#fdf3e3" stroke="{BORD_C}" stroke-width="1.5"/>')
s.text(C1, 894, "Đã đủ căn cứ", 11, INK, "700", "middle")
s.text(C1, 910, "để ký?", 11, INK, "700", "middle")
s.arrow([(C1 - 110, 898), (C1 - 165, 898), (C1 - 165, 745), (C1 - 150, 745)],
        label="chưa → sửa tiếp", lx=C1 - 158, ly=878, anchor="start")
s.arrow([(C1, 940), (C1, 968)], label="rồi", lx=C1 + 14, ly=960, anchor="start")
s.box(C1 - 150, 968, 300, 46, "Xác nhận & khóa đánh giá")
s.arrow([(C1, 1014), (C1, 1040)])
s.box(C1 - 150, 1040, 300, 54, ["Tổng hợp Gleason cấp ca bệnh", "và in phiếu kết quả"])
s.arrow([(C1, 1094), (C1, 1118)])
s.add(f'<circle cx="{C1}" cy="1130" r="12" fill="none" stroke="{NAVY}" stroke-width="2"/>')
s.add(f'<circle cx="{C1}" cy="1130" r="7" fill="{NAVY}"/>')
s.save("workflow_diagram.svg")


# =====================================================================
# 3. Sequence diagram — một yêu cầu phân tích AI
# =====================================================================
s = Svg(1500, 1340, "Biểu đồ tuần tự — xử lý một yêu cầu phân tích AI")

ACTORS = [
    (110, ["Bác sĩ"]),
    (320, ["Giao diện", "Pipeline.tsx"]),
    (560, ["API FastAPI", "routers/inference.py"]),
    (810, ["Tác vụ nền", "Semaphore(1)"]),
    (1060, ["Quy trình AI", "tiling · registry · pipeline"]),
    (1300, ["SQLite", "+ kho tệp"]),
]
TOP, BOT = 78, 1215
for x, lines in ACTORS:
    h = 34 + (len(lines) - 1) * 14
    s.box(x - 95, TOP, 190, h, lines, FILL_A, size=11.5)
    s.line(x, TOP + h, x, BOT, "#c6d3e2", dashed=True)

A, U, P, B, M, D = [a[0] for a in ACTORS]


def msg(y, x1, x2, label, dashed=False, note=None):
    s.arrow([(x1, y), (x2, y)], dashed=dashed)
    mid = (x1 + x2) / 2
    s.text(mid, y - 7, label, 10.5, "#3d4f66", "400", "middle")
    if note:
        s.text(mid, y + 13, note, 9.5, MUTE, "400", "middle", italic=True)


def selfmsg(y, x, label, h=26):
    s.arrow([(x, y), (x + 46, y), (x + 46, y + h), (x + 4, y + h)])
    s.text(x + 54, y + h / 2 + 4, label, 10.5, "#3d4f66")


y = 150
msg(y, A, U, "chọn kiến trúc, bấm “Bắt đầu phân tích”")
y += 44
msg(y, U, P, "POST /api/images/{id}/inference", note="Authorization: Bearer <JWT>")
y += 50
msg(y, P, D, "INSERT inference_runs (status = 'pending')")
y += 40
msg(y, P, B, "lên lịch _execute(run_id)")
y += 40
msg(y, P, U, "201 Created  { run_id, status: 'pending' }", dashed=True)
y += 46

s.add(f'<rect x="{U-120}" y="{y-16}" width="{P-U+250}" height="86" rx="4" fill="none" stroke="#9fb3c8" stroke-dasharray="4 3"/>')
s.text(U - 112, y - 2, "loop  [mỗi 2,5 giây khi còn chờ / đang chạy]", 10, "#5a7794", "700")
msg(y + 26, U, P, "GET /api/images/{id}/inference")
msg(y + 56, P, U, "200  { status }", dashed=True)
y += 108

msg(y, B, B + 0, "")
s.p.pop(); s.p.pop()
selfmsg(y, B, "xin giấy phép chạy (chờ nếu đang bận)")
y += 52
msg(y, B, D, "UPDATE inference_runs SET status = 'running'")
y += 40
msg(y, B, D, "đọc metadata ảnh + bảng hiệu chỉnh µm/pixel")
y += 36
msg(y, D, B, "µm/pixel (metadata tệp → hiệu chỉnh → không có)", dashed=True)
y += 44
msg(y, B, M, "tile_image(ảnh, patch_size_for(µm/pixel))")
y += 40
selfmsg(y, M, "nạp trọng số từ registry (cache trong bộ nhớ)")
y += 52
selfmsg(y, M, "GĐ1 phân đoạn từng mảnh → ghép mặt nạ")
y += 52
selfmsg(y, M, "GĐ2 phân loại mảnh có ung thư → mẫu trội/phụ")
y += 52
selfmsg(y, M, "GĐ3 hợp nhất ISUP (2 mạng, toàn bộ mảnh mô)")
y += 56
msg(y, M, D, "ghi tệp mặt nạ PNG")
y += 36
msg(y, M, B, "kết quả ba giai đoạn", dashed=True)
y += 44
msg(y, B, D, "INSERT segmentation/classification/stage3_results")
y += 36
msg(y, B, D, "UPDATE status = 'completed'  ·  INSERT audit_logs")
y += 40
selfmsg(y, B, "trả lại giấy phép chạy", 22)
y += 50
msg(y, U, P, "GET /api/images/{id}/inference")
y += 36
msg(y, P, U, "200  { status: 'completed', kết quả đầy đủ }", dashed=True)
y += 36
msg(y, U, A, "hiển thị “Hoàn tất” và nút Xem kết quả")

s.add(f'<rect x="{B-150}" y="{BOT+30}" width="620" height="44" rx="4" fill="#fff5f5" stroke="#d98a8a"/>')
s.text(B - 140, BOT + 46, "alt  [lỗi bất kỳ trong quá trình xử lý]", 10, "#a34a4a", "700")
s.text(B - 140, BOT + 64, "UPDATE status = 'failed', error_message — không bao giờ kẹt ở 'running'", 10, "#a34a4a")
s.save("sequence_diagram.svg")


# =====================================================================
# 4. Phân quyền và tách cổng
# =====================================================================
s = Svg(1440, 860, "Sơ đồ phân quyền và tách hai cổng truy cập")

s.band(45, 70, 380, 330, "TRÌNH DUYỆT — hai origin, hai phiên độc lập")
s.box(70, 112, 330, 116, ["http://localhost:5173", "Cổng Bác sĩ", "localStorage: prostaai_token_doctor"], FILL_A)
s.box(70, 252, 330, 116, ["http://localhost:5174", "Cổng Quản trị", "localStorage: prostaai_token_admin"], FILL_A)

s.arrow([(400, 170), (520, 170), (520, 300)])
s.arrow([(400, 310), (520, 310)])
s.text(432, 160, "HTTPS/JSON", 10, MUTE)

s.band(500, 70, 420, 660, "MÁY CHỦ — chuỗi kiểm tra trên mọi yêu cầu")
s.box(525, 112, 370, 62, ["Danh sách CORS cho phép", "chỉ :5173 và :5174 — origin khác bị từ chối"], FILL_B, BORD_B)
s.arrow([(710, 174), (710, 200)])
s.box(525, 200, 370, 62, ["HTTPBearer — đọc header Authorization", "thiếu hoặc sai định dạng → 401"], FILL_B, BORD_B)
s.arrow([(710, 262), (710, 288)])
s.box(525, 288, 370, 74, ["Giải mã JWT (HS256, JWT_SECRET)", "hết hạn hoặc chữ ký sai → 401"], FILL_B, BORD_B)
s.arrow([(710, 362), (710, 388)])
s.box(525, 388, 370, 74, ["get_current_user — nạp người dùng", "tài khoản bị khóa → 401"], FILL_B, BORD_B)
s.arrow([(710, 462), (710, 492)])

s.add(f'<path d="M 710 492 L 850 546 L 710 600 L 570 546 z" fill="#fdf3e3" stroke="{BORD_C}" stroke-width="1.5"/>')
s.text(710, 542, "Tuyến có gắn", 11, INK, "700", "middle")
s.text(710, 558, "require_admin?", 11, INK, "700", "middle")

# Login is a public route: it never reaches HTTPBearer, so it is shown as its own
# short chain rather than as a branch of the authorisation decision.
s.box(525, 630, 370, 84, ["Ngoại lệ — tuyến công khai", "POST /api/auth/login không qua HTTPBearer;",
                          "khóa 15 phút sau 5 lần sai theo tên", "đăng nhập → 429"], "#fff5f5", "#d98a8a")

s.band(940, 70, 470, 660, "TÀI NGUYÊN")
s.box(965, 112, 420, 130, ["Mọi vai trò đã đăng nhập", "/api/auth · /api/cases · /api/images",
                           "/api/reviews · /api/models · /api/stats", "GET /api/calibration"], FILL_A)
s.box(965, 330, 420, 130, ["Chỉ vai trò admin", "/api/admin/* — người dùng, nhật ký,",
                           "mô hình, di trú, xuất thư viện,", "PUT /api/admin/calibration"], FILL_C, BORD_C)
s.box(965, 540, 420, 96, ["Vai trò không phải admin", "→ 403 Forbidden, kể cả khi giao diện",
                          "vẫn hiển thị đường dẫn tới màn hình đó"], "#fff5f5", "#d98a8a")

# one trunk out of the decision, then three labelled outcomes
s.line(850, 546, 935, 546, LINE, width=1.4)
s.arrow([(935, 546), (935, 177), (965, 177)], label="không · 200 OK", lx=945, ly=200, anchor="start")
s.arrow([(935, 546), (935, 395), (965, 395)], label="có, role = admin · 200 OK", lx=945, ly=418, anchor="start")
s.arrow([(935, 546), (935, 588), (965, 588)], label="có, role ≠ admin · 403", lx=945, ly=610, anchor="start")

s.note(45, 430, 430, [
    "Tách cổng giải quyết xung đột PHIÊN LÀM VIỆC, không phải",
    "kiểm soát truy cập: hai origin nên localStorage tách biệt, mở",
    "đồng thời hai vai trò không còn ghi đè token của nhau.",
    "Hai cổng dựng từ cùng một mã nguồn và ship cùng một gói —",
    "quyền thật do máy chủ cưỡng chế trên từng lời gọi API.",
])
s.note(45, 580, 430, [
    "Mô hình phân quyền phẳng, đúng hai vai trò (user / admin).",
    "Không có quyền sở hữu ca bệnh theo từng bác sĩ.",
], fill="#f4f7fb", border="#c6d3e2", colour="#3d4f66")
s.save("authorization_diagram.svg")
