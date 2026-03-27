"""
config.py — Centralised settings loaded from environment variables.

All other modules import `get_settings()` or `settings` from here.
Never hard-code secrets anywhere else.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide configuration, sourced from .env or environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ───────────────────────────────────────────
    app_env: str = Field(default="development", description="development | production")
    app_log_level: str = Field(default="INFO", description="Python logging level")

    # ── PostgreSQL ────────────────────────────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://neondb_owner:npg_7qM3KoGITHpd@ep-aged-water-ad5ws0lk-pooler.c-2.us-east-1.aws.neon.tech/neondb?ssl=require",
        description="Async SQLAlchemy connection string (Neon pooler)",
    )

    # ── Google Gemini ─────────────────────────────────────────
    gemini_api_key: str = Field(default="", description="Google Gemini API key")
    gemini_model: str = Field(
        default="gemini-2.5-flash-lite",
        description="Gemini model for text generation",
    )
    gemini_tts_model: str = Field(
        default="gemini-2.5-flash-preview-tts",
        description="Gemini model for TTS audio generation",
    )
    gemini_tts_voice: str = Field(
        default="Puck",
        description="Prebuilt voice name for Gemini TTS (e.g. Puck, Charon, Kore)",
    )

    # ── JWT ───────────────────────────────────────────────────
    jwt_secret_key: str = Field(default="change-me-in-production")
    jwt_algorithm: str = Field(default="HS256")
    jwt_access_token_expire_minutes: int = Field(default=60)

    # ── Cross-Service ─────────────────────────────────────────
    tts_service_url: str = Field(
        default="http://localhost:8001",
        description="URL of the Interactive Storyteller (TTS) service",
    )

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings singleton. Safe to call anywhere."""
    return Settings()


# Module-level alias for convenience
settings: Settings = get_settings()
