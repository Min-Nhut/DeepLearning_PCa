from pydantic import BaseModel, ConfigDict


class CalibrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    magnification: str
    um_per_pixel: float
    updated_at: str


class CalibrationUpdate(BaseModel):
    um_per_pixel: float
