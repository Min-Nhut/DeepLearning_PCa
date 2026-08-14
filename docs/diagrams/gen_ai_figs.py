"""Three figures for the AI chapter: pipeline data flow, scale-ablation charts,
dataset preparation & split."""
from pathlib import Path

OUT = Path(r"D:\LV\docs")
FONT = "Segoe UI, Arial, sans-serif"

INK, INK2, MUTED = "#0b0b0b", "#52514e", "#898781"
GRID, BASELINE, SURFACE = "#e1e0d9", "#c3c2b7", "#fcfcfb"
# Categorical slots 1-3 of the validated palette (light mode).
C1, C2, C3 = "#2a78d6", "#eb6834", "#1baf7a"

NAVY, LINE = "#1e3a5f", "#42536b"
F_BLUE, F_GREEN, F_AMBER = "#e8eef7", "#eef7f0", "#fdf3e3"
B_BLUE, B_GREEN, B_AMBER = "#2c4a6e", "#2f6f4f", "#b8860b"


def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Svg:
    def __init__(self, w, h, title, sub=None):
        self.w, self.h, self.p = w, h, []
        self.p.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="{FONT}">')
        self.p.append('<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
                      f'orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{LINE}"/></marker></defs>')
        self.p.append(f'<rect width="{w}" height="{h}" fill="{SURFACE}"/>')
        self.p.append(f'<text x="{w//2}" y="34" text-anchor="middle" font-size="18" font-weight="700" fill="{INK}">{esc(title)}</text>')
        if sub:
            self.p.append(f'<text x="{w//2}" y="55" text-anchor="middle" font-size="11.5" fill="{MUTED}">{esc(sub)}</text>')

    def add(self, s):
        self.p.append(s)

    def box(self, x, y, w, h, lines, fill="#ffffff", border=B_BLUE, size=11.5, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{border}" stroke-width="1.5"{d}/>')
        if isinstance(lines, str):
            lines = [lines]
        total = len(lines) * (size + 3) - 3
        ty = y + h / 2 - total / 2 + size - 2
        for i, ln in enumerate(lines):
            fw = "700" if i == 0 else "400"
            col = INK if i == 0 else "#3d4f66"
            fs = size if i == 0 else size - 1.2
            self.add(f'<text x="{x+w/2}" y="{ty+i*(size+3)}" text-anchor="middle" font-size="{fs}" font-weight="{fw}" fill="{col}">{esc(ln)}</text>')

    def band(self, x, y, w, h, label, fill="#f7f9fc", border="#d8e0ea"):
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{border}" stroke-dasharray="5 4"/>')
        self.add(f'<text x="{x+14}" y="{y+20}" font-size="12" font-weight="700" fill="#42536b">{esc(label)}</text>')

    def arrow(self, pts, label=None, lx=None, ly=None, anchor="middle", dashed=False):
        d = " ".join(f"{a},{b}" for a, b in pts)
        st = ' stroke-dasharray="5 4"' if dashed else ""
        self.add(f'<polyline points="{d}" fill="none" stroke="{LINE}" stroke-width="1.4"{st} marker-end="url(#a)"/>')
        if label:
            self.add(f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" font-size="10" font-family="{FONT}" fill="{MUTED}">{esc(label)}</text>')

    def text(self, x, y, s, size=11, fill="#3d4f66", weight="400", anchor="start", mono=False, italic=False):
        fam = ' font-family="Consolas, monospace"' if mono else ""
        it = ' font-style="italic"' if italic else ""
        self.add(f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" font-weight="{weight}" fill="{fill}"{fam}{it}>{esc(s)}</text>')

    def note(self, x, y, w, lines, fill="#fffbe9", border="#d9c98a", colour="#6b5b23"):
        h = 14 + len(lines) * 16
        self.add(f'<path d="M {x} {y} h {w} v {h-12} l -12 12 h -{w-12} z" fill="{fill}" stroke="{border}"/>')
        for i, ln in enumerate(lines):
            self.add(f'<text x="{x+12}" y="{y+20+i*16}" font-size="10.5" fill="{colour}">{esc(ln)}</text>')

    def column(self, x, y_base, w, h, colour, r=4):
        """4px rounded data-end, square at the baseline."""
        if h <= 0:
            return
        r = min(r, w / 2, h)
        self.add(f'<path d="M {x} {y_base} v {-(h-r)} a {r} {r} 0 0 1 {r} {-r} h {w-2*r} '
                 f'a {r} {r} 0 0 1 {r} {r} v {h-r} z" fill="{colour}"/>')

    def save(self, name):
        self.p.append("</svg>")
        (OUT / name).write_text("\n".join(self.p), encoding="utf-8")
        print("wrote", name)


# =====================================================================
# FIGURE 1 — luồng dữ liệu qua ba giai đoạn AI
# =====================================================================
s = Svg(1580, 1210, "Luồng dữ liệu qua quy trình suy diễn ba giai đoạn",
        "Kích thước tensor ghi trên từng bước; mọi hằng số lấy trực tiếp từ mã nguồn")

s.band(45, 74, 1490, 152, "CHUẨN BỊ ĐẦU VÀO — đưa ảnh về đúng tỉ lệ vật lý lúc huấn luyện")
PREP = [
    (70, 240, ["Ảnh vi trường", "H × W × 3 (BGR)"]),
    (348, 250, ["Xác định µm/pixel", "thẻ tệp → hiệu chỉnh vật kính", "→ không có thì giữ nguyên"]),
    (636, 250, ["patch_size_for()", "lưới N px sao cho mỗi mảnh", "phủ đúng 243,1 µm"]),
    (924, 250, ["Cắt lưới, biên dịch vào trong", "mỗi mảnh sở hữu riêng", "w_valid × h_valid"]),
    (1212, 268, ["Lọc mô, chuẩn màu, đệm biên", "ngưỡng bão hòa ≥ 40 + mở 3×3", "Macenko chỉ khi ΔLAB > 30"]),
]
for x, w, lines in PREP:
    s.box(x, 112, w, 96, lines, F_BLUE)
for i in range(len(PREP) - 1):
    x0 = PREP[i][0] + PREP[i][1]
    s.arrow([(x0, 160), (PREP[i + 1][0], 160)])

s.arrow([(1346, 208), (1346, 232), (790, 232), (790, 256)])
s.box(540, 256, 500, 54, ["Mảnh 500 × 500 × 3 — đầu vào chung cho cả ba giai đoạn"], F_AMBER, B_AMBER, size=12.5)

# --- lane 1: segmentation ---
s.band(45, 340, 470, 700, "GIAI ĐOẠN 1 — PHÂN ĐOẠN 6 LỚP")
L1 = 280
seg = [
    (382, 62, ["Resize 500 → 256 (song tuyến)", "chuẩn hóa ImageNet"]),
    (466, 54, ["U-Net (DenseNet121 / EfficientNet_b0)", "hoặc DeepLabV3+"]),
    (542, 46, ["logits 6 × 256 × 256"]),
    (610, 46, ["argmax → nhãn 256 × 256"]),
    (678, 62, ["Resize 256 → 500", "NGƯỜI GẦN NHẤT — bắt buộc"]),
    (762, 62, ["Ghép theo vùng sở hữu", "không chồng lấn, không bỏ sót"]),
    (846, 62, ["Mặt nạ H × W, nhãn 0–5", "nền · mô đệm · lành tính · G3 · G4 · G5"]),
    (930, 62, ["Đếm diện tích", "ung thư {3,4,5} / mô {2,3,4,5}"]),
]
for y, h, lines in seg:
    s.box(70, y, 420, h, lines, "#ffffff", B_BLUE, size=11)
for i in range(len(seg) - 1):
    s.arrow([(L1, seg[i][0] + seg[i][1]), (L1, seg[i + 1][0])])
s.arrow([(L1, 992), (L1, 1016)])
s.box(70, 1016, 420, 44, ["segmentation_results"], F_BLUE, B_BLUE, size=12)

# --- lane 2: classification, gated by lane 1 ---
s.band(540, 340, 470, 700, "GIAI ĐOẠN 2 — PHÂN LOẠI 4 LỚP (qua cổng lọc)")
L2 = 775
s.add(f'<path d="M {L2} 382 L {L2+150} 432 L {L2} 482 L {L2-150} 432 z" fill="{F_AMBER}" stroke="{B_AMBER}" stroke-width="1.5"/>')
s.text(L2, 424, "Mảnh có điểm ảnh", 11, INK, "700", "middle")
s.text(L2, 440, "thuộc lớp 3 / 4 / 5?", 11, INK, "700", "middle")
s.arrow([(490, 900), (516, 900), (516, 432), (625, 432)])
# The corridor is the only free space here — set the label along it.
s.add(f'<text transform="translate(510,760) rotate(-90)" text-anchor="middle" font-size="10" fill="{MUTED}">dự đoán từng mảnh của GĐ1</text>')
s.arrow([(L2 + 150, 432), (L2 + 172, 432), (L2 + 172, 500), (L2, 500), (L2, 512)], label="có", lx=L2 + 180, ly=470, anchor="start")
s.text(600, 470, "không → bỏ qua mảnh", 10, MUTED, "400", "start")

clf = [
    (512, 62, ["Resize 500 → 224 (song tuyến)", "chuẩn hóa ImageNet"]),
    (596, 54, ["DenseNet121 / EfficientNet_b0", "Inception_v3 / ViT-B/16"]),
    (672, 46, ["logits 4 → softmax"]),
    (740, 62, ["argmax", "lớp 0 = lành tính → bỏ qua mảnh"]),
    (824, 62, ["Cộng diện tích theo mẫu", "đếm trong vùng sở hữu của mảnh"]),
    (908, 62, ["Xếp hạng theo diện tích", "mẫu trội / mẫu phụ + độ tin cậy"]),
]
for y, h, lines in clf:
    s.box(565, y, 420, h, lines, "#ffffff", B_BLUE, size=11)
for i in range(len(clf) - 1):
    s.arrow([(L2, clf[i][0] + clf[i][1]), (L2, clf[i + 1][0])])
s.arrow([(L2, 970), (L2, 1016)])
s.box(565, 1016, 420, 44, ["classification_results"], F_BLUE, B_BLUE, size=12)

# --- lane 3: stage 3 fusion, independent ---
s.band(1035, 340, 500, 700, "GIAI ĐOẠN 3 — HỢP NHẤT ISUP (nhánh độc lập)")
L3 = 1285
s.arrow([(1040, 283), (1285, 283), (1285, 382)], label="toàn bộ mảnh có mô — KHÔNG qua cổng lọc của GĐ2", lx=1285, ly=305)
fus = [
    (382, 62, ["Resize 500 → 224", "chuẩn hóa ImageNet"]),
    (466, 62, ["Hai mạng cố định", "densenet121 + efficientnet_b0"]),
    (550, 62, ["softmax 4 lớp mỗi mạng", "trung bình trên MỌI mảnh có mô"]),
    (634, 62, ["Vector 8 đặc trưng", "2 mạng × 4 lớp, đúng thứ tự metadata"]),
    (718, 46, ["StandardScaler"]),
    (786, 62, ["MLPClassifier", "6 lớp ISUP (0–5)"]),
    (870, 62, ["Nhóm ISUP + độ tin cậy", "predict_proba của lớp được chọn"]),
]
for y, h, lines in fus:
    s.box(1060, y, 450, h, lines, "#ffffff", B_GREEN if y > 400 else B_BLUE, size=11)
for i in range(len(fus) - 1):
    s.arrow([(L3, fus[i][0] + fus[i][1]), (L3, fus[i + 1][0])])
s.arrow([(L3, 932), (L3, 1016)])
s.box(1060, 1016, 450, 44, ["stage3_results"], F_GREEN, B_GREEN, size=12)

s.note(45, 1084, 900, [
    "Vì sao giai đoạn 3 chạy phân loại lần thứ hai thay vì dùng lại kết quả của giai đoạn 2: mô hình hợp nhất được huấn luyện trên phân bố lớp",
    "tính trên TOÀN BỘ mảnh có mô. Nếu lấy kết quả đã bị cổng lọc của giai đoạn 2 loại bớt, tỉ lệ lớp lành tính sẽ thấp một cách giả tạo và",
    "vector đặc trưng không còn khớp với dữ liệu huấn luyện.",
])
s.save("pipeline_dataflow.svg")


# =====================================================================
# FIGURE 2 — biểu đồ kết quả thí nghiệm tỉ lệ vật lý
# =====================================================================
COND = [
    ("Đúng tỉ lệ\n(mức trần)", C1),
    ("Không hiệu chỉnh\n(hệ thống hiện tại)", C2),
    ("Có hiệu chỉnh\ntỉ lệ", C3),
]
ACC = [83.6, 33.0, 79.6]
CONF = [64.1, 79.1, 63.8]


def panel(s, x0, y0, pw, ph, values, title, note=None):
    """One 0–100% column panel. Single measure, colour carries the condition."""
    s.text(x0, y0 - 14, title, 12.5, INK, "700")
    base = y0 + ph
    for v in range(0, 101, 20):                      # recessive hairline grid
        gy = base - ph * v / 100
        s.add(f'<line x1="{x0}" y1="{gy}" x2="{x0+pw}" y2="{gy}" stroke="{GRID}" stroke-width="1"/>')
        s.text(x0 - 10, gy + 4, f"{v}", 10.5, MUTED, "400", "end")
    s.add(f'<line x1="{x0}" y1="{base}" x2="{x0+pw}" y2="{base}" stroke="{BASELINE}" stroke-width="1"/>')
    s.text(x0 - 10, y0 - 10, "%", 10.5, MUTED, "400", "end")
    slot = pw / len(values)
    bw = 24                                          # cap bar thickness, leave air
    for i, v in enumerate(values):
        cx = x0 + slot * (i + 0.5)
        s.column(cx - bw / 2, base, bw, ph * v / 100, COND[i][1])
        s.text(cx, base - ph * v / 100 - 9, f"{v:.1f}%".replace(".", ","), 11.5, INK, "700", "middle")
    if note:
        s.text(x0, base + 34, note, 10.5, MUTED, "400", italic=True)


s = Svg(1180, 620, "Ảnh hưởng của sai lệch tỉ lệ vật lý đến kết quả phân loại",
        "324 vùng ảnh PANDA có nhãn thật, 35 tiêu bản · mô hình gộp 4 kiến trúc · nguồn: docs/ABLATION_SCALE.md")

panel(s, 110, 130, 430, 340, ACC, "Độ chính xác",
      "Hiệu chỉnh lấy lại 79,6% so với mức trần 83,6%.")
panel(s, 690, 130, 430, 340, CONF, "Độ tin cậy trung bình của mô hình",
      "Điều kiện sai nhất lại là điều kiện tự tin nhất.")

# legend — always present for ≥2 series; text wears ink, never the series colour
lx = 110
s.text(lx, 545, "Điều kiện thí nghiệm", 11, INK2, "700")
for i, (label, col) in enumerate(COND):
    cx = lx + i * 330
    s.add(f'<rect x="{cx}" y="{562}" width="14" height="14" rx="3" fill="{col}"/>')
    for j, ln in enumerate(label.split("\n")):
        s.text(cx + 22, 573 + j * 14, ln, 10.5, INK2)
s.save("chart_scale_ablation.svg")


# =====================================================================
# FIGURE 2b — sụp đổ theo từng lớp
# =====================================================================
CLASSES = [("Lành tính", 45), ("Gleason 3", 96), ("Gleason 4", 133), ("Gleason 5", 50)]
PER_CLASS = {          # ceiling, no_correct, corrected
    "Lành tính": [100.0, 100.0, 97.8],
    "Gleason 3": [78.1, 49.0, 72.9],
    "Gleason 4": [88.0, 9.8, 87.2],
    "Gleason 5": [68.0, 4.0, 56.0],
}

s = Svg(1180, 672, "Độ chính xác theo từng lớp mô khi sai tỉ lệ vật lý",
        "Chỉ lớp lành tính sống sót — mọi lớp ung thư đều sụp đổ, tức sai theo hướng âm tính giả")

x0, y0, pw, ph = 110, 120, 980, 340
base = y0 + ph
for v in range(0, 101, 20):
    gy = base - ph * v / 100
    s.add(f'<line x1="{x0}" y1="{gy}" x2="{x0+pw}" y2="{gy}" stroke="{GRID}" stroke-width="1"/>')
    s.text(x0 - 10, gy + 4, f"{v}", 10.5, MUTED, "400", "end")
s.add(f'<line x1="{x0}" y1="{base}" x2="{x0+pw}" y2="{base}" stroke="{BASELINE}" stroke-width="1"/>')
s.text(x0 - 10, y0 - 12, "%", 10.5, MUTED, "400", "end")

gslot = pw / len(CLASSES)
bw, gap = 24, 2          # 2px surface gap between adjacent bars
for gi, (cls, n) in enumerate(CLASSES):
    gx = x0 + gslot * gi
    vals = PER_CLASS[cls]
    group_w = len(vals) * bw + (len(vals) - 1) * gap
    sx = gx + gslot / 2 - group_w / 2
    for i, v in enumerate(vals):
        bx = sx + i * (bw + gap)
        s.column(bx, base, bw, ph * v / 100, COND[i][1])
        if i == 1:      # direct-label only the series the story is about
            s.text(bx + bw / 2, base - ph * v / 100 - 9, f"{v:.1f}".replace(".", ","), 11.5, INK, "700", "middle")
    s.text(gx + gslot / 2, base + 24, cls, 12, INK, "700", "middle")
    s.text(gx + gslot / 2, base + 40, f"n = {n}", 10.5, MUTED, "400", "middle")

s.text(x0, 545, "Điều kiện thí nghiệm", 11, INK2, "700")
for i, (label, col) in enumerate(COND):
    cx = x0 + i * 330
    s.add(f'<rect x="{cx}" y="{562}" width="14" height="14" rx="3" fill="{col}"/>')
    for j, ln in enumerate(label.split("\n")):
        s.text(cx + 22, 573 + j * 14, ln, 10.5, INK2)
s.text(x0, 622, "Nhãn giá trị chỉ ghi cho điều kiện không hiệu chỉnh — điều kiện mà biểu đồ nói về; số đầy đủ của cả ba điều kiện", 10, MUTED, italic=True)
s.text(x0, 638, "xem bảng trong docs/ABLATION_SCALE.md.", 10, MUTED, italic=True)
s.save("chart_scale_per_class.svg")


# =====================================================================
# FIGURE 3 — chuẩn bị dữ liệu và chia tập
# =====================================================================
s = Svg(1440, 1040, "Quy trình chuẩn bị dữ liệu và chia tập huấn luyện",
        "Một lần chia duy nhất dùng chung cho cả hai nhánh mô hình — cơ chế chống rò rỉ dữ liệu")

CX = 720
s.box(CX - 220, 80, 440, 60, ["Bộ dữ liệu PANDA (Kaggle)", "Prostate cANcer graDe Assessment"], F_BLUE)
s.arrow([(CX, 140), (CX, 168)])
s.box(CX - 260, 168, 520, 66, ["Chỉ giữ tiêu bản của Radboud University Medical Center",
                               "Karolinska có mặt nạ thô hơn (nền / lành tính / ung thư) nên phải loại"], F_AMBER, B_AMBER)
s.arrow([(CX, 234), (CX, 262)])

s.band(300, 262, 840, 118, "KIỂM SOÁT CHẤT LƯỢNG — bốn bước")
qc = ["Loại mặt nạ rỗng\nhoặc thiếu", "Đối chiếu nhãn Gleason\n/ ISUP với bảng tham chiếu",
      "Loại danh sách\nnhãn nhiễu đã biết", "Kiểm tra thị giác\nthủ công"]
for i, q in enumerate(qc):
    bx = 322 + i * 202
    s.box(bx, 300, 186, 74, q.split("\n"), "#ffffff", B_AMBER, size=10.5)
    if i:
        s.arrow([(bx - 16, 337), (bx, 337)])
s.arrow([(CX, 380), (CX, 466)])

s.box(CX - 300, 466, 600, 72, ["Danh sách ca sạch: 3.204 ca",
                               "manifest.csv ghi 3.170 ca / 151.596 mảnh — hai con số lấy ở hai điểm khác nhau",
                               "của quy trình và chưa được đối chiếu; cần thống nhất khi viết chương Dữ liệu"], "#ffffff", B_AMBER)
s.arrow([(CX, 538), (CX, 566)])
s.box(CX - 300, 566, 600, 72, ["Cắt mảnh 500 × 500 ở mức phân giải gốc (0,48619 µm/pixel)",
                               "cửa sổ biên dịch vào trong nên không có mảnh đệm trắng;",
                               "ảnh lưu JPEG, mặt nạ lưu PNG không mất mát"], F_BLUE)
s.arrow([(CX, 638), (CX, 666)])
s.box(CX - 300, 666, 600, 66, ["Gán nhãn mảnh theo quy tắc của bài báo tham chiếu",
                               "lành tính: 100% biểu mô lành tính · Gleason 3/4/5: mẫu đó chiếm ≥ 50% diện tích biểu mô",
                               "mảnh không đạt ngưỡng nào thì không có nhãn phân loại"], F_BLUE)
s.arrow([(CX, 732), (CX, 762)])
s.box(CX - 300, 762, 600, 66, ["Chia 80 / 10 / 10 THEO CA BỆNH",
                               "phân tầng theo nhãn đa số của từng ca — không chia theo mảnh,",
                               "nên không mảnh nào của một ca lọt sang tập khác"], F_GREEN, B_GREEN)

s.arrow([(CX - 100, 828), (CX - 100, 856), (330, 856), (330, 884)])
s.arrow([(CX + 100, 828), (CX + 100, 856), (1110, 856), (1110, 884)])
s.box(140, 884, 380, 76, ["Nhánh phân loại", "chỉ dùng mảnh CÓ nhãn",
                          "4 lớp: lành tính · G3 · G4 · G5"], F_BLUE)
s.box(920, 884, 380, 76, ["Nhánh phân đoạn", "dùng MỌI mảnh có mặt nạ",
                          "6 lớp, dùng lại đúng lần chia bên trái"], F_BLUE)

s.arrow([(CX, 828), (CX, 884)])
s.box(560, 884, 320, 76, ["Nhánh hợp nhất (giai đoạn 3)", "huấn luyện trên tập val + test",
                          "634 ca — không còn tập độc lập thứ ba"], F_GREEN, B_GREEN)

s.note(140, 976, 1160, [
    "Chia theo ca bệnh chứ không theo mảnh, và hai nhánh mô hình dùng chung đúng một lần chia: nhờ vậy không có mảnh nào của cùng một tiêu bản",
    "xuất hiện đồng thời ở tập huấn luyện và tập kiểm thử, kể cả khi một bước sau này kết hợp đặc trưng của cả hai nhánh trên cùng một ca.",
])
s.save("dataset_split_diagram.svg")
