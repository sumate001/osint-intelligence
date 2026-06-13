"""add source_name to feed_items

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("feed_items", sa.Column("source_name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("feed_items", "source_name")
