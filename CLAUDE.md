# OSINT//DESK

Newsroom intelligence platform: automated feed triage, deep investigation workspace, UGC verification, scenario simulation, and dark web monitoring — self-hosted, open-source stack, production-ready.

## Commands

```bash
# Development
docker compose -f docker-compose.dev.yml up -d     # start all services
docker compose logs -f api                          # tail API logs
make test                                           # run full test suite
make test-unit                                      # unit tests only
make lint                                           # ruff + mypy + eslint
make type-check                                     # mypy strict

# Database
make migrate                                        # alembic upgrade head
make migrate-create msg="add_simulation_results"   # new migration
make seed-dev                                       # seed dev data

# Build & Deploy
make build                                          # build all images
make deploy-staging                                 # deploy to staging
make deploy-prod                                    # deploy to production (requires approval)
```

## Architecture

Three-layer separation — never mix concerns across layers:

```
services/
├── api/                    # FastAPI — all business logic lives here
│   ├── adapters/           # ingestion adapters (one per source type)
│   ├── modules/            # feature modules — see full list below
│   ├── core/               # shared infra: auth, config, db, cache, queue
│   └── workers/            # Celery tasks
├── frontend/               # Next.js 14 — UI only, no business logic
│   ├── app/                # App Router pages
│   ├── components/         # shared UI components
│   └── lib/                # API client, hooks, utils
├── darkweb/                # isolated crawler service (separate network)
│   ├── crawler/            # TorBot + VigilantOnion workers
│   └── filter/             # content filter before any storage write
└── infra/                  # docker-compose, nginx, monitoring configs
```

### Full module list (api/modules/)

Collection & processing:
- `triage/` — feed scoring, verdict assignment
- `investigation/` — case workspace, network graph, evidence board
- `verify/` — UGC media verification
- `brief/` — two-tier brief builder (internal/public)
- `simulation/` — MiroFish scenario simulation
- `darkweb/` — dark web intelligence (isolated)

Intelligence cycle (full IC standard):
- `requirements/` — PIR tasking, EEI tracking, auto-match incoming data to requirements
- `reliability/` — NATO Admiralty Code source scoring (A-F / 1-6), auto-adjust by track record
- `collaboration/` — multi-analyst activity feed, comments, handoff, dissent preservation, real-time presence
- `confidence/` — analytic confidence levels (high/med/low), dissent records, Analysis of Competing Hypotheses
- `deception/` — counter-intelligence checks, cui bono analysis, bot network detection
- `knowledge/` — cross-case entity history, institutional memory, pattern detection

### Module structure (api/modules/)

Each module is self-contained:

```
modules/triage/
├── __init__.py
├── router.py       # FastAPI router — HTTP only
├── service.py      # business logic — pure functions where possible
├── models.py       # SQLAlchemy models
├── schemas.py      # Pydantic in/out schemas
├── tasks.py        # Celery tasks for this module
└── tests/
    ├── test_service.py
    └── test_router.py
```

### Data flow rule

```
External source → Adapter → CanonicalFeedItem → Redis queue → Celery worker → LLM scoring → PostgreSQL → API → Frontend
```

Two cross-cutting layers tag every item as it flows:
- `reliability/` assigns an Admiralty score (source × info credibility) at ingestion
- `requirements/` auto-matches each item against open PIRs and updates their progress

Dark web path adds one mandatory gate:

```
.onion → Tor proxy → Crawler → ContentFilter → (PASS) → CanonicalFeedItem → same pipeline
                                              → (BLOCK) → quarantine log only
```

## Key Files

- `services/api/core/config.py` — all environment variables with defaults
- `services/api/adapters/base.py` — BaseAdapter ABC (extend this for new sources)
- `services/api/modules/triage/schemas.py:CanonicalFeedItem` — canonical data model
- `services/api/core/llm.py` — LLM client with model routing per module
- `docker-compose.yml` — production service definitions
- `docker-compose.dev.yml` — development overrides
- `infra/nginx/nginx.conf` — reverse proxy config

## Coding Standards

- Python 3.11+ · FastAPI · SQLAlchemy 2.0 async · Pydantic v2
- Node 20+ · Next.js 14 · TypeScript strict · Tailwind CSS
- All API endpoints have Pydantic input validation — never `dict` as input
- All DB operations use async SQLAlchemy sessions — never sync
- Celery tasks are idempotent — safe to retry on failure
- No business logic in routers — routers call service functions only
- Service functions do not import from routers
- Each new adapter must implement `BaseAdapter` fully — see `adapters/base.py`

## Testing

- Unit tests: `pytest services/api -m unit` — no DB, no network, mock everything
- Integration tests: `pytest services/api -m integration` — requires running services
- Target coverage: 80% minimum for `modules/` and `adapters/`
- Frontend: `pnpm test` — Vitest + React Testing Library
- E2E: `pnpm test:e2e` — Playwright against staging

## Environment

Required env vars — see `.env.example` for full list:

```
OLLAMA_BASE_URL         # http://host:11434
OLLAMA_DEFAULT_MODEL    # gemma4:12b
POSTGRES_URL            # postgresql+asyncpg://...
NEO4J_URI               # bolt://localhost:7687
REDIS_URL               # redis://localhost:6379/0
MINIO_ENDPOINT          # localhost:9000  (NO http:// prefix — code prepends it)
SEARXNG_URL             # http://localhost:8080
PERPLEXICA_URL          # http://localhost:3002  (Vane image — root / returns 200, /api/health returns 404)
SPIDERFOOT_URL          # http://localhost:5001
# MIROFISH_URL — leave unset to use LLM fallback; set to http://localhost:5002 only if Zep graph workflow is configured
SECRET_KEY              # JWT signing key
```

Module-specific routing (override per module). All modules except triage default to `gemma4:12b`.
UI settings (Admin → Settings → AI) override these env vars at runtime — no container restart needed:

```
TRIAGE_MODEL            # default: gemma4:e4b  (triage queue — lightweight)
BRIEF_MODEL             # default: gemma4:12b
VISION_MODEL            # default: gemma4:12b
SIMULATION_MODEL        # default: gemma4:12b
REQUIREMENTS_MODEL      # default: gemma4:12b  (PIR / EEI matching)
DECEPTION_MODEL         # default: gemma4:12b  (cui bono, bot detection)
DARKWEB_MODEL           # default: gemma4:12b  (classify .onion content)
```

**Model routing pattern** — every module that calls LLM must use this:
```python
from ..admin.service import get_effective_model
effective_model = await get_effective_model("module_name")
result = await chat_json(messages, module="module_name", model=effective_model)
```
`get_effective_model()` reads `SystemSettings` DB first, falls back to env var. Direct `settings.xxx_model` bypasses the UI override — don't do this.

## Integration Notes

**SpiderFoot API** (CherryPy, not REST-style):
- Start: `POST /startscan` with form data (`scanname`, `scantarget`, `usecase=all`) + `Accept: application/json` → returns `["SUCCESS", scanId]`
- Status: `GET /scanstatus?id={scanId}` → array where index 5 is status string (`FINISHED` / `ABORTED` / `ERROR-FAILED`)
- Results: `GET /scaneventresults?id={scanId}` → array of result arrays
- Abort: `GET /stopscan?id={scanId}`
- **Target types**: SpiderFoot accepts domain, IP, or email ONLY — not full URLs (`https://...`) and not plain entity names ("Australia"). Extract `netloc` from URL with `urlparse`, strip `www.`, validate with domain regex before passing as target.

**Perplexica / Vane image**: health check is `GET /` (200 OK) — `/api/health` returns 404

**MinIO**: `MINIO_ENDPOINT` must NOT have `http://` prefix — code in `verify/router.py` prepends it

**MiroFish**: `MIROFISH_URL` unset → LLM fallback used (correct behavior). Setting it requires Zep graph workflow configured — see `modules/simulation/tasks.py`

**get_settings() lru_cache**: after `.env` changes, use `docker compose up -d --force-recreate api worker worker-intel` (plain restart doesn't reload env vars)

**Meilisearch primary key**: `feed_items` index has both `id` and `source_id` — always set `primaryKey="id"` explicitly on `create_index()` and in every `add_documents()` call, otherwise Meilisearch raises `index_primary_key_multiple_candidates_found` and silently drops documents.

**Cross-source URL dedup**: `_ingest_source()` deduplicates by both `external_id` (within same source) AND `url` (across all sources). This prevents the same article from 15 different RSS feeds being stored 15 times.

**Celery queues** — `intel` is the only one with a worker running:
- `osint-worker-intel` → `intel` queue — 4 concurrency, uses `gemma4:12b`. SpiderFoot scans, PIR matching, verdict callbacks to Horizon, and UGC verification.
- `osint-worker` → `triage` queue — still defined in `docker-compose.yml` but **not running**: feed ingestion moved to Horizon and this worker went with it. The only tasks still routed there are the retired ingestion ones (`triage.poll_all_sources`, `triage.ingest_source`, reachable from the admin "ingest now" action on a source).
- **Anything a user waits on must go to `intel`.** `run_verify_pipeline` was still queued to `triage`; nothing had exercised it, so nothing had failed — the first analyst to upload media would have got a job that never ran, with no error and no failed status. Same failure as a task left on the default `celery` queue, which is why `investigation.run_spiderfoot_scan` must declare `queue="intel"` explicitly.

## Do Not Touch

- `services/darkweb/filter/blocklist.txt` — edit only via admin UI, never directly
- `alembic/versions/` — never edit existing migration files, only add new ones
- `services/api/core/audit.py` — append-only audit log, no delete methods
- `.env.production` — managed by deployment pipeline, not in repo

## Adding New Capabilities

### New ingestion source (adapter)

1. Create `services/api/adapters/{name}.py` — extend `BaseAdapter`
2. Implement `connect()`, `fetch()`, `transform()` → must return `CanonicalFeedItem`
3. Register in `services/api/adapters/registry.py`
4. Add config fields to `services/api/core/config.py`
5. Add UI config section to `frontend/app/admin/settings/adapters/`
6. Write tests in `services/api/adapters/tests/test_{name}.py`

### New feature module

1. Create `services/api/modules/{name}/` with full structure above
2. Register router in `services/api/main.py`
3. Add sidebar nav entry in `frontend/components/layout/Sidebar.tsx`
4. Add permission entry in `services/api/core/rbac.py`

### New LLM task

1. Add model routing key to `services/api/core/config.py`
2. Add task in module's `tasks.py` using `get_llm_client(module="name")`
3. Add model selector in Admin Settings → Model Routing

## Services Overview

| Service | Port | Purpose |
|---------|------|---------|
| api | 8000 | FastAPI backend |
| frontend | 3000 | Next.js UI |
| postgres | 5432 | primary database |
| neo4j | 7474/7687 | graph relationships |
| redis | 6379 | queue + cache |
| meilisearch | 7700 | full-text search (feed_items index — see core/search.py) |
| minio | 9000/9001 | object storage |
| ollama | 11434 | local LLM inference |
| searxng | 8080 | meta search engine |
| perplexica | 3002 | AI research assistant (Vane image — health check GET /, not /api/health) |
| spiderfoot | 5001 | OSINT scanner |
| mirofish | 5002 | simulation API (LLM fallback used when MIROFISH_URL unset) |
| mirofish-ui | 5003 | simulation frontend |
| n8n | 5678 | workflow automation |
| tor-proxy | 9050 | Tor SOCKS5 (isolated) |
| content-filter | 8001 | dark web content filter (isolated) |

## Deployment

- Production: single-host Docker Compose, nginx reverse proxy, SSL via Let's Encrypt — run `./deploy.sh`
- Scaling path: split `api` workers horizontally behind load balancer, scale Celery workers independently
- Dark web services run in isolated Docker network (`darkweb-net`, `internal: true`) — no direct internet access except through Tor proxy
- Service health: `GET /api/v1/admin/health` or Admin → Settings → Health tab

## Module Reference Map

Each module has a written spec (`docs/specs/`) and a clickable UI mockup (`docs/mockups/`). **Before building any module, read its spec and open its mockup.** Specs define behavior; mockups define exact layout, components, colors, and interactions. Do not invent UI — match the mockup.

| Module | Spec | Mockup |
|--------|------|--------|
| Overall architecture | `docs/specs/02_architecture.md` | `docs/mockups/05_system_diagram.html` |
| User workspace (all 4 core pages) | `docs/specs/02_architecture.md` | `docs/mockups/04_app_prototype.html` |
| Ingestion adapters | `docs/specs/06_adapter_framework.md`, `docs/specs/07_adapter_spec.md` | `docs/mockups/08_adapter_ui.html` |
| Scenario simulation | `docs/specs/09_simulation_module.md` | `docs/mockups/09_simulation_ui.html` |
| Admin settings | `docs/specs/02_architecture.md` | `docs/mockups/10_admin_settings.html` |
| Dark web intelligence | `docs/specs/11_darkweb_module.md` | `docs/mockups/11_darkweb_ui.html` |
| Intelligence cycle (PIR, reliability, collaboration, confidence, deception, knowledge) | `docs/specs/12_intelligence_cycle.md` | `docs/mockups/12_intelligence_ui.html` |

Business/pitch context (not code, but useful for understanding *why*): `docs/specs/01_product_proposal.md`, `docs/mockups/03_pitch_site.html`.

## Build Order

Follow `docs/roadmap.md` — build in phases, ship working software at each phase, do not build all modules at once.

## Current Status

See `docs/roadmap.md` for feature status and build sequence.

---

## Frontend Architecture

### Stack

```
Next.js 14 (App Router) · TypeScript strict · Tailwind CSS · shadcn/ui
Zustand (client state) · TanStack Query v5 (server state) · Zod (validation)
Recharts (charts) · vis-network (graph visualization)
```

### Directory Structure

```
frontend/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # login, unauthenticated routes
│   ├── (dashboard)/            # authenticated app shell
│   │   ├── layout.tsx          # sidebar + topbar shell
│   │   ├── today/page.tsx      # Today's Intel
│   │   ├── investigation/
│   │   │   └── [caseId]/page.tsx
│   │   ├── verify/page.tsx
│   │   ├── brief/
│   │   │   └── [briefId]/page.tsx
│   │   ├── simulation/
│   │   │   └── [caseId]/page.tsx
│   │   └── darkweb/page.tsx
│   └── admin/
│       └── settings/
│           └── [section]/page.tsx
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx         # collapsible nav with expand/collapse groups
│   │   ├── Topbar.tsx
│   │   └── AdminNav.tsx
│   ├── triage/                 # Today's Intel components
│   │   ├── AlertCard.tsx       # priority/investigate/fast-track card
│   │   ├── StatusBar.tsx       # compact 4-stat horizontal bar
│   │   └── FeedTable.tsx
│   ├── investigation/
│   │   ├── NetworkGraph.tsx    # vis-network wrapper
│   │   ├── EvidenceBoard.tsx   # kanban: verified/partial/unverified
│   │   ├── Timeline.tsx
│   │   └── ResearchPanel.tsx   # Perplexica embedded search
│   ├── verify/
│   │   ├── DropZone.tsx
│   │   └── VerifyResultCard.tsx
│   ├── brief/
│   │   ├── BriefEditor.tsx
│   │   ├── ModeToggle.tsx      # internal ↔ public toggle
│   │   └── ExportPanel.tsx
│   ├── simulation/
│   │   ├── ScenarioCard.tsx    # best/base/worst
│   │   ├── AgentGrid.tsx
│   │   └── SimProgress.tsx
│   ├── darkweb/
│   │   ├── QueryBox.tsx        # requires editorial purpose input
│   │   ├── ResultRow.tsx
│   │   └── LegalReviewQueue.tsx
│   ├── admin/
│   │   ├── FieldRow.tsx        # label + input row pattern
│   │   ├── ServiceHealthCard.tsx
│   │   └── ModelRoutingTable.tsx
│   └── ui/                     # shadcn/ui primitives (DO NOT edit)
├── lib/
│   ├── api/                    # typed API client (one file per module)
│   │   ├── client.ts           # base fetch wrapper with auth + error handling
│   │   ├── triage.ts
│   │   ├── investigation.ts
│   │   ├── verify.ts
│   │   ├── brief.ts
│   │   ├── simulation.ts
│   │   ├── darkweb.ts
│   │   └── admin.ts
│   ├── stores/                 # Zustand stores (client-only state)
│   │   ├── auth.ts
│   │   ├── sidebar.ts          # collapse state
│   │   └── notification.ts
│   ├── hooks/                  # TanStack Query hooks (one per resource)
│   │   ├── useFeedItems.ts
│   │   ├── useCase.ts
│   │   ├── useSimulation.ts
│   │   └── ...
│   ├── types/                  # shared TypeScript types (mirror Pydantic schemas)
│   │   ├── triage.ts
│   │   ├── investigation.ts
│   │   └── ...
│   └── utils/
│       ├── format.ts           # date, number, verdict label formatting
│       └── cn.ts               # Tailwind class merge helper
└── public/
```

### Design System

**Colors (CSS variables in `globals.css`):**

```css
--bg: #0D0F14          /* page background */
--surface: #13161D     /* card background */
--surface-2: #191D26   /* nested card / input background */
--surface-3: #1F2330   /* hover state */
--border: #232838
--border-2: #2C3347
--text: #C9D1E0        /* primary text — NOT pure white */
--text-2: #7A869A      /* secondary text */
--text-3: #445068      /* placeholder / label */
--accent: #4B7BEC      /* blue — fast track, links */
--green: #1E8449       /* verified, pass */
--yellow: #B7860D      /* investigate, partial, warning */
--red: #C0392B         /* priority, error, blocked */
--purple: #7D3C98      /* simulation, admin */
--teal: #16A085        /* messaging adapters */
--darkweb: #2C3E50     /* dark web module accent */
--darkweb-s: #7FB3D3   /* dark web text on dark-web bg */
```

**Typography:**
- UI text: `font-thai` → Noto Sans Thai + Inter fallback
- Data / code / IDs: `font-mono` → IBM Plex Mono
- Do not use `text-white` — use `text-[var(--text)]` for primary text

**Verdict badges** — always use these classes, never invent new ones:

```tsx
// components/ui/VerdictBadge.tsx
type Verdict = 'PRIORITY' | 'INVESTIGATE' | 'FAST_TRACK' | 'PASS' | 'VERIFIED' | 'SUSPICIOUS' | 'BLOCKED'
```

**Status dots** — always pair with text, never standalone icon only

### Component Conventions

```tsx
// Every data-fetching page component pattern
export default function TodayPage() {
  // 1. server component fetches initial data
  // 2. client components handle interactivity
  // 3. TanStack Query for polling / mutations
  // 4. Zustand for UI-only state (sidebar open, selected row)
}

// Every form: Zod schema → react-hook-form → API call → toast
const schema = z.object({ ... })
const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
```

**Rule: no `any` in TypeScript.** If the type is unknown, use `unknown` and narrow it.

**Rule: no inline styles.** Use Tailwind classes or CSS variables only.

**Rule: no `fetch()` in components.** All API calls go through `lib/api/` functions called from TanStack Query hooks.

### State Management Rule

| What | Where |
|------|-------|
| Server data (feed items, cases, etc.) | TanStack Query |
| UI state (sidebar open, selected row) | Zustand |
| Form state | react-hook-form |
| URL state (filters, pagination) | `useSearchParams` |
| Never in component `useState` | server data or shared UI state |

### Adding a New Page / Module to UI

1. Create `app/(dashboard)/{module}/page.tsx`
2. Add route to `components/layout/Sidebar.tsx` nav config array
3. Create `components/{module}/` directory with feature components
4. Create `lib/api/{module}.ts` with typed API functions
5. Create `lib/hooks/use{Module}.ts` with TanStack Query hooks
6. Add types to `lib/types/{module}.ts` mirroring backend Pydantic schemas
7. Add RBAC check: wrap page with `<RequireRole role="analyst" />` if needed

### Real-time Updates

- Triage feed: poll every 30s via TanStack Query `refetchInterval`
- Investigation scan progress: WebSocket via `/ws/scan/{caseId}`
- Simulation progress: WebSocket via `/ws/simulation/{jobId}`
- Notifications: Server-Sent Events via `/api/v1/events`

WebSocket hook pattern: `lib/hooks/useWebSocket.ts` — use this, do not create raw WebSocket connections in components.

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
  "verdict": "true_signal | false_signal | inconclusive | off_topic",
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
  verdict TEXT NULL,              -- true_signal | false_signal | inconclusive | off_topic
  analyst_note TEXT NULL,
  callback_status TEXT NULL,      -- pending | delivered | failed
  received_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ NULL
)
```

## UI Additions (Investigation module)

1. **Signals inbox** — new list view under Investigation: incoming signals with `pending_review` status. Columns: type badge (weak_signal / trend_breakout), title, scores, categories, received time. Row expands to show summary, top_events (with links), and force_assessments.
## Signal profiles — what this newsroom is watching

Horizon pushes every signal its detectors surface. It has no idea what any
particular newsroom covers, and it should not: editorial priorities change weekly
and belong on this side of a deliberately loose integration.

Without somewhere to say so, the inbox mixed the story an editor was waiting for
with a football final, and the only way to clear the football was to dismiss it —
which used to report back that the detection had been wrong.

`signal_profiles(name, description, categories[], active)`, matched in
`signals/service.py:match_profile` at intake:

1. **Category overlap** decides on its own. Horizon's labels are already agreed
   between the systems, so this is free and deterministic.
2. **Otherwise the model reads the description.** A subject is not a category: a
   clash in Narathiwat arrived labelled `ต่างประเทศ` and reached the southern
   security profile only because someone had written what that profile is for.
3. **No match is a real answer** — `profile_id` NULL has its own box. It means
   the engine surfaced something nobody asked for, which is worth seeing rather
   than filed somewhere convenient.

`SIGNAL_PROFILE_MATCHING=false` skips step 2. The test suite sets it: once two
profiles existed, a live model sat on the path of every ingest and the signals
suite went from 5 seconds to 3 minutes.

Clicking a profile opens a **brief**, not a narrower list: `GET
/profiles/{id}/brief` returns a timeline assembled from the signals' own
`top_events` (deduplicated by URL, undated events kept at the end rather than
dropped), plus the model's reading of where the beat is moving. The two are
separate fields and separate blocks in the UI on purpose — the timeline can be
checked against the cards below it, the reading cannot.

Deleting a profile is `ON DELETE SET NULL` — signals filed under it fall back to
the unsorted box. Retiring a beat must not destroy the leads collected under it.

**`off_topic` is not a fourth grade of wrongness.** It says the detection was
correct and the story is simply not on this newsroom's beat — feedback about
relevance, not accuracy. Horizon's `verdicts` table is the corpus it tunes
detection thresholds against, so this distinction is load-bearing: dismissal used
to always send `false_signal`, which meant an editor clearing off-beat stories
was training the radar to suppress the detections that were working. Nothing in
either system would have shown it happening.

2. **Accept / Dismiss actions**:
   - **Accept** → creates a new investigation case pre-filled with: title, summary as case description, top_events as initial evidence items (URL + source + credibility), link back to the signal. Sets `status='accepted'`.
   - **Dismiss** → requires a reason *and* which kind of no it is: `off_topic` (the default — real story, not our subject) or `false_signal` (the detection itself was wrong). Sets `status='dismissed'` and fires the verdict callback.
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

## Implementation notes (module built — read before changing it)

Lives in `app/modules/signals/` and follows the standard module layout. Nothing
outside it was modified except four additive lines: the router registration in
`main.py`, the task module and queue route in `worker.py`, the model import in
`alembic/env.py`, and three settings in `core/config.py`.

**Endpoints** (`/api/v1/signals`):

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/inbound` | `X-API-Key` (Horizon) | `202 {osint_signal_id}`, idempotent on `signal_id` |
| GET | `` | session | list, `?status=` filter |
| GET | `/count` | session | badge counter for `pending_review` |
| GET | `/{id}` | session | detail |
| POST | `/{id}/accept` | session | creates a case, `201` with the case |
| POST | `/{id}/dismiss` | session | reason required, fires the verdict callback |
| POST | `/{id}/close` | session | verdict required, fires the verdict callback |
| GET | `/by-case/{case_id}` | session | backs the origin badge; `404` = opened by hand |

**Why `/close` lives here and not in Investigation.** The spec asks for a signal
verdict when closing a signal-originated case. Putting that in the Investigation
module's case update would change how every ordinary case closes. Instead the UI
calls this endpoint for signal-originated cases only, and `PATCH /cases/{id}`
behaves exactly as it did before this integration existed.

**Idempotency** is the `signal_id UNIQUE` constraint, not application logic.
Horizon retries anything that is not a 202, so this is the difference between
one lead and five for the same story.

**The verdict callback** is `signals.send_verdict` on the `intel` queue, retrying
at 30s → 2m → 10m → 1h before `callback_status='failed'`. 5xx and 408/425/429
are retried; any other 4xx means Horizon rejected the body and resending it
unchanged would only repeat the rejection. `HORIZON_BASE_URL` unset →
`callback_status='disabled'`, logged at INFO. A failed callback never blocks a
case from closing.

**Contracts.** `contracts/*.json` are copied from the Horizon repo and are the
shared source of truth. `app/modules/signals/tests/test_service.py` validates
both payloads against them and asserts the Pydantic models cover the same fields
— if either repo renames something, the tests fail instead of the integration
going quiet in production.

**Frontend.** `app/(dashboard)/investigation/signals/page.tsx` is the inbox;
`components/investigation/SignalOrigin.tsx` renders the origin badge and the
close-with-verdict flow and returns `null` for cases opened by hand, so the case
page gained one line rather than a branch. Sidebar carries the pending badge.
