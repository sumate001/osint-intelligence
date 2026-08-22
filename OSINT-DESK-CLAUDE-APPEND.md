<!-- ============================================================
APPEND THIS SECTION TO THE END OF THE EXISTING CLAUDE.md
IN THE osint-intelligence REPO. Do not modify sections above it.
============================================================ -->

---

# Module: External Signal Intake (Horizon Integration)

## Context

A separate, independently deployed system named **Horizon** (automated news intelligence pipeline: trend detection, weak signal detection, scenario reasoning) will push "signals" into OSINT//DESK via HTTP. OSINT//DESK's role is **step 10 of that pipeline: deep, human-led investigation** of signals the automated radar surfaces.

This module adds a thin integration layer only. **Do not modify SpiderFoot, Verify, Watchlist, Perplexica, or any existing module logic.** All changes are additive: one inbound endpoint, one outbound webhook call, minor Investigation UI additions.

Design principles:
- Loose coupling: if Horizon is down, OSINT//DESK is unaffected. If OSINT//DESK is down, Horizon retries (its responsibility).
- Signals arrive as **draft cases** — they never auto-open investigations without an analyst accepting them.
- The verdict an analyst records when closing a signal-originated case MUST be sent back to Horizon — this feedback loop trains the radar. Treat the callback as a first-class requirement, not an afterthought.

## Integration Contract (shared with Horizon — must match byte-for-byte)

**The JSON Schema files for both payloads live in `contracts/` in the Horizon repo and must be copied into `contracts/` here. They are the single source of truth. Do not rename fields.**

### Inbound: Horizon → OSINT//DESK

Add endpoint: `POST /api/v1/signals/inbound`
Auth: header `X-API-Key` checked against env `HORIZON_INBOUND_API_KEY`. Invalid → `401`. Malformed payload → `422` with validation detail.

Payload (validate with Pydantic model matching this exactly):

```json
{
  "signal_id": "uuid",
  "signal_type": "weak_signal | trend_breakout",
  "title": "string (Thai)",
  "combined_score": 0.0,
  "trend_score": 0.0,
  "categories": ["string"],
  "summary": "string (Thai)",
  "top_events": [
    {"summary": "string", "url": "string", "source_name": "string",
     "credibility_weight": 0.0, "event_time": "ISO-8601|null"}
  ],
  "force_assessments": [
    {"force": "string", "impact": 0.0, "uncertainty": 0.0}
  ],
  "scenario_id": "uuid|null",
  "created_at": "ISO-8601"
}
```

Behavior:
1. Idempotency: if `signal_id` already exists, return the previous response (`202`) without creating a duplicate.
2. Persist to new table `external_signals` (see schema below), status `pending_review`.
3. Respond `202 {"osint_signal_id": "<external_signals.id>"}`.
4. Notify: create an in-app notification for the analyst role (reuse the existing notification mechanism if present; otherwise a badge counter on the Signals inbox is sufficient).

### Outbound: OSINT//DESK → Horizon (verdict callback)

When an analyst closes a case that originated from a signal (see UI section), call:

`POST {HORIZON_BASE_URL}/api/v1/verdicts`
Headers: `X-API-Key: {HORIZON_API_KEY}`

```json
{
  "signal_id": "uuid (from the original inbound payload)",
  "osint_signal_id": "string (external_signals.id)",
  "verdict": "true_signal | false_signal | inconclusive",
  "analyst_note": "string|null",
  "closed_at": "ISO-8601"
}
```

Failure handling: retry with exponential backoff (30s, 2m, 10m, 1h; then mark `callback_status='failed'`). Store callback status on `external_signals`. A failed callback must never block case closure in the UI.

## Database Additions

New table only — no changes to existing tables:

```
external_signals(
  id UUID PK,
  source_system TEXT DEFAULT 'horizon',
  signal_id UUID UNIQUE,          -- Horizon's dispatch id (idempotency key)
  signal_type TEXT,
  title TEXT,
  payload JSONB,                  -- full original payload, verbatim
  status TEXT,                    -- pending_review | accepted | dismissed | closed
  investigation_case_id FK NULL,  -- linked case once accepted
  verdict TEXT NULL,              -- true_signal | false_signal | inconclusive
  analyst_note TEXT NULL,
  callback_status TEXT NULL,      -- pending | delivered | failed
  received_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ NULL
)
```

## UI Additions (Investigation module)

1. **Signals inbox** — new list view under Investigation: incoming signals with `pending_review` status. Columns: type badge (weak_signal / trend_breakout), title, scores, categories, received time. Row expands to show summary, top_events (with links), and force_assessments.
2. **Accept / Dismiss actions**:
   - **Accept** → creates a new investigation case pre-filled with: title, summary as case description, top_events as initial evidence items (URL + source + credibility), link back to the signal. Sets `status='accepted'`.
   - **Dismiss** → requires selecting a reason; sets `status='dismissed'`, `verdict='false_signal'`, and immediately fires the verdict callback with the dismissal note.
3. **Case closure flow** — when closing a case linked to a signal, add a required field "Signal verdict": จริง (true_signal) / หลอก (false_signal) / สรุปไม่ได้ (inconclusive) + optional note. On save: update `external_signals`, fire the verdict callback.
4. **Origin badge** — cases created from signals display a small "จาก Horizon" badge with a link to the original signal detail.

All new UI strings in Thai. Reuse existing component library and styles; do not introduce new UI dependencies.

## Configuration (add to existing .env)

```
HORIZON_INBOUND_API_KEY=      # key Horizon must present to us
HORIZON_BASE_URL=             # e.g. http://<horizon-host>:8300
HORIZON_API_KEY=              # key we present to Horizon's verdict endpoint
```

If `HORIZON_BASE_URL` is unset, the verdict callback is skipped silently (log at INFO); inbound endpoint still works.

## Testing Requirements

- Contract tests: validate inbound handling and outbound verdict payload against the JSON Schema files in `contracts/`.
- Idempotency test: same `signal_id` POSTed twice → one row, same response.
- Flow test: inbound signal → accept → case created with evidence items → close with verdict → callback fired with correct payload (mock Horizon endpoint).
- Auth tests: missing/wrong API key → 401.

## Out of Scope (do not build)

- No changes to Horizon itself (separate repo, separate CLAUDE.md).
- No automatic case creation without analyst acceptance.
- No syncing of case contents back to Horizon beyond the verdict payload.
