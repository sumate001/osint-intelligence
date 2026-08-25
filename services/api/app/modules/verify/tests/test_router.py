"""Where a verification job gets queued.

Feed ingestion moved to Horizon and the `triage` worker went with it, but
verification was still being queued there. Nothing had exercised the path yet,
so nothing had failed — the first analyst to upload media would simply have got
a job that never ran: no error, no failed status, an upload that never finishes.

That is the shape of bug this file exists to pin. It reads the router source
rather than calling it because the queue name is a routing decision, not
behaviour the function returns, and asserting on the decision is the whole point.
"""

from pathlib import Path

import pytest

pytestmark = pytest.mark.unit

ROUTER = Path(__file__).resolve().parents[1] / "router.py"


def test_verification_is_queued_where_a_worker_is_listening():
    body = ROUTER.read_text(encoding="utf-8")

    assert 'queue="intel"' in body
    assert 'queue="triage"' not in body
