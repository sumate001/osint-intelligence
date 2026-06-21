"""add url index to feed_items for cross-source dedup

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-21
"""
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_feed_items_url",
        "feed_items",
        ["url"],
        postgresql_where="url IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_index("ix_feed_items_url", "feed_items")
