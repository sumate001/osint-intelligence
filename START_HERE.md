# เริ่มต้นที่นี่ — ขึ้น OSINT//DESK บน Ubuntu

คู่มือนี้พาขึ้น Phase 0 (infrastructure) แล้วส่งต่อให้ Claude Code ทำ Phase 1+

---

## สิ่งที่ต้องมีบน Ubuntu ก่อน

- Docker + Docker Compose plugin
- Node.js 20+ (สำหรับ Claude Code)
- Ollama ที่รันอยู่แล้ว พร้อม model: `qwen3:8b` อย่างน้อย
- Anthropic API key (สำหรับ Claude Code)

ตรวจเร็วๆ:
```bash
docker --version && docker compose version
node --version
curl -s http://localhost:11434/api/tags   # ดู Ollama models
```

ถ้ายังไม่มี model:
```bash
ollama pull qwen3:8b
ollama pull qwen3:14b      # สำหรับ brief/simulation (optional ตอนแรก)
```

---

## ขั้นที่ 1 — วาง repo บน Ubuntu

จาก Mac, copy zip ขึ้น Ubuntu (แก้ user@host ตามจริง):
```bash
scp osint_desk_repo.zip user@ubuntu-host:~/
scp osint_starter.zip   user@ubuntu-host:~/
```

SSH เข้า Ubuntu แล้วแตกไฟล์:
```bash
ssh user@ubuntu-host
cd ~
unzip osint_desk_repo.zip -d osintdesk    # ได้ CLAUDE.md, README.md, docs/
unzip osint_starter.zip -d osintdesk       # ได้ docker-compose, .env.example, bootstrap.sh
cd osintdesk
```

โครงสร้างที่ควรได้:
```
osintdesk/
├── CLAUDE.md
├── README.md
├── docker-compose.dev.yml
├── .env.example
├── bootstrap.sh
└── docs/
    ├── roadmap.md
    ├── specs/
    └── mockups/
```

---

## ขั้นที่ 2 — รัน bootstrap

```bash
./bootstrap.sh
```

script จะ:
- ตรวจ docker + ollama
- สร้าง `.env` พร้อม generate SECRET_KEY
- ดึง images
- ขึ้น infrastructure 6 ตัว (postgres, redis, neo4j, meilisearch, minio, searxng)

**สำคัญ:** เปิด `.env` แก้ password ก่อนทำต่อ
```bash
nano .env    # แก้ POSTGRES_PASSWORD, NEO4J_PASSWORD, MINIO_PASSWORD, MEILI_MASTER_KEY
```

ถ้า Ollama อยู่คนละเครื่อง (เช่น A5000 แยก) แก้บรรทัดนี้ใน `.env`:
```
OLLAMA_BASE_URL=http://100.94.37.18:11434
```

ตรวจว่า infra ขึ้นครบ:
```bash
docker compose -f docker-compose.dev.yml ps
```

---

## ขั้นที่ 3 — ติดตั้ง Claude Code

```bash
npm install -g @anthropic-ai/claude-code
export ANTHROPIC_API_KEY=sk-ant-...    # API key ของคุณ
```

---

## ขั้นที่ 4 — ให้ Claude Code ทำ Phase 1

```bash
cd ~/osintdesk
claude
```

แล้วพิมพ์:
```
อ่าน CLAUDE.md และ docs/roadmap.md จากนั้น implement Phase 1 (Ingestion + Triage)
สร้าง services/api และ services/frontend ตามโครงสร้างใน CLAUDE.md
เริ่มจาก RSS adapter + triage scoring ก่อน
```

Claude Code จะ:
- สร้าง `services/api/` (FastAPI + adapters + triage module)
- สร้าง `services/frontend/` (Next.js + Today's Intel page)
- เขียน Dockerfile ของแต่ละ service
- ทดสอบจน RSS feed เข้า → score → แสดงผลได้

---

## ขั้นที่ 5 — ขึ้น stack เต็ม

หลัง Claude Code สร้าง api + frontend เสร็จ:
```bash
docker compose -f docker-compose.dev.yml up -d --build
```

เปิดดู:
- Frontend → http://ubuntu-host:3000
- API docs → http://ubuntu-host:8000/docs

---

## หลังจากนี้

ทำ Phase ต่อไปตาม `docs/roadmap.md` — บอก Claude Code ทีละ phase:
```
implement Phase 2 (Investigation + Verify) ตาม docs/roadmap.md
```

แต่ละ phase Claude Code จะอ่าน spec + mockup ที่เกี่ยวข้องเองจาก Module Reference Map ใน CLAUDE.md

---

## หมายเหตุ

- **Dark web module (Phase 5)** — อย่าขึ้นบนเครื่องนี้ ต้องแยก VM + ผ่าน legal review ก่อน
- ถ้า RAM ไม่พอตอนรัน model ใหญ่ — ใช้ qwen3:8b อย่างเดียวไปก่อน ปรับใน `.env`
- Neo4j ครั้งแรกอาจใช้เวลา ~30 วินาทีกว่าจะ healthy
