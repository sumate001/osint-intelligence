# OSINT//DESK

แพลตฟอร์มข่าวกรองสำหรับห้องข่าว — คัดกรองข่าวอัตโนมัติ สืบสวนเชิงลึก ตรวจสอบสื่อ จำลองสถานการณ์ และเฝ้าระวัง dark web ทำงานบนเซิร์ฟเวอร์ตัวเอง ใช้ open-source ทั้งหมด

---

## เริ่มต้นที่นี่ (สำหรับ developer / Cowork)

อ่านตามลำดับนี้:

1. **`CLAUDE.md`** — อ่านก่อนเสมอ มีทุกอย่างที่ต้องรู้: โครงสร้าง, coding standards, วิธี build/test, ขอบเขตที่ห้ามแตะ, และ map ว่าแต่ละ module อยู่ที่ spec/mockup ไหน
2. **`docs/roadmap.md`** — ลำดับการ build แบบ phase เริ่มจาก Phase 0 แล้วไล่ไปตามลำดับ
3. **spec + mockup ของ module ที่กำลังทำ** — อยู่ใน `docs/specs/` และ `docs/mockups/` อ่านเฉพาะตอนจะ build module นั้น (ดู Module Reference Map ใน CLAUDE.md)

**สรุป workflow:** อ่าน CLAUDE.md → เปิด roadmap → เริ่ม Phase 0 → พอจะทำ module ไหน เปิด spec + mockup ของ module นั้น → build → test → ขึ้น phase ถัดไป

---

## โครงสร้างเอกสาร

```
CLAUDE.md                    # คู่มือหลักสำหรับ dev — อ่านก่อนเสมอ
README.md                    # ไฟล์นี้
docs/
├── roadmap.md               # ลำดับการ build แบบ phase
├── specs/                   # เอกสารออกแบบรายละเอียด (อ่านตอนจะ build)
│   ├── 01_product_proposal.md      # business case (ทำไมถึงสร้าง)
│   ├── 02_architecture.md          # สถาปัตยกรรมระบบ
│   ├── 06_adapter_framework.md     # ingestion adapter framework
│   ├── 07_adapter_spec.md          # adapter spec + code
│   ├── 09_simulation_module.md     # MiroFish simulation
│   ├── 11_darkweb_module.md        # dark web (ต้อง legal review)
│   └── 12_intelligence_cycle.md    # PIR, reliability, collab, confidence, deception, knowledge
└── mockups/                 # UI mockup ที่คลิกได้ (ดูตอน build frontend)
    ├── 03_pitch_site.html          # หน้าขาย product
    ├── 04_app_prototype.html       # user workspace 4 หน้าหลัก
    ├── 05_system_diagram.html      # diagram ระบบ drill-down
    ├── 08_adapter_ui.html          # adapter config UI
    ├── 09_simulation_ui.html       # simulation UI
    ├── 10_admin_settings.html      # admin settings ครบ
    ├── 11_darkweb_ui.html          # dark web UI
    └── 12_intelligence_ui.html     # 6 intelligence modules
```

---

## หลักการสำคัญ

- **Mockup คือ source of truth ของ UI** — สร้าง frontend ให้ตรงกับ mockup ไม่ใช่คิดเอง layout, สี, component, interaction ดูจาก mockup
- **Spec คือ source of truth ของ behavior** — logic, data flow, business rule ดูจาก spec
- **CLAUDE.md คือ source of truth ของ how** — โครงสร้างโค้ด, มาตรฐาน, ขอบเขต
- **Build ทีละ phase** — ship ของที่ใช้ได้จริงก่อนขึ้น phase ถัดไป

---

## Tech Stack

Backend: FastAPI · SQLAlchemy 2.0 async · Celery · Pydantic v2
Frontend: Next.js 14 · TypeScript · Tailwind · TanStack Query · Zustand
Data: PostgreSQL · Neo4j · Redis · Meilisearch · MinIO
AI/Search: Ollama (qwen3) · SearXNG · Perplexica · SpiderFoot · MiroFish
Infra: Docker Compose · nginx · Grafana

รายละเอียดทั้งหมดดูใน `CLAUDE.md`
