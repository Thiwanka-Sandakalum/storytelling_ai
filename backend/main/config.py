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
    cors_allow_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        description="Allowed origins for browser CORS requests when credentials are enabled.",
    )

    # ── PostgreSQL ────────────────────────────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://user:password@localhost:5432/storytelling",
        description="Async SQLAlchemy connection string",
    )
    db_startup_retries: int = Field(
        default=3,
        description="How many times startup should retry database initialization before failing.",
    )
    db_startup_retry_delay_seconds: float = Field(
        default=2.0,
        description="Base delay between startup DB retries (linear backoff).",
    )
    db_startup_required: bool = Field(
        default=True,
        description="If False, allow API startup even when DB init fails (degraded mode).",
    )
    db_pool_size: int = Field(
        default=5,
        description="Steady-state SQLAlchemy connection pool size.",
    )
    db_max_overflow: int = Field(
        default=5,
        description="Maximum temporary connections above pool_size during bursts.",
    )
    db_pool_timeout_seconds: float = Field(
        default=10.0,
        description="How long to wait for a pooled connection before timing out.",
    )
    db_pool_recycle_seconds: int = Field(
        default=1800,
        description="How long pooled connections live before being recycled.",
    )
    db_connect_timeout_seconds: float = Field(
        default=10.0,
        description="Driver-level timeout for establishing a DB connection.",
    )
    db_command_timeout_seconds: float = Field(
        default=30.0,
        description="Driver-level timeout for a single DB command.",
    )
    checkpoint_sqlite_path: str = Field(
        default=".langgraph-checkpoints.sqlite",
        description="SQLite file used for durable LangGraph checkpoints in the standalone API runner.",
    )
    graph_cache_sqlite_path: str = Field(
        default=".langgraph-cache.sqlite",
        description="SQLite file used for LangGraph node caching in the standalone API runner.",
    )
    planner_cache_ttl_seconds: int = Field(
        default=3600,
        description="TTL for cached planner outputs in seconds.",
    )

    # ── Google Gemini ─────────────────────────────────────────
    use_vertex_ai: bool = Field(
        default=False,
        description="If True, use Vertex AI mode for Gemini/Imagen calls.",
    )
    vertex_ai_api: str = Field(
        default="",
        description="Optional Vertex AI API key (used when use_vertex_ai=True).",
    )
    vertex_project_id: str = Field(
        default="",
        description="Google Cloud project id for Vertex AI mode.",
    )
    vertex_location: str = Field(
        default="us-central1",
        description="Vertex AI location/region (e.g. us-central1).",
    )
    gemini_api_key: str = Field(default="", description="Google Gemini API key")
    gemini_model: str = Field(
        default="gemini-2.5-flash-lite",
        description="Gemini model for text generation",
    )
    imagen_model: str = Field(
        default="imagen-4.0-generate-001",
        description="Imagen model for story cover generation",
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

    # ── Object Storage (S3/MinIO) ────────────────────────────
    s3_access_key: str = Field(default="minioadmin")
    s3_secret_key: str = Field(default="minioadmin")
    s3_region: str = Field(default="us-east-1")
    s3_bucket_name: str = Field(default="storytelling-assets")
    s3_endpoint_url: str = Field(
        default="",
        description="Optional S3-compatible endpoint (e.g. http://localhost:9000)",
    )

    @property
    def s3_endpoint_url_or_none(self) -> str | None:
        endpoint = self.s3_endpoint_url.strip()
        return endpoint or None

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def using_vertex_ai(self) -> bool:
        return self.use_vertex_ai

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings singleton. Safe to call anywhere."""
    return Settings()


# Module-level alias for convenience
settings: Settings = get_settings()
