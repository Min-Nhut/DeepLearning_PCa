#!/usr/bin/env python
"""Reclaim disk from superseded AI runs and orphaned files.

One image currently costs ~48MB on disk (original + derivatives + a full-size
mask PNG + a deep-zoom tile pyramid), and every re-run of the pipeline writes a
*new* mask while the old one is never removed. Nothing deletes any of it today,
so a real caseload only ever grows.

Two things are removed, both conservative:

  1. **Superseded run outputs** — mask files belonging to inference runs that are
     no longer the latest for their image. The newest run per image is always
     kept, because that is what the viewer displays.
  2. **Orphaned files** — files under uploads/ whose owning image row is gone.
     These should not exist (delete_image cleans up), but a crash mid-delete or
     a hand-edited database leaves them behind.

Deep-zoom pyramids are NOT touched: they are a pure cache, regenerated on first
view, but they are also what makes a WSI usable at all — deleting one silently
costs the next viewer a rebuild. Use --tiles to include them when disk actually
matters more than that.

Dry-run by default. Nothing is deleted without --apply.

Usage:
    python scripts/prune_storage.py                # report only
    python scripts/prune_storage.py --apply
    python scripts/prune_storage.py --apply --tiles
"""
import argparse
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal  # noqa: E402
from app.models import Image, InferenceRun, SegmentationResult  # noqa: E402
from app.routers.cases import UPLOAD_ROOT  # noqa: E402


def human(size: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}GB"


def _size(path: Path) -> int:
    if path.is_dir():
        return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    return path.stat().st_size if path.exists() else 0


def collect_superseded_runs(db) -> list[Path]:
    """Mask files of every run that is not the latest for its image."""
    latest: dict[int, int] = {}
    for run in db.query(InferenceRun).order_by(InferenceRun.id):
        latest[run.image_id] = run.id

    paths: list[Path] = []
    for seg in db.query(SegmentationResult).join(InferenceRun, SegmentationResult.run_id == InferenceRun.id):
        run = db.get(InferenceRun, seg.run_id)
        if run is None or latest.get(run.image_id) == run.id:
            continue
        if seg.mask_file_path:
            candidate = UPLOAD_ROOT.parent / seg.mask_file_path
            if candidate.exists():
                paths.append(candidate)
    return paths


def collect_orphans(db, include_tiles: bool) -> list[Path]:
    """Files under uploads/ that no surviving image claims."""
    known_stems = {
        (UPLOAD_ROOT.parent / image.file_path).stem
        for image in db.query(Image)
        if image.file_path
    }
    orphans: list[Path] = []
    for path in sorted(UPLOAD_ROOT.rglob("*")):
        if path.name == ".gitkeep":
            continue
        if path.is_dir():
            if path.name.endswith("_dzi_files") and path.name.split("_dzi_files")[0] not in known_stems:
                orphans.append(path)
            continue
        # Tiles live at {stem}_dzi_files/{level}/{col}_{row}.jpg, so the immediate
        # parent is the level number — checking only `path.parent` misses them and
        # reports every tile of a live image as an orphan. The pyramid is handled
        # as a whole, by its directory, above.
        if any(part.endswith("_dzi_files") for part in path.parts):
            continue
        stem = path.stem
        owner = next((s for s in known_stems if stem.startswith(s)), None)
        if owner is None:
            orphans.append(path)
    if include_tiles:
        for path in sorted(UPLOAD_ROOT.rglob("*_dzi_files")):
            if path.is_dir() and path not in orphans:
                orphans.append(path)

    # Empty case_*/slide_* trees left behind by deleted cases. delete_slide
    # removes its own directory, but deleting a whole case (or hand-editing the
    # database) leaves the shells. Deepest first, so a slide directory is gone
    # before its case directory is judged empty.
    for path in sorted(UPLOAD_ROOT.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if not path.is_dir() or path in orphans:
            continue
        if any(part.endswith("_dzi_files") for part in path.parts):
            continue
        remaining = [c for c in path.iterdir() if c not in orphans]
        if not remaining:
            orphans.append(path)
    return orphans


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="actually delete (default: report only)")
    parser.add_argument("--tiles", action="store_true", help="also drop deep-zoom pyramids (regenerated on view)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        superseded = collect_superseded_runs(db)
        orphans = collect_orphans(db, include_tiles=args.tiles)
    finally:
        db.close()

    groups = [("Superseded run masks", superseded), ("Orphaned / cache files", orphans)]
    total = 0
    for title, paths in groups:
        subtotal = sum(_size(p) for p in paths)
        total += subtotal
        print(f"\n{title}: {len(paths)} item(s), {human(subtotal)}")
        for p in paths[:20]:
            print(f"  {p.relative_to(UPLOAD_ROOT.parent)}  ({human(_size(p))})")
        if len(paths) > 20:
            print(f"  … and {len(paths) - 20} more")

    print(f"\nReclaimable: {human(total)}")
    if not args.apply:
        print("Dry run — nothing deleted. Re-run with --apply.")
        return

    removed = 0
    for _, paths in groups:
        for p in paths:
            try:
                if p.is_dir():
                    shutil.rmtree(p, ignore_errors=True)
                else:
                    p.unlink(missing_ok=True)
                removed += 1
            except OSError as exc:
                print(f"  could not remove {p}: {exc}")
    print(f"Removed {removed} item(s), {human(total)} reclaimed.")


if __name__ == "__main__":
    main()
