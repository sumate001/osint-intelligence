# เริ่มต้นที่นี่ — ขึ้น OSINT//DESK บน Ubuntu

```bash
git clone <repo-url> osintdesk && cd osintdesk
./deploy.sh --yes
```

จบ ไม่ถามอะไรเลย ค่าที่ขาดจะถูกสร้างให้และพิมพ์ออกมาตอนจบ

ถ้าอยากตั้งค่าเองระหว่างติดตั้ง ใช้ `./deploy.sh` เฉย ๆ — จะถามทีละอย่างโดยมีค่า
เดิมเป็นค่าตั้งต้น รันซ้ำได้เสมอ ของที่ตั้งไว้แล้วจะไม่ถูกแตะ

---

## OSINT//DESK ทำอะไร และไม่ทำอะไร

**ไม่ดึงข่าวเอง** — การดึงข่าว คัดกรอง จัดกลุ่ม และตรวจจับสัญญาณ อยู่ที่ **Horizon**
ซึ่งเป็นระบบแยกอีกตัว DESK คือ *ขั้นตอนที่ 10* ของท่อนั้น: ที่ที่คนลงมือสืบสวน

```
Horizon                                    OSINT//DESK
ดึงข่าว → คัดกรอง → จัดกลุ่ม → ตรวจจับ  ──►  กล่องสัญญาณ → คดี → บทความ
                                     ◄──  verdict กลับไปสอนเรดาร์
```

ติดตั้ง DESK อย่างเดียวก็ใช้ได้ แต่กล่องสัญญาณจะว่าง จนกว่าจะต่อ Horizon

---

## สิ่งที่ต้องมีก่อน

| | ขั้นต่ำ | ตรวจ |
|---|---|---|
| Docker + Compose plugin | 24+ / 2.20+ | `docker compose version` |
| RAM | 16 GB | `free -h` |
| Disk | 50 GB ว่าง | `df -h` |
| Ollama | มี `gemma4:12b` | ดูด้านล่าง |

```bash
ollama pull gemma4:12b   # โมเดลเดียวที่ทุกฟีเจอร์ใช้
ollama pull whisper      # ถอดเสียง (deploy.sh ดึงให้เอง)
```

`gemma4:12b` กิน VRAM ~8.4 GB ถ้าไม่พอ เปลี่ยนได้ที่ Admin → Settings → AI
โดยไม่ต้อง restart

### ถ้า Ollama อยู่คนละเครื่อง — จุดที่พลาดกันบ่อยที่สุด

ค่าตั้งต้นคือ `http://host.docker.internal:11434` ซึ่งหมายถึง *เครื่องที่รัน
Docker* ถ้า Ollama อยู่คนละเครื่อง ต้องใส่ IP ที่ **คอนเทนเนอร์** เข้าถึงได้:

```bash
OLLAMA_BASE_URL=http://100.94.37.18:11434    # ไม่ใช่ localhost
```

`curl http://localhost:11434` ที่รันบนโฮสต์**ตอบคนละคำถาม**กับที่ต้องการรู้ — เคย
ผ่านฉลุยในขณะที่ไม่มีคอนเทนเนอร์ไหนต่อติดเลย และทุกฟีเจอร์ที่ใช้โมเดลตายเงียบ
อยู่หลายวัน `deploy.sh` จึงตรวจจากในคอนเทนเนอร์ให้ ตรวจเองได้ด้วย:

```bash
docker exec osint-api sh -c 'curl -s "$OLLAMA_BASE_URL/api/tags" | head -c 200'
```

---

## หลังติดตั้ง

- **UI** → `http://localhost`
- **API docs** → `http://localhost:8000/docs`
- **Login** → อีเมลกับรหัสที่ script พิมพ์ออกมาตอนจบ

เปลี่ยนรหัสทันทีที่ Admin → Settings → Users

### สามหน้าที่ควรเปิดก่อน

| หน้า | ทำอะไร |
|---|---|
| **สัญญาณจาก Horizon** | กล่องขาเข้า — ตั้ง "ประเด็นที่เราตามอยู่" ที่นี่ก่อน ไม่งั้นทุกอย่างจะกองรวมกัน |
| **แผนที่ข่าว** | เหตุการณ์บนแผนที่ กรองตามประเด็นและช่วงเวลา |
| **Investigation** | คดีที่เปิดจากสัญญาณ พร้อมหลักฐานและตัวละคร |

---

## คำสั่งที่ใช้บ่อย

```bash
./deploy.sh --yes       # ติดตั้ง/ติดตั้งซ้ำ ไม่ถามอะไร
./deploy.sh --update    # git pull + rebuild + migrate
./deploy.sh --restart   # โหลด .env ใหม่แล้วเริ่ม service ที่ทำงานจริง
./deploy.sh --logs      # live logs
./deploy.sh --status    # สถานะ containers
./deploy.sh --down      # หยุดทุก service
```

`--restart` ใช้ `up -d --force-recreate` ไม่ใช่ `docker compose restart` เพราะ
`get_settings()` มี `lru_cache` — restart เฉย ๆ จะรันด้วยค่า env เดิมทั้งที่ดู
เหมือนสำเร็จ

---

## Service ไหนทำงานจริง

```
api · worker-intel · frontend · nginx · postgres · redis
```

`worker` (คิว `triage`) กับ `beat` ยังอยู่ใน compose แต่**ไม่มีงานแล้ว** — การดึง
ข่าวย้ายไป Horizon และ `beat_schedule` ว่างเปล่า อะไรที่ผู้ใช้นั่งรอผลต้องส่งเข้า
คิว `intel` เสมอ

---

## Dark Web Module — ปิดอยู่โดยตั้งใจ

ต้องทำก่อนเปิด:

1. ขอ legal approval เป็นลายลักษณ์อักษรจากฝ่ายกฎหมาย
2. อ่าน `docs/specs/11_darkweb_module.md` ให้ครบ
3. ตั้ง editorial policy ว่า query แบบไหนอนุญาต
4. เปิดที่ Admin → Settings → Dark Web

ไม่มีเหตุผลทางเทคนิคที่ต้องรีบเปิด ข้ามไปก่อนได้

---

## เมื่อมีปัญหา

```bash
docker compose logs -f api            # API
docker compose logs -f worker-intel   # งานเบื้องหลังทั้งหมด
curl http://localhost:8000/api/v1/admin/health

# env var ไม่โหลด (get_settings() มี lru_cache)
docker compose up -d --force-recreate api worker-intel
```

**สัญญาณไม่เข้ามาเลย** → ดูที่ Horizon ก่อน DESK เป็นฝ่ายรับอย่างเดียว
**กล่องสัญญาณมีแต่ของไม่เกี่ยว** → ยังไม่ได้ตั้งประเด็นที่ติดตาม
**แผนที่ว่าง** → สัญญาณที่ส่งมาก่อนเพิ่ม `location` เข้าสัญญาไม่มีพิกัด ของใหม่มี

เอกสารเพิ่มเติม: `README.md` (ภาพรวมและ workflow) · `CLAUDE.md` (สำหรับ developer)
· `docs/roadmap.md` (สถานะฟีเจอร์)
