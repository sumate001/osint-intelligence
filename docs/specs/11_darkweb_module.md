# OSINT//DESK — Dark Web Intelligence Module
## สถาปัตยกรรมและแนวทางการ implement

เวอร์ชัน 1.0 · มิถุนายน 2568

> ⚠ **ข้อกำหนดก่อนใช้งาน:** module นี้ต้องได้รับการอนุมัติจากฝ่ายกฎหมายขององค์กร
> และต้องมี editorial policy เป็นลายลักษณ์อักษรก่อน deploy บน production server

---

## 1. ภาพรวม

Dark Web Intelligence Module เพิ่มความสามารถให้ OSINT//DESK เข้าถึงแหล่งข้อมูลที่ไม่สามารถ index ผ่าน search engine ปกติ ครอบคลุมการ monitor hidden services ที่เกี่ยวข้องกับประเด็นที่สืบสวน เช่น การรั่วไหลของข้อมูล การค้าข้อมูลส่วนตัว หรือกิจกรรมที่เชื่อมโยงกับเรื่องที่อยู่ในการสืบสวน

module นี้ออกแบบให้ทำงานแบบ isolated อย่างสมบูรณ์ — ใช้ container แยก, network แยก, และมี content filter หลายชั้นก่อนที่ข้อมูลใดจะเข้าสู่ OSINT//DESK pipeline หลัก

---

## 2. สถาปัตยกรรม

```
[Seed List / Query]
        ↓
[Tor Proxy Container]  ←→  Tor Network → .onion services
        ↓
[TorBot / VigilantOnion crawler]
        ↓
[Content Filter Layer]  ← classifier + domain blocklist
  ├─ REJECT → quarantine log (ไม่เข้า storage)
  └─ PASS ↓
[qwen3:8b — summarize + entity extract]
        ↓
[Celery Worker] → MinIO (raw) + Meilisearch (index) + Neo4j (graph)
        ↓
[OSINT//DESK Pipeline — เหมือน clearnet intel ทุกอย่าง]
```

จุดสำคัญคือ Content Filter Layer คั่นกลางระหว่าง crawler กับ storage โดยเด็ดขาด ไม่มีข้อมูลดิบเขียนลง storage ก่อนผ่าน filter

---

## 3. Tools ที่ใช้

### TorBot (Primary Crawler)
crawl จาก seed URL ตามลิงก์ สร้าง link graph เป็น JSON ที่โยนเข้า Neo4j ได้ตรง รองรับ Tor SOCKS5 proxy

### VigilantOnion (Continuous Monitor)
monitor .onion sites ต่อเนื่อง trigger alert เมื่อพบ keyword หรือ pattern ที่กำหนดไว้ เหมาะกับ Watchlist module

### Ahmia (Seed & Search)
open-source search index สำหรับ .onion เข้าถึงผ่าน clearnet ได้ ใช้เป็น seed list และ enrich SearXNG

### OnionScan (OPSEC Analysis)
ตรวจหา OPSEC failure ของ hidden service ช่วย verify ตัวตนผู้ดูแลไซต์ในกระบวนการสืบสวน

---

## 4. Content Filter Layer (สำคัญที่สุด)

filter ทำงานสองชั้นก่อนข้อมูลเข้า storage

**ชั้นที่ 1 — Domain Blocklist**
รายชื่อ domain ที่ห้ามเก็บข้อมูลโดยเด็ดขาด ได้แก่ ไซต์ที่ทราบว่าเป็น CSAM, ตลาดค้าอาวุธ และหมวดหมู่ที่ไม่เกี่ยวกับ journalistic purpose ทุกกรณี

**ชั้นที่ 2 — Content Classifier**
qwen3:8b ตรวจสอบเนื้อหาก่อน store โดยใช้ prompt ที่กำหนดหมวดหมู่ที่อนุญาตและห้ามอย่างชัดเจน เนื้อหาที่ไม่ผ่านถูก log ไว้ใน quarantine โดยไม่เก็บเนื้อหาจริง

**ชั้นที่ 3 — Human Review Queue**
เนื้อหาที่ classifier ไม่แน่ใจ (confidence < 0.8) ถูกส่งให้ Intelligence Lead review ก่อน เนื้อหาไม่เข้า pipeline จนกว่าจะมีการ approve

---

## 5. OPSEC Requirements

**Infrastructure**
- crawler รันบน isolated VM หรือ container ที่แยกออกจาก network หลักของ Amarin
- ไม่ share IP address กับ services อื่น
- container ทิ้งได้และสร้างใหม่ได้โดยไม่กระทบ data

**Operational**
- ไม่ใช้ identity จริงในการเข้าถึง .onion ที่ต้อง authentication
- เก็บ chain of custody ทุก session: timestamp, source URL, screenshot, เหตุผลที่เข้าถึง
- rate limiting เข้มงวด เพื่อไม่ให้ทำให้ hidden service ล่มและไม่ถูก block

**Audit**
- ทุกการเข้าถึงถูก log พร้อม user ID, timestamp, และ query
- log ไม่สามารถลบได้ (append-only)
- Intelligence Lead review audit log รายสัปดาห์

---

## 6. การเชื่อมต่อกับ OSINT//DESK

เมื่อข้อมูลผ่าน filter และเข้า pipeline แล้ว ทุกอย่างเหมือน clearnet intelligence ทุกประการ ข้อมูลเข้า Canonical Feed Item ด้วย source_type ใหม่ที่เพิ่มคือ `darkweb` และมี flag `requires_legal_review: true` ที่ Brief Builder จะเตือน editor ก่อน approve

---

## 7. docker-compose snippet

```yaml
# เพิ่มใน docker-compose.yml หลักของ OSINT//DESK
# ต้องรันใน isolated network แยกจาก osint-network หลัก

networks:
  darkweb-net:
    driver: bridge
    internal: true  # ไม่มี external internet access โดยตรง

services:

  tor-proxy:
    image: dperson/torproxy:latest
    container_name: osint-tor
    networks:
      - darkweb-net
    ports:
      - "127.0.0.1:9050:9050"   # SOCKS5 — bind localhost เท่านั้น
      - "127.0.0.1:9051:9051"   # Control port
    environment:
      - TOR_NewCircuitPeriod=30
      - TOR_MaxCircuitDirtiness=600
    restart: unless-stopped
    volumes:
      - tor-data:/var/lib/tor

  torbot:
    image: python:3.11-slim
    container_name: osint-torbot
    networks:
      - darkweb-net
      - osint-network    # เชื่อม pipeline กลับมา
    environment:
      - TOR_PROXY=socks5://tor-proxy:9050
      - REDIS_URL=redis://redis:6379/2      # queue แยกจาก main
      - CONTENT_FILTER_ENDPOINT=http://content-filter:8001
    volumes:
      - ./darkweb/torbot:/app
    depends_on:
      - tor-proxy
      - content-filter
    command: celery -A tasks worker -Q darkweb -c 2  # concurrency ต่ำ

  vigilant-onion:
    image: python:3.11-slim
    container_name: osint-vigilant
    networks:
      - darkweb-net
      - osint-network
    environment:
      - TOR_PROXY=socks5://tor-proxy:9050
      - ALERT_WEBHOOK=http://api:8000/api/v1/darkweb/alert
    volumes:
      - ./darkweb/vigilant:/app
    depends_on:
      - tor-proxy

  content-filter:
    image: python:3.11-slim
    container_name: osint-content-filter
    networks:
      - darkweb-net
      - osint-network
    environment:
      - OLLAMA_URL=http://host.docker.internal:11434
      - CLASSIFIER_MODEL=qwen3:8b
      - CONFIDENCE_THRESHOLD=0.8
      - QUARANTINE_DB=postgresql://...
    volumes:
      - ./darkweb/filter:/app
      - ./darkweb/blocklist.txt:/app/blocklist.txt:ro
    ports:
      - "127.0.0.1:8001:8001"

volumes:
  tor-data:
```

---

## 8. Adapter ที่เพิ่มใหม่

```python
class DarkWebAdapter(BaseAdapter):
    """
    Adapter สำหรับ dark web sources
    ต้องผ่าน ContentFilter ก่อนทุกครั้ง
    """
    async def connect(self) -> bool:
        # verify Tor proxy ทำงาน
        self.session = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(
                proxy=f"socks5://{TOR_PROXY}"
            )
        )
        return await self._verify_tor_connection()

    def transform(self, raw) -> CanonicalFeedItem:
        return CanonicalFeedItem(
            source_type=SourceType.DARKWEB,  # type ใหม่
            verified_source=False,
            source_weight=0.5,   # น้ำหนักต่ำ ต้องการหลักฐานเสริม
            raw_metadata={
                "onion_url": raw["url"],
                "crawled_at": raw["timestamp"],
                "tor_circuit": raw["circuit_id"],
                "filter_confidence": raw["filter_score"],
                "chain_of_custody": raw["custody_log"],
                "requires_legal_review": True,
            }
        )
```

---

## 9. สิ่งที่เพิ่มใน Admin Settings

Admin Settings (ไฟล์ 10) ต้องเพิ่ม section ใหม่สำหรับ:

- เปิด/ปิด Dark Web module (disabled by default)
- จัดการ seed list (.onion URLs)
- กำหนด keyword watchlist สำหรับ VigilantOnion
- ดู content filter quarantine log
- กำหนด legal review policy (require review สำหรับทุก item หรือแค่ confidence < threshold)
- Tor circuit health status

---

## 10. สรุป flow ที่ practical สำหรับห้องข่าว

เริ่มจาก Ahmia เป็น seed source สำหรับ query เฉพาะเรื่องที่กำลังสืบสวน ไม่ใช่ crawl แบบ blind จากนั้น TorBot crawl เฉพาะ domains ที่เกี่ยวข้อง ผ่าน content filter ก่อนเข้า pipeline และ VigilantOnion monitor ต่อเนื่องสำหรับ entities ที่อยู่ใน watchlist

แนวทางนี้ทำให้ coverage ตรงเป้าหมาย ลด noise และลด legal risk เพราะไม่ได้ crawl แบบ bulk โดยไม่มีเป้าหมาย
