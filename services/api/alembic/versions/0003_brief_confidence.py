"""brief and confidence tables

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "briefs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("case_id", sa.dialects.postgresql.UUID(as_uuid=False), sa.ForeignKey("cases.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("mode", sa.String(20), nullable=False, server_default="INTERNAL"),
        sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("sections", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("methodology", sa.Text, nullable=True),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("reviewed_by", sa.String(36), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_briefs_case_id", "briefs", ["case_id"])
    op.create_index("ix_briefs_status", "briefs", ["status"])

    op.create_table(
        "confidence_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("brief_id", sa.String(36), sa.ForeignKey("briefs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("level", sa.String(10), nullable=False, server_default="MEDIUM"),
        sa.Column("rationale", sa.Text, nullable=True),
        sa.Column("dissent", sa.Text, nullable=True),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "ach_hypotheses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("brief_id", sa.String(36), sa.ForeignKey("briefs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hypothesis", sa.Text, nullable=False),
        sa.Column("evidence_matrix", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("likelihood", sa.String(20), nullable=False, server_default="LIKELY"),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ach_brief_id", "ach_hypotheses", ["brief_id"])


def downgrade() -> None:
    op.drop_table("ach_hypotheses")
    op.drop_table("confidence_records")
    op.drop_table("briefs")
