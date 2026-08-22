"""Phase 6: external_signals — Horizon signal intake

One new table. Nothing existing is touched: the integration adds a lane into
Investigation, it does not change how Investigation works.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_signals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("source_system", sa.String(50), nullable=False, server_default="horizon"),
        # Horizon's dispatch id. UNIQUE is what makes re-delivery idempotent —
        # Horizon retries anything that is not a 202, so this constraint is the
        # difference between one lead and five for the same story.
        sa.Column("signal_id", UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("signal_type", sa.String(50), nullable=False),
        sa.Column("title", sa.Text, nullable=False, server_default=""),
        sa.Column("payload", JSONB, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending_review"),
        sa.Column(
            "investigation_case_id",
            UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("verdict", sa.String(30), nullable=True),
        sa.Column("analyst_note", sa.Text, nullable=True),
        sa.Column("callback_status", sa.String(20), nullable=True),
        sa.Column("callback_attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("callback_error", sa.Text, nullable=True),
        sa.Column(
            "received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending_review', 'accepted', 'dismissed', 'closed')",
            name="ck_external_signals_status",
        ),
        sa.CheckConstraint(
            "verdict IS NULL OR verdict IN ('true_signal', 'false_signal', 'inconclusive')",
            name="ck_external_signals_verdict",
        ),
    )
    op.create_index("ix_external_signals_signal_id", "external_signals", ["signal_id"])
    # The inbox query: pending signals, newest first.
    op.create_index("ix_external_signals_status", "external_signals", ["status"])
    op.create_index("ix_external_signals_received_at", "external_signals", ["received_at"])
    op.create_index(
        "ix_external_signals_case_id", "external_signals", ["investigation_case_id"]
    )
    # Operators asking "which callbacks are stuck".
    op.create_index("ix_external_signals_callback", "external_signals", ["callback_status"])


def downgrade() -> None:
    op.drop_table("external_signals")
