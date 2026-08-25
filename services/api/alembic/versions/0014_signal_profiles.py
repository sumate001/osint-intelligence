"""what this newsroom is actually watching

Revision ID: 0014
Revises: 0013
Create Date: 2026-08-25

Horizon pushes every signal its detectors surface, because it has no idea what
any particular newsroom covers — and it should not: editorial priorities change
weekly and belong on this side of the integration, not in the engine.

Without somewhere to say so, the inbox mixed the story an editor was waiting for
with a football final, and the only way to clear the football was to dismiss it.
A profile gives the newsroom a standing statement of interest, and gives the
inbox a box to file against. NULL is a real answer with its own box: the engine
surfaced something nobody asked for, which is worth seeing on its own.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "signal_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("categories", JSONB(), nullable=False, server_default="[]"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_signal_profiles_active", "signal_profiles", ["active"])

    op.add_column(
        "external_signals",
        sa.Column(
            "profile_id",
            UUID(as_uuid=True),
            # SET NULL, not CASCADE: deleting a profile must not delete the
            # signals filed under it. They fall back into the unsorted box.
            sa.ForeignKey("signal_profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("external_signals", sa.Column("profile_reason", sa.Text(), nullable=True))
    op.create_index("ix_external_signals_profile_id", "external_signals", ["profile_id"])


def downgrade() -> None:
    op.drop_index("ix_external_signals_profile_id", table_name="external_signals")
    op.drop_column("external_signals", "profile_reason")
    op.drop_column("external_signals", "profile_id")
    op.drop_index("ix_signal_profiles_active", table_name="signal_profiles")
    op.drop_table("signal_profiles")
