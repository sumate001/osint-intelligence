"""investigation and verify tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-13

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), server_default=""),
        sa.Column("status", sa.String(50), server_default="ACTIVE"),
        sa.Column("feed_item_id", sa.String(255), nullable=True),
        sa.Column("created_by", sa.String(255), nullable=False),
        sa.Column("assigned_to", sa.String(255), nullable=True),
        sa.Column("tags", postgresql.JSON(), server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_cases_status", "cases", ["status"])

    op.create_table(
        "evidence_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", sa.Text(), server_default=""),
        sa.Column("url", sa.String(2000), nullable=True),
        sa.Column("status", sa.String(50), server_default="UNVERIFIED"),
        sa.Column("source_type", sa.String(50), server_default="manual"),
        sa.Column("media", postgresql.JSON(), server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_evidence_items_case_id", "evidence_items", ["case_id"])
    op.create_index("ix_evidence_items_status", "evidence_items", ["status"])

    op.create_table(
        "case_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target", sa.String(500), nullable=False),
        sa.Column("scan_type", sa.String(50), server_default="spiderfoot"),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), server_default="PENDING"),
        sa.Column("results", postgresql.JSON(), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_case_scans_case_id", "case_scans", ["case_id"])
    op.create_index("ix_case_scans_status", "case_scans", ["status"])

    op.create_table(
        "verify_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("file_type", sa.String(50), nullable=False),
        sa.Column("minio_key", sa.String(1000), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(50), server_default="PENDING"),
        sa.Column("exif_data", postgresql.JSON(), server_default="{}"),
        sa.Column("gps_lat", sa.Float(), nullable=True),
        sa.Column("gps_lon", sa.Float(), nullable=True),
        sa.Column("gps_timestamp", sa.String(100), nullable=True),
        sa.Column("camera_make", sa.String(100), nullable=True),
        sa.Column("camera_model", sa.String(100), nullable=True),
        sa.Column("wayback_url", sa.String(2000), nullable=True),
        sa.Column("wayback_first_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duplicate_hits", postgresql.JSON(), server_default="[]"),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("verdict", sa.String(50), nullable=True),
        sa.Column("verdict_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_verify_jobs_status", "verify_jobs", ["status"])


def downgrade() -> None:
    op.drop_table("verify_jobs")
    op.drop_table("case_scans")
    op.drop_table("evidence_items")
    op.drop_table("cases")
