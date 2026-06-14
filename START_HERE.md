# เริ่มต้นที่นี่ — ขึ้น OSINT//DESK บน Ubuntu

ระบบนี้พร้อมใช้งานแล้ว (Phase 0–5 สมบูรณ์) — รันคำสั่งเดียวจบ

---

## สิ่งที่ต้องมีบน Ubuntu ก่อน

| สิ่งที่ต้องการ | ขั้นต่ำ | ตรวจสอบ |
|---|---|---|
| Docker + Docker Compose plugin | 24+ / 2.20+ | `docker compose version` |
| RAM | 16 GB | `free -h` |
| Disk | 50 GB ว่าง | `df -h` |
| Ollama | latest | `curl http://localhost:11434/api/tags` |

ถ้า Ollama ยังไม่มี model:
```bash
ollama pull qwen3:8b          # โมเดลหลัก (ต้องมี)
ollama pull qwen3:14b         # สำหรับ brief/simulation
ollama pull gemma4:12b        # สำหรับ vision/verify (ถ้า VRAM พอ)
```

---

## ขั้นตอนเดียว — ติดตั้งและรัน

```bash
# Clone repo
git clone <repo-url> osintdesk && cd osintdesk

# รัน deploy script
./deploy.sh
```

script จะถามรหัสผ่านสำหรับ PostgreSQL, Neo4j, MinIO และ Ollama URL
จากนั้นทำทุกอย่างอัตโนมัติ: build images → ขึ้น services → migrate DB → seed admin → ตรวจสอบ integration

เมื่อเสร็จ เปิดเบราว์เซอร์:
- **UI** → `http://localhost:3000`
- **API Docs** → `http://localhost:8000/docs`

**Login:** `admin@osintdesk.local` / รหัสผ่านที่กรอกตอน `./deploy.sh`

> เปลี่ยน password ทันทีหลัง login ครั้งแรก: Admin → Settings → Users

---

## คำสั่งที่ใช้บ่อย

```bash
./deploy.sh --update    # อัพเดทโค้ด — rebuild images + restart (ไม่ถามรหัสผ่านซ้ำ)
./deploy.sh --restart   # restart api + worker เร็วกว่า rebuild
./deploy.sh --logs      # ดู live logs ทุก service
./deploy.sh --down      # หยุดทุก service
```

---

## ถ้า Ollama อยู่คนละเครื่อง

แก้ `.env` ก่อนรัน `./deploy.sh`:
```bash
nano .env
# เปลี่ยน:
OLLAMA_BASE_URL=http://192.168.1.100:11434   # IP ของเครื่อง Ollama จริง
```

---

## Dark Web Module (Phase 5)

Dark web module **ปิดอยู่โดย default** — ต้องทำก่อนเปิดใช้:

1. ขอ legal approval เป็นลายลักษณ์อักษรจากฝ่ายกฎหมายขององค์กร
2. อ่าน `docs/specs/11_darkweb_module.md` — ครบทุกข้อ
3. ตั้ง editorial policy สำหรับ query ที่อนุญาต
4. เปิดใช้ใน Admin → Settings → Dark Web

ไม่มีเหตุผลด้านเทคนิคที่ต้องรีบเปิด — ข้ามไปก่อนได้

---

## ถ้าระบบขึ้นแล้วมีปัญหา

```bash
# ดู logs service ที่มีปัญหา
docker compose logs -f api
docker compose logs -f worker

# ตรวจ health ทุก service
curl http://localhost:8000/api/v1/admin/health

# force recreate ถ้า env var ไม่โหลด
docker compose up -d --force-recreate api worker
```

เอกสารเพิ่มเติม: `README.md` (workflow), `CLAUDE.md` (สำหรับ developer), `docs/roadmap.md`
