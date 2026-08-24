"""stable identity on entity records

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-24

`entity_records` matched cases on a lowercased name, which cannot tell that
"อนุทิน ชาญวีรกูล" and "อนุทิน ชาญวีรกูล (Anutin Charnvirakul)" are one person —
and would miss it silently, reporting "no prior cases" for someone with three.

Horizon now resolves names into entities and, where an item honestly fits,
attaches a Wikidata Q-number. Recording both here lets a case match on identity
first and fall back to the name only when there is nothing better.

Both columns are nullable: entities typed by hand have no Horizon id, and two
thirds of the long tail has no Wikidata item at all.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("entity_records", sa.Column("qid", sa.String(32), nullable=True))
    op.add_column(
        "entity_records", sa.Column("horizon_entity_id", sa.String(36), nullable=True)
    )
    # Not unique: the same Q-number can legitimately arrive twice before a merge
    # is reconciled, and failing an insert would cost a case its history.
    op.create_index("ix_entity_records_qid", "entity_records", ["qid"])
    op.create_index(
        "ix_entity_records_horizon_entity_id", "entity_records", ["horizon_entity_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_entity_records_horizon_entity_id", table_name="entity_records")
    op.drop_index("ix_entity_records_qid", table_name="entity_records")
    op.drop_column("entity_records", "horizon_entity_id")
    op.drop_column("entity_records", "qid")
