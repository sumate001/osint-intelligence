"""Phase 5: simulation_jobs, dw_queries, dw_results, dw_audit_log"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "simulation_jobs",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("case_id", UUID(as_uuid=False), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("config", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("seed_data", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("result", sa.JSON, nullable=True),
        sa.Column("progress_step", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_simulation_jobs_case_id", "simulation_jobs", ["case_id"])

    op.create_table(
        "dw_queries",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("query_text", sa.Text, nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("method", sa.String(30), nullable=False, server_default="ahmia"),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("created_by", UUID(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "dw_results",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("query_id", UUID(as_uuid=False), nullable=False),
        sa.Column("onion_url", sa.Text, nullable=False),
        sa.Column("title", sa.Text, nullable=False, server_default=""),
        sa.Column("summary", sa.Text, nullable=False, server_default=""),
        sa.Column("classification", sa.String(20), nullable=False),
        sa.Column("confidence", sa.Float, nullable=False, server_default="0"),
        sa.Column("entities", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("legal_status", sa.String(20), nullable=False, server_default="NA"),
        sa.Column("value", sa.String(20), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_dw_results_query_id", "dw_results", ["query_id"])

    op.create_table(
        "dw_audit_log",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("user_id", UUID(as_uuid=False), nullable=True),
        sa.Column("username", sa.String(100), nullable=False, server_default="system"),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("details", sa.JSON, nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_table("dw_audit_log")
    op.drop_table("dw_results")
    op.drop_table("dw_queries")
    op.drop_table("simulation_jobs")
