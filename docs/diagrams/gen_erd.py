"""Generate the ERD SVG straight from the live schema, so no column can drift."""
import sqlite3
from pathlib import Path

DB = Path(r"D:\LV\database\prostaai.db")
OUT = Path(r"D:\LV\docs\erd_diagram.svg")

# x, y, width  — heights are computed from the real column count
LAYOUT = {
    "cases":                    (50, 70, 250),
    "slides":                   (350, 70, 230),
    "images":                   (630, 70, 250),
    "inference_runs":           (930, 70, 275),
    "segmentation_results":     (1255, 70, 255),
    "classification_results":   (1255, 258, 255),
    "stage3_results":           (1255, 470, 255),
    "preprocessing_results":    (630, 395, 250),
    "manual_annotations":       (630, 600, 250),
    "diagnostic_reviews":       (930, 330, 275),
    "reports":                  (50, 365, 250),
    "users":                    (50, 540, 250),
    "audit_logs":               (50, 745, 250),
    "magnification_calibration": (350, 560, 240),
}

VN = {
    "users": "Người dùng",
    "cases": "Ca bệnh",
    "slides": "Slide (lam kính)",
    "images": "Ảnh vi trường",
    "preprocessing_results": "Kết quả tiền xử lý",
    "inference_runs": "Lần chạy AI",
    "segmentation_results": "Kết quả phân đoạn",
    "classification_results": "Kết quả phân loại",
    "stage3_results": "Kết quả hợp nhất ISUP",
    "diagnostic_reviews": "Đánh giá chẩn đoán",
    "manual_annotations": "Vùng khoanh thủ công",
    "reports": "Phiếu kết quả đã xuất",
    "audit_logs": "Nhật ký thao tác",
    "magnification_calibration": "Hiệu chỉnh µm/pixel",
}

HDR, ROW, PAD = 40, 17, 10

db = sqlite3.connect(DB)
cur = db.cursor()
tables = {}
for name in LAYOUT:
    cols = list(cur.execute(f"PRAGMA table_info({name})"))
    fks = {f[3]: f[2] for f in cur.execute(f"PRAGMA foreign_key_list({name})")}
    rows = []
    for c in cols:
        col, typ, notnull, pk = c[1], c[2], c[3], c[5]
        tag = "PK" if pk else ("FK" if col in fks else ("*" if notnull else ""))
        rows.append((col, typ, tag, fks.get(col)))
    tables[name] = rows
db.close()

boxes = {}
for name, (x, y, w) in LAYOUT.items():
    boxes[name] = dict(x=x, y=y, w=w, h=HDR + len(tables[name]) * ROW + PAD)

p = []
add = p.append


def box(name):
    b, x, y, w, h = boxes[name], *[boxes[name][k] for k in ("x", "y", "w", "h")]
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#ffffff" stroke="#1e3a5f" stroke-width="1.6"/>')
    add(f'<path d="M {x} {y+HDR} h {w} v -{HDR-6} a 6 6 0 0 0 -6 -6 h -{w-12} a 6 6 0 0 0 -6 6 z" fill="#e8eef7" stroke="#1e3a5f" stroke-width="1.6"/>')
    add(f'<text x="{x+10}" y="{y+17}" font-size="12.5" font-weight="700" fill="#12263f">{name}</text>')
    add(f'<text x="{x+10}" y="{y+32}" font-size="10.5" fill="#5a6b82">{VN[name]}</text>')
    for i, (col, typ, tag, ref) in enumerate(tables[name]):
        ty = y + HDR + 13 + i * ROW
        colour = "#12263f" if tag in ("PK", "FK") else "#3d4f66"
        weight = "700" if tag == "PK" else "400"
        deco = ' text-decoration="underline"' if tag == "PK" else ""
        add(f'<text x="{x+12}" y="{ty}" font-size="11" font-weight="{weight}" fill="{colour}"{deco}>{col}</text>')
        badge = {"PK": "PK", "FK": "FK", "*": "•"}.get(tag, "")
        if badge:
            fill = "#b8860b" if tag == "PK" else ("#2f6f4f" if tag == "FK" else "#9aa7b8")
            add(f'<text x="{x+w-12}" y="{ty}" font-size="9.5" font-weight="700" fill="{fill}" text-anchor="end">{badge}</text>')


def edge(pts, one=None, many=None, dashed=False, label=None):
    d = " ".join(f"{x},{y}" for x, y in pts)
    style = ' stroke-dasharray="5 4"' if dashed else ""
    col = "#8899ad" if dashed else "#42536b"
    add(f'<polyline points="{d}" fill="none" stroke="{col}" stroke-width="1.4"{style}/>')
    if one:
        add(f'<text x="{one[0]}" y="{one[1]}" font-size="11" font-weight="700" fill="#2f5d8f">1</text>')
    if many:
        add(f'<text x="{many[0]}" y="{many[1]}" font-size="11" font-weight="700" fill="#2f5d8f">N</text>')
    if label:
        add(f'<text x="{label[0]}" y="{label[1]}" font-size="9.5" font-style="italic" fill="#8899ad">{label[2]}</text>')


W, H = 1560, 1000
add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Segoe UI, Arial, sans-serif">')
add(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
add('<text x="780" y="30" text-anchor="middle" font-size="18" font-weight="700" fill="#12263f">Sơ đồ quan hệ thực thể (ERD) — Cơ sở dữ liệu ProstaAI</text>')


# ---- structural relationships (drawn first so boxes sit on top) ----
b = boxes
edge([(300, 150), (350, 150)], one=(306, 145), many=(332, 145))          # cases 1-N slides
edge([(580, 150), (630, 150)], one=(586, 145), many=(612, 145))          # slides 1-N images
edge([(880, 150), (930, 150)], one=(886, 145), many=(912, 145))          # images 1-N runs
edge([(1205, 130), (1255, 130)], one=(1211, 125), many=(1240, 125))      # run 1-1 segmentation
edge([(1205, 170), (1230, 170), (1230, 350), (1255, 350)], one=(1211, 165), many=(1240, 345))
edge([(1205, 210), (1218, 210), (1218, 545), (1255, 545)], one=(1211, 205), many=(1240, 540))
edge([(700, 358), (700, 395)], one=(706, 376), many=(706, 392))          # image 1-1 preprocessing
edge([(630, 300), (612, 300), (612, 660), (630, 660)], one=(618, 295), many=(636, 675))
edge([(820, 358), (820, 375), (930, 375)], one=(826, 353), many=(906, 370))
edge([(1030, 290), (1030, 330)], one=(1036, 308), many=(1036, 326), dashed=True)
edge([(160, 324), (160, 365)], one=(166, 342), many=(166, 362))          # case 1-N reports

# ---- users relationships, routed on the margins so they cross no table ----
edge([(50, 575), (22, 575), (22, 48), (170, 48), (170, 70)], one=(28, 570), many=(176, 66), dashed=True)
edge([(22, 48), (760, 48), (760, 70)], many=(766, 66), dashed=True)
edge([(760, 48), (1080, 48), (1080, 70)], many=(1086, 66), dashed=True)
edge([(230, 540), (230, 500)], one=(236, 536), many=(236, 496), dashed=True)
edge([(120, 709), (120, 745)], one=(126, 726), many=(126, 742), dashed=True)
edge([(300, 620), (350, 620)], one=(306, 615), many=(332, 615), dashed=True)
edge([(300, 690), (330, 690), (330, 960), (700, 960), (700, 786)], one=(306, 685), many=(706, 800), dashed=True)
edge([(700, 960), (910, 960), (910, 700), (930, 700)], many=(906, 694), dashed=True)

for name in LAYOUT:
    box(name)

# ---- legend ----
add('<rect x="930" y="790" width="580" height="112" rx="6" fill="#fbfcfe" stroke="#d8e0ea"/>')
add('<text x="944" y="810" font-size="11.5" font-weight="700" fill="#42536b">Chú giải</text>')
add('<text x="944" y="830" font-size="11" fill="#3d4f66"><tspan font-weight="700" fill="#b8860b">PK</tspan>  khóa chính (gạch chân)   <tspan font-weight="700" fill="#2f6f4f">FK</tspan>  khóa ngoại   <tspan font-weight="700" fill="#9aa7b8">•</tspan>  bắt buộc nhập</text>')
add('<line x1="944" y1="848" x2="990" y2="848" stroke="#42536b" stroke-width="1.4"/>')
add('<text x="1000" y="852" font-size="11" fill="#3d4f66">Quan hệ cấu trúc dữ liệu</text>')
add('<line x1="1210" y1="848" x2="1256" y2="848" stroke="#8899ad" stroke-width="1.4" stroke-dasharray="5 4"/>')
add('<text x="1266" y="852" font-size="11" fill="#3d4f66">Tham chiếu người thực hiện</text>')
add('<text x="944" y="872" font-size="11" fill="#3d4f66">1 — N: một bản ghi bên 1 ứng với nhiều bản ghi bên N.</text>')
add('<text x="944" y="888" font-size="11" fill="#3d4f66">Mọi khóa ngoại trỏ tới ảnh / lần chạy đều xóa lan truyền (ON DELETE CASCADE).</text>')
add('<text x="50" y="975" font-size="11" fill="#6b7c92">14 bảng · SQLite · khóa ngoại bật theo từng kết nối (PRAGMA foreign_keys = ON)</text>')

add('</svg>')
OUT.write_text("\n".join(p), encoding="utf-8")
print("wrote", OUT, "-", sum(len(v) for v in tables.values()), "columns across", len(tables), "tables")
