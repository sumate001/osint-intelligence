"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-13

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="analyst"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("adapter_type", sa.String(50), nullable=False),
        sa.Column("config", postgresql.JSON(), nullable=False),
        sa.Column("source_weight", sa.Float(), server_default="1.0"),
        sa.Column("verified_source", sa.Boolean(), server_default="false"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("admiralty_source_code", sa.String(1), server_default="C"),
        sa.Column("poll_interval_seconds", sa.Integer(), server_default="300"),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(1000), nullable=True),
        sa.Column("success_count", sa.Integer(), server_default="0"),
        sa.Column("error_count", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "feed_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("external_id", sa.String(512), nullable=False, index=True),
        sa.Column("source_id", sa.String(255), nullable=False, index=True),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(1000), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("url", sa.String(2000), nullable=True),
        sa.Column("language", sa.String(10), server_default="th"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ingested_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("scored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("score_relevance", sa.Float(), nullable=True),
        sa.Column("score_urgency", sa.Float(), nullable=True),
        sa.Column("score_impact", sa.Float(), nullable=True),
        sa.Column("score_novelty", sa.Float(), nullable=True),
        sa.Column("score_reliability", sa.Float(), nullable=True),
        sa.Column("score_sensitivity", sa.Float(), nullable=True),
        sa.Column("score_actionability", sa.Float(), nullable=True),
        sa.Column("total_score", sa.Float(), nullable=True),
        sa.Column("verdict", sa.String(50), nullable=True, index=True),
        sa.Column("verdict_reason", sa.Text(), nullable=True),
        sa.Column("admiralty_source", sa.String(1), server_default="C"),
        sa.Column("admiralty_info", sa.String(1), server_default="3"),
        sa.Column("entities", postgresql.JSON(), server_default="{}"),
        sa.Column("source_weight", sa.Float(), server_default="1.0"),
        sa.Column("verified_source", sa.Boolean(), server_default="false"),
        sa.Column("raw_metadata", postgresql.JSON(), server_default="{}"),
        sa.Column("media", postgresql.JSON(), server_default="[]"),
        sa.Column("is_read", sa.Boolean(), server_default="false"),
        sa.Column("is_archived", sa.Boolean(), server_default="false"),
        sa.Column("case_id", sa.String(255), nullable=True),
    )

    # Unique constraint to prevent duplicate ingestion
    op.create_unique_constraint(
        "uq_feed_items_external_source",
        "feed_items",
        ["external_id", "source_id"],
    )


def downgrade() -> None:
    op.drop_table("feed_items")
    op.drop_table("sources")
    op.drop_table("users")
