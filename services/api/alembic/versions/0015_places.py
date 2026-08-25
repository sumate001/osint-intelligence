"""place names resolved to coordinates

Revision ID: 0015
Revises: 0014
Create Date: 2026-08-25

Horizon has extracted a `location` for 80% of events since the beginning, and it
reached nobody: the field was not in the shared inbound contract, so it never
travelled. With it added, the names arrive as free text at whatever granularity
the reporting used — "อำเภอยะหา" as readily as "ไทย" — and need resolving once
each.

Cached against the name because the same handful recur constantly:
"ทำเนียบรัฐบาล" alone appears in 48 events. A row exists as soon as a name has
been *asked about*, including when the answer was "no such place", so an
unresolvable name is not re-queried forever against a free API.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "places",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False, unique=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("qid", sa.String(32), nullable=True),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_places_name", "places", ["name"])
    op.create_index("ix_places_status", "places", ["status"])


def downgrade() -> None:
    op.drop_index("ix_places_status", table_name="places")
    op.drop_index("ix_places_name", table_name="places")
    op.drop_table("places")
