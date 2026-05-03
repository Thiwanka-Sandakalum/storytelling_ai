"""
storage/db.py — Database schema and engine setup.
"""

import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, DateTime, String, Text, func
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from config import settings

logger = logging.getLogger(__name__)


# ── Engine & session factory ──────────────────────────────────

def build_engine():
    """Create the async SQLAlchemy engine.

    Called once from the FastAPI lifespan. The engine is intentionally
    created lazily so that tests can override DATABASE_URL before import.
    """
    return create_async_engine(
        settings.database_url,
        echo=settings.app_env == "development",
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout_seconds,
        pool_recycle=settings.db_pool_recycle_seconds,
        # Neon uses PgBouncer in transaction mode — prepared statements
        # are not supported across pooled connections, so we disable the cache.
        connect_args={
            "prepared_statement_cache_size": 0,
            "timeout": settings.db_connect_timeout_seconds,
            "command_timeout": settings.db_command_timeout_seconds,
        },
    )


# Module-level engine; replaced at application startup via lifespan.
async_engine = build_engine()

AsyncSessionFactory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=async_engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


# ── ORM Base ─────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Story model ───────────────────────────────────────────────

class Story(Base):
    """Represents a story generation job and its outputs."""

    __tablename__ = "stories"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    topic: Mapped[str] = mapped_column(Text, nullable=False)
    tone: Mapped[str] = mapped_column(String(50), nullable=False)
    audience: Mapped[str] = mapped_column(Text, nullable=False)
    length: Mapped[str] = mapped_column(String(20), nullable=False)
    user_prefs: Mapped[dict | None] = mapped_column(JSON, default=dict)

    # Pipeline outputs
    outline_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    draft_script: Mapped[str | None] = mapped_column(Text, nullable=True)
    script_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_image: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Job control
    status: Mapped[str] = mapped_column(
        String(20), default="queued", nullable=False
    )  # queued | processing | completed | failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps (server-side defaults)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Story id={self.id!r} status={self.status!r} topic={self.topic!r}>"



