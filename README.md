# OSINT//DESK

แพลตฟอร์มข่าวกรองสำหรับห้องข่าว — คัดกรองข่าวอัตโนมัติ สืบสวนเชิงลึก ตรวจสอบ Media จำลองสถานการณ์ และเฝ้าระวัง dark web บนเซิร์ฟเวอร์ของคุณเอง ใช้ AI ที่รันในเครื่อง ข้อมูลไม่รั่วออกนอกองค์กร

```
ระบบทำงาน 24/7 เบื้องหลัง → นักข่าวมาเปิดเช้า → เห็นทันทีว่ามีอะไรสำคัญ
```

---

## สารบัญ

1. [วิธีติดตั้ง](#1-วิธีติดตั้ง)
2. [ภาพรวมระบบ](#2-ภาพรวมระบบ)
3. [Workflow หลัก — วงจรข่าวกรอง](#3-workflow-หลัก--วงจรข่าวกรอง)
4. [Step 0 · Admin ตั้งระบบ](#step-0--admin-ตั้งระบบ)
5. [Step 1 · คัดกรองข่าว (Today's Intel)](#step-1--คัดกรองข่าว-todays-intel)
6. [Step 2 · สืบสวนเชิงลึก (Investigation)](#step-2--สืบสวนเชิงลึก-investigation)
7. [Step 3 · ตรวจสอบ Media (Verify)](#step-3--ตรวจสอบ Media-verify)
8. [Step 4 · เขียนรายงาน (Brief)](#step-4--เขียนรายงาน-brief)
9. [Step 5 · จำลองสถานการณ์ (Simulation)](#step-5--จำลองสถานการณ์-simulation)
10. [Step 6 · Dark Web Intelligence](#step-6--dark-web-intelligence)
11. [Intelligence Features](#intelligence-features)
12. [บทบาทผู้ใช้และสิทธิ์](#บทบาทผู้ใช้และสิทธิ์)
13. [Services ที่ใช้งาน](#services-ที่ใช้งาน)
14. [สำหรับ Developer](#สำหรับ-developer)

---

## 1. วิธีติดตั้ง

### สิ่งที่ต้องมีก่อน

| สิ่งที่ต้องการ | ขั้นต่ำ | หมายเหตุ |
|---|---|---|
| Docker + Docker Compose plugin | 24+ / 2.20+ | `docker compose version` |
| RAM | 16 GB | 32 GB แนะนำถ้ารัน AI model ใหญ่ |
| Storage | 50 GB | สำหรับ DB + media + model weights |
| Ollama | latest | รันก่อน ต้อง pull model แล้ว |

```bash
# ตรวจสอบ Ollama พร้อมใช้
curl http://localhost:11434/api/tags

# ถ้ายังไม่ได้ pull model
ollama pull gemma4:12b        # โมเดลหลัก — brief, vision, simulation, requirements, deception, darkweb (ต้องมี)
ollama pull gemma4:e4b        # triage queue — เร็วกว่า ใช้ VRAM น้อยกว่า (~3 GB)
ollama pull whisper           # ถอดเสียง audio/video (deploy.sh pull ให้อัตโนมัติ)
```

> **หมายเหตุ GPU:** `gemma4:12b` (~8.4 GB) และ `gemma4:e4b` (~3 GB) โหลดพร้อมกันได้บน GPU ≥ 12 GB VRAM
> ปรับ model ต่อ module ได้ที่ Admin → Settings → AI หรือแก้ `.env`

### ติดตั้งและรัน

```bash
# Clone repo
git clone <repo-url> osintdesk && cd osintdesk

# รัน deploy script (interactive — ถามรหัสผ่านและ Ollama URL)
./deploy.sh
```

script จะ: ตรวจ prerequisites → ตั้งค่า .env → build images → ขึ้น services → migrate DB → seed admin → pull Whisper model → ตรวจสอบ integration

เปิดเบราว์เซอร์:
- **UI** → `http://localhost` (ผ่าน nginx port 80)
- **API Docs** → `http://localhost:8000/docs`

**Login:** ใช้ email + password ที่กรอกตอนรัน `./deploy.sh` (default: `admin@osintdesk.local` / `changeme`)

> **สำคัญ:** เปลี่ยน password ทันทีหลัง login ครั้งแรกที่ Admin → Settings → Users

#### Commands

```bash
./deploy.sh --update    # git pull + rebuild + migrate (zero-downtime)
./deploy.sh --restart   # restart api + worker + worker-intel (เร็วกว่า rebuild)
./deploy.sh --ssl       # ตั้งค่า SSL ด้วย Let's Encrypt
./deploy.sh --logs      # ดู live logs (api + worker + worker-intel + beat)
./deploy.sh --status    # ดูสถานะ containers
./deploy.sh --down      # หยุดทุก service
```

#### SSL (optional)

```bash
./deploy.sh --ssl       # interactive — ถาม domain + email แล้ว certbot จัดการให้
```

#### Development

```bash
docker compose -f docker-compose.dev.yml up -d   # hot reload, source mounts
```

---

## 2. ภาพรวมระบบ

OSINT//DESK แบ่งการทำงานเป็น **2 ชั้น** ที่ทำงานพร้อมกัน:

```
┌─────────────────────────────────────────────────────────────┐
│  ชั้นอัตโนมัติ (ทำงานเบื้องหลัง 24/7)                       │
│                                                             │
│  RSS / Webhook / API → คัดกรอง AI → ให้คะแนน → แจ้งเตือน  │
│  Celery Beat ดึงข้อมูลทุก 60 วินาที                         │
└─────────────────────────────────────────────────────────────┘
                           ↓ ป้อนข้อมูลให้
┌─────────────────────────────────────────────────────────────┐
│  ชั้นผู้ใช้ (นักข่าว / นักวิเคราะห์ทำงาน)                  │
│                                                             │
│  Today's Intel → Investigation → Verify → Brief            │
└─────────────────────────────────────────────────────────────┘
```

### การไหลของข้อมูล

```
แหล่งข่าว (RSS / Webhook / Dark Web)
    │
    ▼
Adapter ดึงข้อมูล + แปลงเป็น CanonicalFeedItem
    │
    ├─── [Reliability] Admiralty Code A-F / 1-6 แปะทุก item ทันที
    │
    ▼
Redis Queue
    │
    ▼
Celery Worker
    │
    ▼
LLM ให้คะแนน 7 เกณฑ์ + จัด Verdict (PRIORITY / FAST_TRACK / INVESTIGATE / PASS)
    │
    ├─── [Requirements] auto-match กับ PIR ที่เปิดอยู่
    │
    ▼
PostgreSQL (feed_items)
    │
    ▼
API → Frontend (Today's Intel)
```

---

## 3. Workflow หลัก — วงจรข่าวกรอง

OSINT//DESK ออกแบบตามมาตรฐาน **Intelligence Cycle** ที่หน่วยงานข่าวกรองใช้:

```
    ┌──────────────────────────────────────────────────────┐
    │                                                      │
    ▼                                                      │
[1] COLLECTION        ← ระบบดึงข้อมูลอัตโนมัติ            │
    ↓                                                      │
[2] PROCESSING        ← AI คัดกรอง + ให้คะแนน             │
    ↓                                                      │
[3] ANALYSIS          ← นักวิเคราะห์สืบสวน                │
    ↓                                                      │
[4] PRODUCTION        ← เขียน Brief + อนุมัติ             │
    ↓                                                      │
[5] DISSEMINATION     ← เผยแพร่ (internal / public)      │
    ↓                                                      │
[6] FEEDBACK          ← ปรับ PIR + เรียนรู้จากผล          │
    └──────────────────────────────────────────────────────┘
```

แต่ละขั้นในแพลตฟอร์มนี้:

| ขั้น | Module | ผู้ดำเนินการ |
|---|---|---|
| Collection | Admin → Sources | Admin ตั้งค่าครั้งเดียว ระบบทำต่อเอง |
| Processing | Today's Intel | ระบบอัตโนมัติ |
| Analysis | Investigation | Analyst |
| Verification | Verify | Analyst |
| Production | Brief | Analyst เขียน + Editor อนุมัติ |
| Dissemination | Export PDF / Public Brief | Editor |
| Feedback | Intelligence → PIR, Knowledge | Analyst |

---

## Step 0 · Admin ตั้งระบบ

ก่อนนักข่าวจะใช้งานได้ Admin ต้องตั้งค่าผ่าน **Admin → Settings**

### ตั้งแหล่งข้อมูล (Sources)

ระบบรองรับแหล่งข้อมูลหลายประเภท:

| ประเภท | ตัวอย่าง | Adapter |
|---|---|---|
| RSS Feed | สำนักข่าว, บล็อก, ประกาศราชการ | `rss` |
| Webhook | ระบบแจ้งเตือนภายใน, Zapier | `webhook` |
| API | Twitter/X, Telegram public channels | `api` |
| Dark Web | .onion sites (ต้องมี legal approval) | `darkweb` |

```
Admin → Settings → แท็บ Sources → [+ เพิ่มแหล่งข่าว]
กำหนด: URL, ประเภท, ความน่าเชื่อถือ (A–F), ช่วงเวลาดึงข้อมูล
```

### ตั้งค่า AI Model

```
Admin → Settings → แท็บ AI
- Ollama URL:          http://host.docker.internal:11434
- Default Model:       gemma4:12b
- Triage Model:        gemma4:e4b  (fast — triage queue เท่านั้น)
- Brief Model:         gemma4:12b
- Vision Model:        gemma4:12b  (keyframe analysis, verify)
- Simulation Model:    gemma4:12b
- Requirements Model:  gemma4:12b  (PIR / EEI matching)
- Deception Model:     gemma4:12b  (cui bono, bot detection)
- Dark Web Model:      gemma4:12b  (classify .onion content)
```

ทุก module รับค่าจาก UI ก่อน ถ้าไม่ได้ตั้งใน UI จะ fallback ไปที่ `.env` — ไม่ต้อง restart container เมื่อเปลี่ยน model ใน Admin UI

### ปรับเกณฑ์คัดกรอง

```
Admin → Settings → แท็บ Triage Weights
ปรับน้ำหนักแต่ละเกณฑ์ (1–5) ให้ตรงกับแนวทางบรรณาธิการ:

Freshness       — ความใหม่ของข่าว
Reliability     — ความน่าเชื่อถือของแหล่ง
Topic Relevance — ความเกี่ยวข้องกับประเด็นห้องข่าว
Impact          — ผลกระทบต่อสังคม/การเมือง/เศรษฐกิจ
Urgency         — ความเร่งด่วน
Novelty         — ข้อมูลใหม่ ไม่ซ้ำกับที่เคยรู้
Actionability   — มีอะไรให้ทำทันทีหรือไม่
```

### สร้าง PIR (Priority Intelligence Requirements)

```
Intelligence → PIR → [+ สร้าง PIR ใหม่]
ตัวอย่าง: "ติดตามการเคลื่อนไหวของบริษัท X ในการประมูลโครงการรัฐปี 2568"
```

ระบบจะ **auto-match** ข้อมูลที่เข้ามาทุกชิ้นกับ PIR ที่เปิดอยู่โดยอัตโนมัติ

---

## Step 1 · คัดกรองข่าว (Today's Intel)

**ผู้ใช้:** นักข่าว / บรรณาธิการ  
**เวลา:** เปิดมาเช้า และตรวจซ้ำระหว่างวัน

### สิ่งที่เห็นหน้า Today's Intel

```
┌──────────────────────────────────────────────────────┐
│ STATUS BAR                                            │
│ PRIORITY: 12  │  FAST TRACK: 5  │  NEW TODAY: 47    │
└──────────────────────────────────────────────────────┘

เรียงตาม Verdict:
🔴 PRIORITY   — ต้องดูทันที
⚡ FAST TRACK — impact สูง + น่าเชื่อถือ เตรียมรายงาน
🔵 INVESTIGATE — น่าสนใจ ควรติดตาม
⚪ PASS        — ผ่านไป ไม่ต้องเสียเวลา
```

### Verdict ทั้ง 4 ระดับ

| Verdict | เงื่อนไข AI | การดำเนินการ |
|---|---|---|
| **PRIORITY** | Score ≥ 7.5 หรือ Urgency ≥ 9 | เปิดดูทันที + พิจารณาเปิด Case |
| **FAST TRACK** | Impact ≥ 8 และ Reliability ≥ 7 | ตรวจสอบ + เตรียม Brief |
| **INVESTIGATE** | Score ≥ 5.5 | บันทึกไว้ ติดตามต่อ |
| **PASS** | อื่นๆ | ไม่ต้องใช้เวลา |

### สิ่งที่ทำได้กับข่าวแต่ละชิ้น

```
คลิก item ใดก็ได้ →
  [เปิด Case]     → ส่งไป Investigation พร้อมข้อมูลทั้งหมด
  [Mark Read]     → อ่านแล้ว รับทราบ ยังไม่ดำเนินการ
  [Archive]       → เก็บเข้า archive ออกจาก queue หลัก
  [ดูคะแนน]       → เห็น 7 scores + Admiralty code + entities ที่ AI สกัด
```

### Autopilot — ระบบอัตโนมัติเต็มรูปแบบ

เปิดใช้ที่ **Admin → Settings → Autopilot** แล้วเลือก steps ที่ต้องการ:

| Step | ชื่อ | สิ่งที่เกิดขึ้น |
|---|---|---|
| ① | **auto_triage** | LLM ให้คะแนน 7 เกณฑ์ + Verdict ทุก item ที่เข้ามา (เปิดอยู่เสมอ) |
| ② | **auto_verify** | ถ้า item มีรูป/คลิปมา → download + ส่ง verify pipeline อัตโนมัติ |
| ③ | **auto_investigate** | item ที่ได้ PRIORITY / INVESTIGATE / FAST_TRACK → สร้าง Investigation Case อัตโนมัติ |
| ④ | **auto_scan** | สกัด domain จาก URL ของ item → ส่ง SpiderFoot สแกน OSINT |
| ⑤ | **match_pir** | ข้อมูลทุก item ที่เข้า intel queue → match กับ PIR ที่เปิดอยู่ |

**Data flow เมื่อ Autopilot เปิดครบ:**

```
RSS / Webhook → ingest → LLM triage scoring
                              │
                    ┌─────────┼─────────┐
                    │         │         │
              [PRIORITY]  [FAST_TRACK]  [INVESTIGATE]
                    │
                    ├── สร้าง Investigation Case (auto_investigate)
                    │
                    ├── SpiderFoot สแกน domain จาก URL (auto_scan)
                    │       ↓
                    │   Neo4j Graph + PIR match
                    │
                    └── Verify รูป/คลิปที่มากับข่าว (auto_verify)
                                ↓
                            Verify Job → transcript + keyframes + EXIF
```

> **หมายเหตุ SpiderFoot:** รับเฉพาะ domain / IP / email — ระบบจะสกัด domain จาก URL ของบทความ ไม่ใช้ชื่อ entity ที่เป็นข้อความ

### Admiralty Code — อ่านความน่าเชื่อถือ

ทุก item มี 2 ตัวอักษร เช่น **B2** หรือ **C3**:

```
ตัวอักษร — ความน่าเชื่อถือของแหล่ง:    ตัวเลข — ความน่าเชื่อถือของข้อมูล:
A = เชื่อถือได้สูงสุด                   1 = ยืนยันแล้วจากแหล่งอื่น
B = เชื่อถือได้                         2 = น่าจะจริง
C = ค่อนข้างเชื่อถือได้                  3 = อาจจะจริง
D = ไม่ค่อยเชื่อถือได้                   4 = ไม่แน่นอน
E = ไม่น่าเชื่อถือ                       5 = ไม่น่าจะจริง
F = ไม่สามารถประเมินได้                  6 = ยืนยันว่าเท็จ
```

ค่านี้จะ **ปรับอัตโนมัติ** เมื่อมีหลักฐานยืนยันหรือหักล้างในภายหลัง

---

## Step 2 · สืบสวนเชิงลึก (Investigation)

**ผู้ใช้:** นักวิเคราะห์ / นักข่าวสายสืบสวน  
**เปิดใช้เมื่อ:** มี item PRIORITY หรือ FAST TRACK ที่ต้องการสืบสวนเพิ่ม

### เปิด Case

```
Today's Intel → คลิก item → [เปิด Case]
หรือ
Investigation → [+ New Case] → กรอกชื่อ case
```

### 4 พื้นที่ทำงานใน Case

---

#### ① Network Graph — แผนที่ความสัมพันธ์

SpiderFoot สแกนอัตโนมัติทันทีที่เปิด case โดยดูจาก entity ที่ AI สกัดมา:

```
สแกน: บุคคล, องค์กร, โดเมน, IP, อีเมล, เบอร์โทร
เส้นเชื่อม: director of / registered by / linked to / mentioned with

การใช้งาน:
- ซูม / เลื่อน / จัดวาง node ตามต้องการ
- คลิก node → เห็น raw data จาก SpiderFoot
- ดับเบิลคลิก node → เพิ่มเป็น evidence ใน board
```

ข้อมูลกราฟเก็บใน Neo4j ทำให้ค้นหาความเชื่อมโยงซับซ้อนได้เร็ว

---

#### ② Evidence Board — กระดานหลักฐาน

```
3 คอลัมน์ (Kanban):
┌──────────────┬───────────────┬──────────────────┐
│  VERIFIED    │   PARTIAL     │   UNVERIFIED     │
│ (ยืนยันแล้ว) │ (บางส่วน)     │ (ยังไม่ยืนยัน)   │
└──────────────┴───────────────┴──────────────────┘

แต่ละ card มี: หัวข้อ + เนื้อหา + แหล่งอ้างอิง + ผู้เพิ่ม + วันที่
ลาก-วางระหว่างคอลัมน์ได้เมื่อสถานะเปลี่ยน
```

สิ่งที่เพิ่มเป็น evidence ได้:
- ข้อความ + URL
- ภาพ / วิดีโอ (ผ่าน Verify ก่อน)
- ผลจาก SpiderFoot (ดับเบิลคลิก node บน graph)
- ผลจาก Perplexica (Research Panel)

---

#### ③ Timeline — เส้นเวลาเหตุการณ์

```
เรียงเหตุการณ์ตามลำดับเวลา:
- เพิ่ม event ด้วยตนเอง หรือ auto-extract จาก evidence
- ซูมดูช่วงเวลาสำคัญ
- Export เป็น CSV
```

---

#### ④ Research Panel — ถาม Perplexica

```
พิมพ์คำถาม เช่น:
"บริษัท X เคยมีคดีความอะไรบ้างในช่วง 5 ปีที่ผ่านมา"
"ใครเป็นผู้ถือหุ้นของ Y และมีความเชื่อมโยงกับภาครัฐอย่างไร"

Perplexica ค้นหาจากเว็บ + สังเคราะห์คำตอบพร้อมแหล่งอ้างอิง
ผลลัพธ์ link ไปยัง source โดยตรง — ตรวจสอบได้ทันที
```

---

### Confidence Level — ระดับความมั่นใจ

เมื่อเพิ่มหลักฐานหรือเขียน assessment ให้ระบุเสมอ:

| ระดับ | ความหมาย |
|---|---|
| **HIGH** | มีหลักฐานโดยตรง ยืนยันได้หลายแหล่งอิสระ |
| **MEDIUM** | สรุปจากหลักฐานทางอ้อม หรือยืนยันได้บางส่วน |
| **LOW** | สมมติฐาน / เบาะแส ยังต้องสืบสวนเพิ่ม |

> **กฎ:** ห้ามสรุปใน Brief โดยไม่ระบุ Confidence Level

---

### Collaboration — ทำงานร่วมหลาย Analyst

```
- เห็น presence แบบ real-time (ใครกำลังดู case นี้)
- comment ใต้แต่ละ evidence
- ส่ง case ต่อ (handoff) พร้อม note อธิบายสถานะ
- บันทึก dissent — ถ้า analyst เห็นต่าง บันทึกไว้แยก ไม่ลบ ไม่เขียนทับ
```

---

## Step 3 · ตรวจสอบ Media (Verify)

**ผู้ใช้:** นักข่าว / นักวิเคราะห์  
**ใช้เมื่อ:** ได้รับภาพ/วิดีโอจากแหล่งภายนอก **ก่อนใช้งานทุกครั้ง**

### วิธีใช้

```
Verify → ลากไฟล์หรือวาง URL → [ตรวจสอบ]
รอผล ~30 วินาที–3 นาที ขึ้นอยู่กับขนาดไฟล์
```

### สิ่งที่ระบบตรวจ

| การตรวจสอบ | เครื่องมือ | ข้อมูลที่ได้ |
|---|---|---|
| **Metadata / EXIF** | ExifTool | GPS, กล้อง, วันที่ถ่าย, ซอฟต์แวร์ตัดต่อ |
| **Reverse Image Search** | SearXNG | เคยปรากฏที่ไหน เมื่อไหร่ |
| **Wayback Machine** | Wayback API | URL นี้ถูก archive ไว้ตั้งแต่เมื่อไหร่ |
| **Transcript** | Whisper (Ollama) | ถอดเสียง audio/video รองรับหลายภาษา |
| **Keyframe Analysis** | Vision LLM (gemma3) | อธิบายสิ่งที่เห็นในแต่ละ scene ตรวจหาสัญญาณ deepfake |

**การตรวจ video ทำงานอัตโนมัติ** — อัพโหลดคลิป ระบบจะ: แยก audio → ถอดเสียง → สกัด keyframes → วิเคราะห์ภาพ → รวมผลกับ metadata ให้ verdict เดียว

### อ่านผลลัพธ์

```
┌──────────────────────────────────────────────┐
│  STATUS: ⚠️  SUSPICIOUS                      │
│                                              │
│  📍 GPS:  ไม่ตรงกับที่อ้างว่าถ่าย           │
│  📅 Date: metadata vs claim ต่างกัน 3 ปี    │
│  🔍 Reverse: พบภาพนี้ถูกใช้ครั้งแรกในปี 2019│
│  🤖 Vision: ตรวจพบสัญญาณ AI-generated       │
│                                              │
│  [เพิ่มเข้า Evidence]    [Archive]          │
└──────────────────────────────────────────────┘
```

**Verdict ของ Verify:**

| Verdict | ความหมาย | การดำเนินการ |
|---|---|---|
| `VERIFIED` | ข้อมูล consistent ไม่มีสัญญาณน่าสงสัย | ใช้งานได้ เพิ่มเป็น evidence |
| `SUSPICIOUS` | มีสัญญาณผิดปกติอย่างน้อย 1 จุด | ต้องตรวจสอบเพิ่มก่อนใช้ |
| `FAKE` | หลักฐานชัดว่าปลอม/ตัดต่อ/เอามาจากที่อื่น | ห้ามใช้ archive พร้อม note |

---

## Step 4 · เขียนรายงาน (Brief)

**ผู้ใช้:** Analyst (เขียน) + Editor (อนุมัติ)

### สร้าง Brief

```
Investigation → case → [สร้าง Brief]    ← ระบบ AI draft จาก evidence อัตโนมัติ
หรือ
Brief → [+ New Brief] → เลือก case → [AI Draft]
```

### โครงสร้าง Brief

```
┌──────────────────────────────────────────────────────┐
│  SUMMARY                                              │
│  สรุปประเด็นหลักใน 2–3 ประโยค                        │
├──────────────────────────────────────────────────────┤
│  FINDINGS — VERIFIED                                  │
│  ✓ สิ่งที่ยืนยันแล้ว พร้อมแหล่งอ้างอิงทุกข้อ       │
├──────────────────────────────────────────────────────┤
│  UNVERIFIED — DO NOT PUBLISH                          │
│  ⚠ สิ่งที่ยังไม่ยืนยัน สำหรับทีมงานภายในเท่านั้น   │
├──────────────────────────────────────────────────────┤
│  MISSING LINKS                                        │
│  ? สิ่งที่ต้องหาข้อมูลเพิ่มก่อนสรุป                 │
├──────────────────────────────────────────────────────┤
│  METHODOLOGY                                          │
│  วิธีการตรวจสอบ เพื่อความโปร่งใส                     │
└──────────────────────────────────────────────────────┘
```

### สองโหมด: Internal ↔ Public

```
Toggle [INTERNAL ↔ PUBLIC]

INTERNAL:  เห็นทุก section รวม UNVERIFIED
           ใช้ในทีมงานเพื่อการตัดสินใจ

PUBLIC:    เห็นเฉพาะ VERIFIED + METHODOLOGY
           ส่งออกเพื่อเผยแพร่ได้ทันที
```

### Approval Workflow

```
Analyst เขียน → [ส่ง Review]
    ↓
Editor รับ notification → [Approve] หรือ [Reject + comment]
    ↓
ถ้า Approve → Export พร้อมใช้งาน
```

### Export

```
[Export PDF]  → PDF พร้อม watermark INTERNAL / PUBLIC
[Export GEXF] → network graph สำหรับเปิดใน Gephi
[Export CSV]  → timeline/evidence สำหรับ spreadsheet
```

---

## Step 5 · จำลองสถานการณ์ (Simulation)

**ผู้ใช้:** Analyst อาวุโส / Editor  
**ใช้เมื่อ:** ต้องการวิเคราะห์ว่าเหตุการณ์จะพัฒนาไปทิศทางใด

### เปิด Simulation

```
Simulation → [+ New] → เลือก case หรือพิมพ์สถานการณ์
กำหนด: Horizon (7 / 14 / 30 วัน), ผู้มีส่วนได้เสีย
```

### 3 สถานการณ์ที่ได้

```
┌───────────────┬───────────────┬───────────────┐
│  BEST CASE    │  BASE CASE    │  WORST CASE   │
│  (ดีที่สุด)   │ (น่าจะเกิด)   │  (แย่ที่สุด)  │
│               │               │               │
│ ความน่าจะเป็น │ ความน่าจะเป็น │ ความน่าจะเป็น │
│ key factors   │ key factors   │ key factors   │
│ early signals │ early signals │ early signals │
└───────────────┴───────────────┴───────────────┘
```

**Early Warning Signals** — สิ่งที่ต้องจับตาเพื่อรู้ว่ากำลังไปทิศทางใด ใช้เป็น checklist สำหรับทีมข่าว

### Agent Grid — ผู้มีส่วนได้เสีย

ระบบสร้าง "agents" จำลองพฤติกรรมของ stakeholders:

```
ตัวอย่าง case การประมูลโครงการ:
- รัฐบาล / หน่วยงานที่รับผิดชอบ
- บริษัทที่ประมูล
- ฝ่ายค้าน
- สื่อมวลชน
- ประชาชน / กลุ่มผลประโยชน์

แต่ละ agent มี: motivation, likely action, constraint
ระบบคำนวณ interaction และผลลัพธ์รวม
```

---

## Step 6 · Dark Web Intelligence

**ผู้ใช้:** ทีม cybersecurity / investigative journalism เท่านั้น  
**ข้อกำหนด:** ต้องมี legal approval ก่อนทุกครั้ง

> ⚠️ **คำเตือน:** การใช้งาน dark web module ต้องได้รับอนุมัติจากฝ่ายกฎหมายขององค์กรก่อน ทุก query บันทึกใน audit log ตลอด

### Workflow

```
1. กรอก "วัตถุประสงค์บรรณาธิการ" — บังคับก่อนค้นหาทุกครั้ง
2. พิมพ์ keyword หรือ .onion URL
3. ระบบส่งผ่าน Tor proxy → Crawler → Content Filter
4. Content Filter ตรวจก่อนแสดงผล:
   - ผ่าน → แสดงผล (ผ่าน LLM classify ก่อน)
   - ไม่ผ่าน → quarantine (ไม่แสดง ไม่เก็บ บันทึกเฉพาะ log)
5. ผลที่ผ่านเข้า Legal Review Queue → ทีม legal อนุมัติก่อนใช้
```

### กฎที่ห้ามละเมิด

- `blocklist.txt` แก้ผ่าน Admin UI เท่านั้น ห้ามแก้ไฟล์โดยตรง
- ทุก query มี audit trail — ลบไม่ได้
- ต้องระบุวัตถุประสงค์ก่อนค้นหาทุกครั้ง

---

## Intelligence Features

ฟีเจอร์เหล่านี้ทำงานข้ามทุก module เป็น layer กลางของระบบ

### PIR — Priority Intelligence Requirements

PIR คือ "คำถามที่ต้องการคำตอบ" ของห้องข่าว:

```
Intelligence → PIR → [+ สร้าง PIR]
ตัวอย่าง: "ใครเป็นผู้รับสัมปทานรายใหม่ในโครงการพลังงานปี 2568?"
```

ระบบ auto-match ข้อมูลทุกชิ้นที่เข้ามาตรง PIR → แจ้งเตือนอัตโนมัติ → progress bar PIR เพิ่มขึ้น

**EEI (Essential Elements of Information)** — รายละเอียดย่อยที่ต้องรู้ใต้แต่ละ PIR

---

### Reliability — Admiralty Scoring อัตโนมัติ

ระบบคำนวณ Admiralty Code ณ เวลา ingestion จาก:
- ประวัติความแม่นยำของแหล่งข่าว (ติดตามสะสมอัตโนมัติ)
- Source weight ที่ Admin กำหนด
- ประเภทและลักษณะของข้อมูล

Score ปรับอัตโนมัติเมื่อมีหลักฐานยืนยันหรือหักล้างในภายหลัง

---

### Deception Detection — ตรวจสอบการบิดเบือน

```
Intelligence → Deception Check → วาง URL หรือเนื้อหา
```

LLM วิเคราะห์:

| ด้านที่ตรวจ | คำถามที่ระบบตอบ |
|---|---|
| **Cui Bono** | ใครได้ประโยชน์ถ้าข่าวนี้แพร่ออกไป? |
| **Timing Analysis** | เวลาเผยแพร่ผิดปกติไหม? ตรงกับเหตุการณ์ใด? |
| **Bot Indicators** | มีสัญญาณ bot network หรือ coordinated inauthentic behavior? |
| **Source Motivation** | แรงจูงใจที่ซ่อนอยู่ของผู้เผยแพร่คืออะไร? |

ผลลัพธ์: Risk Level (LOW / MEDIUM / HIGH) + เหตุผล

---

### Knowledge — ความรู้สะสมข้ามเคส

```
Intelligence → Knowledge
```

ระบบติดตาม entity ข้ามทุก case:
- บุคคล X ปรากฏในกี่ case? มีรูปแบบอะไรที่น่าสังเกต?
- ข้อมูลที่ยืนยันแน่ๆ vs สิ่งที่ยังสงสัย
- เชื่อมโยง case ใหม่กับ institutional memory ที่มีอยู่

ป้องกันการสูญเสียความรู้เมื่อนักข่าวลาออกหรือเปลี่ยนทีม

---

### ACH — Analysis of Competing Hypotheses

```
Investigation → Case → [ACH]
```

Matrix เปรียบเทียบสมมติฐานหลายข้ออย่างเป็นระบบ ตามมาตรฐาน CIA:

```
              │ Hypothesis A │ Hypothesis B │ Hypothesis C
──────────────┼──────────────┼──────────────┼─────────────
Evidence 1    │      C       │      I       │      I
Evidence 2    │      I       │      C       │      C
Evidence 3    │      I       │      I       │      C

C = Consistent (สนับสนุน) / I = Inconsistent (ขัดแย้ง)
```

สมมติฐานที่มี I มากที่สุดคือสิ่งที่ควรตัดออกก่อน

---

## บทบาทผู้ใช้และสิทธิ์

| สิทธิ์ | Admin | Editor | Analyst | Viewer |
|---|:---:|:---:|:---:|:---:|
| ตั้งค่าระบบ / Sources | ✓ | — | — | — |
| จัดการ Users | ✓ | — | — | — |
| อ่าน Today's Intel | ✓ | ✓ | ✓ | ✓ |
| เปิด / แก้ Investigation | ✓ | ✓ | ✓ | อ่าน |
| Verify สื่อ | ✓ | ✓ | ✓ | — |
| เขียน Brief | ✓ | ✓ | ✓ | — |
| Approve / Reject Brief | ✓ | ✓ | — | — |
| Export Brief | ✓ | ✓ | — | — |
| Dark Web (ต้อง legal) | ✓ | — | ✓ | — |
| Deception Check | ✓ | ✓ | ✓ | — |
| จัดการ PIR | ✓ | ✓ | ✓ | อ่าน |
| ดู Knowledge / ACH | ✓ | ✓ | ✓ | ✓ |
| ดู Audit Log | ✓ | — | — | — |

---

## Services ที่ใช้งาน

| Service | Port | หน้าที่ |
|---|---|---|
| **nginx** | **80 / 443** | **Reverse proxy — entry point หลัก** |
| Frontend | — (ผ่าน nginx) | UI หลัก |
| API | 8000 | Backend (FastAPI) — `/docs` สำหรับ Swagger |
| PostgreSQL | — (internal) | ฐานข้อมูลหลัก |
| Redis | — (internal) | Queue + Cache |
| Neo4j | 7474 / 7687 | Graph database (ความสัมพันธ์ entity) |
| Meilisearch | — (internal) | Full-text search ของ feed items |
| MinIO | 9001 | Object storage console (API internal) |
| Ollama | 11434 | LLM inference (รันบน host ไม่อยู่ใน compose) |
| SearXNG | — (internal) | Meta search engine (research panel) |
| Perplexica | **3002** | AI research assistant (Vane image) |
| SpiderFoot | 5001 | OSINT scanner |
| MiroFish backend | 5002 | Simulation API |
| MiroFish UI | 5003 | Simulation frontend |
| n8n | 5678 | Workflow automation |
| Tor proxy | 9050 | SOCKS5 สำหรับ dark web (isolated network) |

### ตรวจสุขภาพระบบ

```
Admin → Settings → แท็บ Health    (real-time ping ทุก service)
หรือ
http://localhost:8000/docs         (API Swagger — ทดสอบ endpoint โดยตรง)
```

---

## สำหรับ Developer

### Commands พื้นฐาน

```bash
# Dev stack (hot reload, source mounts)
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml logs -f api worker worker-intel beat
docker compose -f docker-compose.dev.yml ps

# Production
./deploy.sh --status    # สถานะ containers
./deploy.sh --logs      # live logs (api + worker + worker-intel + beat)
./deploy.sh --update    # git pull + rebuild + migrate

# Makefile shortcuts (dev)
make up             # docker-compose.dev.yml up -d
make test           # full test suite
make test-unit      # unit tests (ไม่ต้องการ DB)
make lint           # ruff + mypy + eslint
make migrate        # alembic upgrade head (dev)
make migrate-create msg="add_new_column"
make seed-dev       # seed development data

# Makefile shortcuts (prod)
make install        # ./deploy.sh (first-time)
make update         # ./deploy.sh --update
make prod-migrate   # alembic upgrade head (production container)
make prod-logs      # docker compose logs -f api worker worker-intel beat

# Worker queues
# osint-worker      → triage queue  (8 workers, gemma4:e4b) — feed ingestion, scoring
# osint-worker-intel → intel queue  (4 workers, gemma4:12b) — SpiderFoot scans, PIR matching
# ถ้า env var ไม่โหลด (get_settings() มี lru_cache) → force recreate:
docker compose up -d --force-recreate api worker worker-intel
```

### เพิ่ม Ingestion Source ใหม่

```
1. services/api/adapters/{name}.py       — extend BaseAdapter
   implement: connect(), fetch(), transform() → คืน CanonicalFeedItem
2. services/api/adapters/registry.py     — ลงทะเบียน adapter
3. services/api/core/config.py           — เพิ่ม config fields
4. frontend/app/admin/settings/adapters/ — UI สำหรับตั้งค่า
5. services/api/adapters/tests/test_{name}.py — เขียน tests
```

### เอกสารอ้างอิง

| เอกสาร | ที่อยู่ |
|---|---|
| Coding standards + architecture | `CLAUDE.md` |
| Build roadmap (phase ต่อ phase) | `docs/roadmap.md` |
| Spec รายละเอียดแต่ละ module | `docs/specs/` |
| UI mockup (HTML คลิกได้) | `docs/mockups/` |
| API reference (Swagger) | `http://localhost:8000/docs` |

### โครงสร้าง Repo

```
services/
├── api/                  # FastAPI — business logic ทั้งหมดอยู่ที่นี่
│   ├── adapters/         # ingestion adapters (หนึ่งไฟล์ต่อแหล่งข้อมูล)
│   ├── modules/          # feature modules (triage, investigation, brief, ...)
│   ├── core/             # shared: auth, config, db, cache, queue, llm
│   └── workers/          # Celery tasks
├── frontend/             # Next.js 14 App Router
│   ├── app/              # pages
│   ├── components/       # UI components
│   └── lib/              # API client, hooks, stores, types
├── darkweb/              # isolated crawler (separate Docker network)
└── infra/                # docker-compose, nginx, monitoring
```

### สิ่งที่ห้ามแตะ

```
services/darkweb/filter/blocklist.txt  — แก้ผ่าน Admin UI เท่านั้น
alembic/versions/                      — ห้ามแก้ migration ที่มีอยู่ สร้างใหม่เสมอ
services/api/core/audit.py             — append-only audit log ห้ามมี delete methods
.env.production                        — จัดการโดย deployment pipeline เท่านั้น
```

---

## License

Open source — ดูรายละเอียดใน [LICENSE](LICENSE)
