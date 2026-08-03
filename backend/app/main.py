from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import admin, annotations, auth, cases, inference, reviews

app = FastAPI(title="ProstaAI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(cases.router)
app.include_router(cases.image_router)
app.include_router(reviews.router)
app.include_router(annotations.router)
app.include_router(inference.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
