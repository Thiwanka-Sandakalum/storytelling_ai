"""add cover_image column to stories

Revision ID: 20260501_0001
Revises:
Create Date: 2026-05-01 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260501_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("stories", sa.Column("cover_image", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("stories", "cover_image")
