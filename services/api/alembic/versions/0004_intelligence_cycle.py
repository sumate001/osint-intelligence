"""intelligence cycle tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pirs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("priority", sa.String(5), nullable=False, server_default="P2"),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("eei_list", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("assigned_to", sa.String(36), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_pirs_status", "pirs", ["status"])

    op.create_table(
        "case_activities",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("case_id", sa.String(36), nullable=False, index=True),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("actor_id", sa.String(36), nullable=False),
        sa.Column("actor_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "evidence_comments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("evidence_id", sa.String(36), nullable=False, index=True),
        sa.Column("case_id", sa.String(36), nullable=False, index=True),
        sa.Column("author_id", sa.String(36), nullable=False),
        sa.Column("author_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("is_dissent", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "deception_checks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("case_id", sa.String(36), nullable=True, index=True),
        sa.Column("target_title", sa.String(500), nullable=False),
        sa.Column("target_url", sa.Text, nullable=True),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("cui_bono", sa.Text, nullable=True),
        sa.Column("timing_analysis", sa.Text, nullable=True),
        sa.Column("source_motivation", sa.Text, nullable=True),
        sa.Column("bot_indicators", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("risk_level", sa.String(10), nullable=False, server_default="LOW"),
        sa.Column("flagged", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("flag_reason", sa.Text, nullable=True),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "entity_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("entity_name", sa.String(500), nullable=False, index=True),
        sa.Column("entity_type", sa.String(50), nullable=False, server_default="other"),
        sa.Column("cases_involved", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("first_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("entity_records")
    op.drop_table("deception_checks")
    op.drop_table("evidence_comments")
    op.drop_table("case_activities")
    op.drop_table("pirs")
