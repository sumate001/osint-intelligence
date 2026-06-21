"""widen external_id and url to TEXT for long Google News URLs

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("feed_items", "external_id", type_=sa.Text(), existing_type=sa.String(512), existing_nullable=False)
    op.alter_column("feed_items", "url", type_=sa.Text(), existing_type=sa.String(2000), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("feed_items", "external_id", type_=sa.String(512), existing_type=sa.Text(), existing_nullable=False)
    op.alter_column("feed_items", "url", type_=sa.String(2000), existing_type=sa.Text(), existing_nullable=True)
