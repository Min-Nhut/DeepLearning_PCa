from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite:///../database/prostaai.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 480
    # Two frontend portals, two ports (see frontend/src/lib/portal.ts):
    # 5173 = doctor, 5174 = admin. Both must be allowed or the admin portal's
    # every request fails CORS.
    cors_origins: str = "http://localhost:5173,http://localhost:5174"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
