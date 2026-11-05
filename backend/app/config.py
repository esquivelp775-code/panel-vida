from functools import lru_cache

from pydantic import Field, field_validator
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
    # Alta del primer usuario sin terminal (p. ej. Render gratuito): sólo actúa si NO existe ningún usuario.
    bootstrap_email: str | None = None
    bootstrap_password: str | None = None

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, v: str) -> str:
        """Acepta el enlace tal como lo dan Neon/Render (postgres:// o postgresql://) y fija el driver psycopg 3."""
        v = v.strip()
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        # Tolera la "/" final que es fácil de pegar por error (https://sitio.netlify.app/ → https://sitio.netlify.app).
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip().rstrip("/")]

    def validate_for_production(self) -> None:
        # Fail-closed: fuera de development/test el secreto por defecto nunca es aceptable.
        if self.env not in ("development", "test") and self.secret_key.startswith("dev-only"):
            raise RuntimeError("PANEL_SECRET_KEY no definido: define un secreto propio (o PANEL_ENV=development)")
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
