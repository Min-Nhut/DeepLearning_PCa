# 🔬 ProstaAI — AI-Assisted Prostate Cancer Gleason Grading System

> **Đồ án tốt nghiệp** — Cử nhân/Kỹ sư Công nghệ Thông tin  
> Hệ thống web hỗ trợ phân loại thang điểm Gleason trên ảnh sinh thiết tuyến tiền liệt nhuộm H&E, sử dụng pipeline AI hai giai đoạn (**Gland Segmentation → Gleason Classification**).

---

## 📌 Giới thiệu

**ProstaAI** là một ứng dụng web full-stack (research prototype) giúp hỗ trợ bác sĩ/nhà nghiên cứu trong việc phân tích ảnh mô học tuyến tiền liệt. Hệ thống tự động thực hiện toàn bộ pipeline:

1. **Tải ảnh H&E** từ người dùng
2. **Phát hiện mô** (tissue detection & preprocessing)
3. **Phân đoạn tuyến** (Gland Segmentation — binary cancer-region proposal)
4. **Phân loại Gleason Pattern** (Classification — Pattern 3 / 4 / 5)
5. **Tổng hợp điểm Gleason Score** và hiển thị overlay mask + heatmap lên ảnh gốc

> ⚠️ **Lưu ý**: Đây là **prototype nghiên cứu**, không phải thiết bị y tế đã được kiểm định. Không dùng để chẩn đoán thay bác sĩ trên bệnh nhân thật.

---

## 🏗️ Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│          Vite + TypeScript + Tailwind CSS v4             │
│                  Port: 5173 (dev)                        │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────┐
│                  Backend (FastAPI)                       │
│          Python 3.11+ | SQLAlchemy | JWT Auth           │
│                  Port: 8000                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │              AI Inference Pipeline                │   │
│  │  PyTorch | torchvision | segmentation-models-pt  │   │
│  │                                                  │   │
│  │  Segmentation Models:         Classification:    │   │
│  │  • U-Net + DenseNet121        • DenseNet121      │   │
│  │  • U-Net + EfficientNet-B0    • EfficientNet-B0  │   │
│  │  • DeepLabV3+ + EffNet-B0     • Inception-v3     │   │
│  │                               • ViT-B/16         │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │ SQLAlchemy ORM
┌────────────────────────▼────────────────────────────────┐
│                   Database (SQLite)                      │
│              (PostgreSQL-ready schema)                   │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Cấu trúc thư mục

```
DeepLearning_PCa/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py             # Entry point
│   │   ├── models.py           # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic schemas
│   │   ├── routers/            # API route handlers
│   │   ├── inference/          # AI inference pipeline
│   │   ├── preprocessing.py    # Ảnh H&E preprocessing
│   │   ├── ai_models_config.py # Cấu hình các model AI
│   │   ├── config.py           # Settings (đọc từ .env)
│   │   ├── database.py         # DB session setup
│   │   └── security.py        # JWT auth utilities
│   ├── models/
│   │   ├── classification/     # *.pt weights (không có trong git)
│   │   │   └── .gitkeep
│   │   └── segmentation/       # *.pt weights (không có trong git)
│   │       └── .gitkeep
│   ├── uploads/                # Ảnh upload của user (không có trong git)
│   │   └── .gitkeep
│   ├── scripts/                # Helper scripts
│   ├── requirements.txt
│   └── .env.example            # Template cấu hình môi trường
│
├── frontend/                   # React + Vite frontend
│   ├── src/
│   │   ├── pages/              # Các trang chính
│   │   ├── components/         # UI components
│   │   └── types.ts            # TypeScript types
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   └── .env.example
│
├── database/
│   ├── schema.sql              # Database schema
│   └── README.md               # Hướng dẫn setup DB
│
├── docs/
│   └── PRD.md                  # Product Requirements Document
│
└── README.md
```

---

## 🚀 Hướng dẫn cài đặt & chạy

### Yêu cầu hệ thống

| Thành phần | Phiên bản tối thiểu |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |
| RAM | 8GB+ (16GB khuyến nghị khi chạy inference) |

---

### 1️⃣ Clone repository

```bash
git clone https://github.com/Min-Nhut/DeepLearning_PCa.git
cd DeepLearning_PCa
```

---

### 2️⃣ Tải model weights

> Model weights không có trong repository (quá lớn, tổng ~1.6GB).  
> Tải về từ link bên dưới và đặt vào đúng thư mục:

| File | Thư mục | Link tải |
|---|---|---|
| `densenet121_best.pt` | `backend/models/classification/` | *(liên hệ tác giả)* |
| `efficientnet_b0_best.pt` | `backend/models/classification/` | *(liên hệ tác giả)* |
| `inception_v3_best.pt` | `backend/models/classification/` | *(liên hệ tác giả)* |
| `vit_b_16_best.pt` | `backend/models/classification/` | *(liên hệ tác giả)* |
| `unet_densenet121_best.pt` | `backend/models/segmentation/` | *(liên hệ tác giả)* |
| `unet_efficientnet_b0_best.pt` | `backend/models/segmentation/` | *(liên hệ tác giả)* |
| `deeplabv3plus_efficientnet_b0_best.pt` | `backend/models/segmentation/` | *(liên hệ tác giả)* |

---

### 3️⃣ Cài đặt Backend

```bash
cd backend

# Tạo virtual environment
python -m venv .venv

# Kích hoạt (Windows)
.venv\Scripts\activate

# Kích hoạt (Linux/macOS)
source .venv/bin/activate

# Cài dependencies
# Nếu máy KHÔNG có GPU (CPU-only):
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

# Nếu máy có GPU NVIDIA (CUDA):
pip install -r requirements.txt
```

#### Cấu hình môi trường Backend

```bash
# Copy file template
cp .env.example .env

# Mở .env và chỉnh sửa:
# DATABASE_URL=sqlite:///../database/prostaai.db
# JWT_SECRET=<tạo chuỗi ngẫu nhiên dài tối thiểu 32 ký tự>
# JWT_EXPIRE_MINUTES=480
# CORS_ORIGINS=http://localhost:5173
```

#### Khởi tạo Database

```bash
# Từ thư mục backend (đã activate .venv)
python -c "from app.database import Base, engine; from app import models; Base.metadata.create_all(engine); print('DB created!')"
```

#### Chạy Backend

```bash
# Development mode (auto-reload)
uvicorn app.main:app --reload --port 8000

# API docs tự động có tại: http://localhost:8000/docs
```

---

### 4️⃣ Cài đặt Frontend

```bash
cd frontend

# Cài Node.js dependencies
npm install

# Cấu hình môi trường
cp .env.example .env
# Mở .env — mặc định trỏ đến http://localhost:8000
```

#### Chạy Frontend

```bash
npm run dev
# Mở trình duyệt tại: http://localhost:5173
```

---

## 🤖 Các model AI được sử dụng

### Segmentation (Phát hiện vùng ung thư — Binary)

| Kiến trúc | Backbone | Task |
|---|---|---|
| U-Net | DenseNet121 | Gland segmentation |
| U-Net | EfficientNet-B0 | Gland segmentation |
| DeepLabV3+ | EfficientNet-B0 | Gland segmentation |

### Classification (Phân loại Gleason Pattern 3/4/5)

| Kiến trúc | Pretrained | Task |
|---|---|---|
| DenseNet121 | ImageNet | Gleason Pattern |
| EfficientNet-B0 | ImageNet | Gleason Pattern |
| Inception-v3 | ImageNet | Gleason Pattern |
| ViT-B/16 | ImageNet | Gleason Pattern |

**Dataset huấn luyện**: [SICAPv2](https://data.mendeley.com/datasets/9xxm58dvs3/1) — tập dữ liệu công khai gồm ảnh patch H&E được phân loại Gleason.

---

## 🔌 API Endpoints chính

Sau khi chạy backend, truy cập **http://localhost:8000/docs** để xem Swagger UI đầy đủ.

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/auth/login` | Đăng nhập, lấy JWT token |
| `POST` | `/api/images/upload` | Tải ảnh H&E lên hệ thống |
| `POST` | `/api/images/{id}/inference` | Chạy pipeline AI inference |
| `GET` | `/api/images/{id}/result` | Lấy kết quả phân tích |
| `GET` | `/api/admin/models` | Xem danh sách model AI |

---

## 🛠️ Tech Stack

| Layer | Công nghệ |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 |
| **Backend** | FastAPI, Python 3.11+, SQLAlchemy, Pydantic, JWT |
| **AI/ML** | PyTorch 2.7, torchvision, segmentation-models-pytorch |
| **Database** | SQLite (dev) — schema tương thích PostgreSQL |
| **Preprocessing** | OpenCV, Pillow, NumPy |

---

## 👤 Tác giả

**Nguyễn Min Nhựt**  
Đồ án tốt nghiệp — Ngành Công nghệ Thông tin  
Email: nguyennhut2101@gmail.com  
GitHub: [@Min-Nhut](https://github.com/Min-Nhut)

---

## 📄 License

Dự án phục vụ mục đích học thuật và nghiên cứu.  
Không được sử dụng cho mục đích thương mại hoặc chẩn đoán lâm sàng thật.
