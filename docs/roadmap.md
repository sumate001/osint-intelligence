# OSINT//DESK — Build Roadmap

ลำดับการพัฒนาแบบ phase — แต่ละ phase ต้อง ship ของที่ใช้งานได้จริงก่อนขึ้น phase ถัดไป
ห้าม build ทุก module พร้อมกัน เพราะจะ test ไม่ได้และ debug ยาก

---

## หลักการ

แต่ละ phase มีเป้าหมายว่า "เมื่อจบ phase นี้ ต้องสาธิตอะไรได้" ถ้าสาธิตไม่ได้ ยังไม่จบ phase
ทุก module ต้องมี test ผ่านก่อนถือว่าเสร็จ (ดู Testing section ใน CLAUDE.md)

---

## Phase 0 — Foundation (สัปดาห์ 1-2)

**เป้าหมาย:** วางโครงสร้างที่ทุก module ต่อยอดได้

- [x] ตั้ง repo structure ตาม CLAUDE.md (`services/api`, `services/frontend`, `infra`)
- [x] `docker-compose.dev.yml` — postgres, redis, neo4j, ollama, minio ขึ้นได้
- [x] `services/api/core/` — config, db (async SQLAlchemy), cache, queue, auth (JWT)
- [x] `services/api/core/llm.py` — LLM client + model routing per module
- [x] FastAPI app skeleton + health check endpoint
- [x] Next.js skeleton + design system (CSS variables จาก CLAUDE.md) + app shell (sidebar + topbar)
- [x] CI: lint + type-check + test pipeline

**สาธิตได้:** เปิดเว็บเห็น shell ว่างๆ, API ตอบ health check, ทุก service ขึ้นด้วย compose

---

## Phase 1 — Ingestion + Triage (สัปดาห์ 3-4)

**เป้าหมาย:** ข่าวไหลเข้า ได้คะแนน แสดงใน Today's Intel

อ่าน: `docs/specs/06_adapter_framework.md`, `07_adapter_spec.md` · mockup: `08_adapter_ui.html`, `04_app_prototype.html`

- [x] `adapters/base.py` — BaseAdapter ABC + CanonicalFeedItem schema
- [x] `adapters/rss.py` — RSS adapter ตัวแรก (ง่ายสุด เริ่มจากตัวนี้)
- [x] `adapters/registry.py` — plugin registry
- [x] `modules/triage/` — LLM scoring 7 เกณฑ์ + verdict + entity extraction
- [x] `modules/reliability/` — Admiralty scoring ตอน ingestion (cross-cutting layer)
- [x] Celery worker: ingest → score → store
- [x] Frontend: Today's Intel page (mockup 04) — status bar + alert cards
- [x] Frontend: Admin → adapter config (mockup 08)

**สาธิตได้:** เพิ่ม RSS feed ใน admin → ข่าวเข้ามา → ได้คะแนน → เห็นใน Today's Intel เรียงตาม verdict

---

## Phase 2 — Investigation + Verify (สัปดาห์ 5-7)

**เป้าหมาย:** สืบสวนเชิงลึก + ตรวจสอบสื่อ

อ่าน: `docs/specs/02_architecture.md` · mockup: `04_app_prototype.html`

- [x] `modules/investigation/` — case CRUD, evidence board, timeline
- [x] เชื่อม SpiderFoot — network scan → Neo4j
- [x] Frontend: Network graph (vis-network), Evidence board (kanban), Timeline
- [x] เชื่อม Perplexica — research panel ใน investigation
- [x] `modules/verify/` — ExifTool, Wayback, reverse image, faster-whisper
- [x] Frontend: UGC Verify page (drop zone + result cards)

**สาธิตได้:** เปิด case จาก Today's Intel → รัน SpiderFoot → เห็น network graph → เพิ่ม evidence → อัปโหลดคลิป verify

---

## Phase 3 — Brief + Dissemination (สัปดาห์ 8-9)

**เป้าหมาย:** ผลิตรายงานสองชั้น

อ่าน: `docs/specs/02_architecture.md` · mockup: `04_app_prototype.html`

- [x] `modules/brief/` — two-tier brief (internal/public), LLM draft
- [x] `modules/confidence/` — confidence levels + dissent + ACH
- [x] Approval workflow (RBAC: analyst draft → editor approve)
- [x] Export: PDF (internal/public), GEXF, CSV
- [x] Frontend: Brief Builder + mode toggle + export panel

**สาธิตได้:** สร้าง brief จาก investigation → toggle internal/public → ส่ง editor → approve → export PDF

---

## Phase 4 — Intelligence Cycle (สัปดาห์ 10-12)

**เป้าหมาย:** เติมส่วนที่ทำให้เป็นระบบข่าวกรองจริง

อ่าน: `docs/specs/12_intelligence_cycle.md` · mockup: `12_intelligence_ui.html`

- [x] `modules/requirements/` — PIR tasking + EEI tracking + auto-match
- [x] `modules/collaboration/` — activity feed, comments, dissent, real-time (WebSocket)
- [x] `modules/deception/` — counter-intel checks + bot network detection
- [x] `modules/knowledge/` — cross-case entity history + pattern detection
- [x] Frontend: ทั้ง 6 module ตาม mockup 12

**สาธิตได้:** สร้าง PIR → ระบบ match ข้อมูลเข้า → หลาย analyst ทำ case ร่วมกัน → ดู entity history ข้ามเคส

---

## Phase 5 — Advanced (สัปดาห์ 13+)

**เป้าหมาย:** ความสามารถขั้นสูง (optional ตามความต้องการลูกค้า)

- [x] `modules/simulation/` — MiroFish integration (spec 09, mockup 09)
- [x] `modules/darkweb/` — isolated crawler (spec 11, mockup 11) — **ต้องผ่าน legal review ก่อน**
- [x] Environment Monitor — landscape signal tracking
- [x] Watchlist + scheduled scans
- [x] Full admin settings (mockup 10)
- [x] Monitoring: Grafana dashboards

**สาธิตได้:** trigger simulation จาก high-impact case, dark web monitoring (ถ้า legal อนุมัติ)

---

## หมายเหตุสำคัญ

- **Dark web module (Phase 5)** ต้องมี editorial policy + legal approval เป็นลายลักษณ์อักษรก่อน deploy บน production — ดู `docs/specs/11_darkweb_module.md`
- แต่ละ phase ที่จบควร tag release (v0.1, v0.2, ...) เพื่อ rollback ได้
- ถ้า scope บาน ให้ ship phase ที่เสร็จก่อน อย่ารอทำครบทุกอย่าง
