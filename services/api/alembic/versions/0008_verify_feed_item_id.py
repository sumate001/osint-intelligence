"""add feed_item_id to verify_jobs

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "verify_jobs",
        sa.Column("feed_item_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_verify_jobs_feed_item_id", "verify_jobs", ["feed_item_id"])


def downgrade() -> None:
    op.drop_index("ix_verify_jobs_feed_item_id", table_name="verify_jobs")
    op.drop_column("verify_jobs", "feed_item_id")
