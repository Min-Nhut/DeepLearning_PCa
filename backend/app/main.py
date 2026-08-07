import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import admin, annotations, auth, calibration, cases, dzi, inference, reviews, stats

# Minimal logging setup — previously there was NONE anywhere in this app, so a
# real exception inside a best-effort `except Exception` block (e.g. Stage 3
# fusion failing, preprocessing failing) was completely invisible: not in the
# DB, not on screen, not in the server's own output. `basicConfig()` here
# gives every module's `logging.getLogger(__name__)` a working handler via
# the root logger (uvicorn only configures its own `uvicorn.*` loggers by
# default, not the root one) — output goes to stderr, which is whatever
# captures this process's console output (e.g. `uvicorn.log` in this repo's
# own manual-run workflow).
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

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
app.include_router(reviews.flagged_router)
app.include_router(annotations.router)
app.include_router(inference.router)
app.include_router(calibration.router)
app.include_router(stats.router)
app.include_router(dzi.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
