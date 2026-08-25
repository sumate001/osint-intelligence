"""a verdict for "right detection, wrong beat"

Revision ID: 0013
Revises: 0012
Create Date: 2026-08-25

Dismissing a signal always recorded `false_signal`, and that value travels to
Horizon, whose `verdicts` table is the corpus it tunes detection thresholds
against. But most dismissals are not detection errors — the story is real and
correctly found, it simply is not something this newsroom follows. An editor
clearing off-beat stories was teaching the radar to suppress the detections that
were working, and nothing in either system would have shown it.

`off_topic` separates relevance from accuracy. Existing rows are left alone:
they were recorded under the old vocabulary and relabelling them would be
inventing an answer nobody gave.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD = (
    "verdict IS NULL OR verdict IN ('true_signal', 'false_signal', 'inconclusive')"
)
_NEW = (
    "verdict IS NULL OR verdict IN "
    "('true_signal', 'false_signal', 'inconclusive', 'off_topic')"
)


def upgrade() -> None:
    op.drop_constraint("ck_external_signals_verdict", "external_signals", type_="check")
    op.create_check_constraint("ck_external_signals_verdict", "external_signals", _NEW)


def downgrade() -> None:
    # No honest equivalent in the old vocabulary: calling these false_signal is
    # exactly the mislabelling this migration exists to end, so they are cleared.
    op.execute("UPDATE external_signals SET verdict = NULL WHERE verdict = 'off_topic'")
    op.drop_constraint("ck_external_signals_verdict", "external_signals", type_="check")
    op.create_check_constraint("ck_external_signals_verdict", "external_signals", _OLD)
