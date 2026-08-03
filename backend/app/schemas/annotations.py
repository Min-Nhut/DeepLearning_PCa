from typing import Literal

from pydantic import BaseModel


class Point(BaseModel):
    x: float
    y: float


class AnnotationOut(BaseModel):
    id: int
    image_id: int
    points: list[Point]
    gleason_pattern: int | None
    note: str | None
    area_percentage: float
    created_by: int | None
    created_at: str
    updated_at: str


class AnnotationCreate(BaseModel):
    points: list[Point]
    gleason_pattern: Literal[3, 4, 5] | None = None
    note: str | None = None


class AnnotationUpdate(BaseModel):
    points: list[Point] | None = None
    gleason_pattern: Literal[3, 4, 5] | None = None
    note: str | None = None
