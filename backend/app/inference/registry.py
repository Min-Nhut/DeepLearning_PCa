"""Checkpoint discovery + lazy-loaded model cache. Nothing here assumes a
checkpoint exists — `list_available()` reflects whatever files are actually on
disk (drives the "deploy all 4, pick in the UI" scenario with no code change),
and `load()` raises a clear error instead of crashing when one is missing.
"""
from pathlib import Path
from typing import Literal

import torch

from .architectures import (
    CLASSIFICATION_ARCHITECTURES,
    SEGMENTATION_ARCHITECTURES,
    get_classification_model,
    get_segmentation_model,
)

Task = Literal["segmentation", "classification"]

MODEL_ROOT = Path(__file__).resolve().parent.parent.parent / "models"

_FACTORY = {"segmentation": get_segmentation_model, "classification": get_classification_model}
_ARCHITECTURES = {"segmentation": SEGMENTATION_ARCHITECTURES, "classification": CLASSIFICATION_ARCHITECTURES}

_cache: dict[tuple[Task, str], torch.nn.Module] = {}


class ModelNotAvailableError(Exception):
    """Raised when a checkpoint file for the requested architecture doesn't exist yet."""


def _checkpoint_path(task: Task, arch: str) -> Path:
    return MODEL_ROOT / task / f"{arch}_best.pt"


def list_available(task: Task) -> list[str]:
    """Architecture names for `task` that actually have a checkpoint file on disk."""
    return [arch for arch in _ARCHITECTURES[task] if _checkpoint_path(task, arch).exists()]


def is_available(task: Task, arch: str) -> bool:
    return _checkpoint_path(task, arch).exists()


def evict(task: Task, arch: str) -> bool:
    """Drop a loaded model so the next `load()` re-reads the file from disk.
    Returns whether anything was actually cached.

    `list_available()` reads the filesystem on every call, so replacing a
    checkpoint updates the API's "Sẵn sàng" badge immediately — but the
    *weights* stay whatever this process loaded first, for the life of the
    process. Without this, dropping in a retrained `.pt` silently keeps serving
    the old model until someone restarts the server. Exposed to the admin UI as
    "Tải lại checkpoint".
    """
    return _cache.pop((task, arch), None) is not None


def load(task: Task, arch: str) -> torch.nn.Module:
    """Lazy-loads and caches a model in eval mode. Raises ModelNotAvailableError
    (mapped to a clean 503 by the router) instead of a raw FileNotFoundError/
    RuntimeError if the checkpoint doesn't exist — this is the "fails clearly,
    not a crash" behavior for a pipeline built ahead of real checkpoints landing.
    """
    key = (task, arch)
    if key in _cache:
        return _cache[key]

    if arch not in _ARCHITECTURES[task]:
        raise ModelNotAvailableError(f"Kiến trúc không hỗ trợ: {arch}")

    path = _checkpoint_path(task, arch)
    if not path.exists():
        raise ModelNotAvailableError(f"Chưa có checkpoint cho {task}/{arch} tại {path}")

    model = _FACTORY[task](arch)
    # weights_only=False: our checkpoints are a plain dict with model/optimizer
    # state plus a couple of scalars (epoch, best_metric) — trusted local files
    # we generated ourselves, not arbitrary downloads, so torch>=2.6's stricter
    # default (which would reject non-tensor payload) is safe to opt out of.
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    state_dict = checkpoint["model_state"] if isinstance(checkpoint, dict) and "model_state" in checkpoint else checkpoint
    model.load_state_dict(state_dict)
    model.eval()

    _cache[key] = model
    return model
