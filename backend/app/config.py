from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración por variables de entorno con prefijo PANEL_ (ver .env.example)."""

    model_config = SettingsConfigDict(env_prefix="PANEL_", env_file=".env", extra="ignore")

    env: str = "development"  # development | test | production
    database_url: str = "postgresql+psycopg://panel:panel_dev_only@localhost:5432/panel_vida"
    secret_key: str = Field(default="dev-only-insecure-secret-change-me", min_length=16)
    token_ttl_minutes: int = 12 * 60
    cors_origins: str = "http://localhost:3000"
    login_max_attempts: int = 5
    login_window_seconds: int = 300

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def validate_for_production(self) -> None:
        if self.env == "production":
            if self.secret_key.startswith("dev-only") or len(self.secret_key) < 32:
                raise RuntimeError("PANEL_SECRET_KEY debe definirse (≥32 caracteres) en producción")
            if "*" in self.cors_origin_list:
                raise RuntimeError("PANEL_CORS_ORIGINS no puede ser '*' en producción")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.validate_for_production()
    return s
