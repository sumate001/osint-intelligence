# OSINT//DESK — Adapter Technical Specification
## ข้อกำหนดทางเทคนิคของตัวแปลง (สำหรับนักพัฒนา)

เวอร์ชัน 1.0

---

## 1. Canonical Feed Item Schema

ทุก adapter ต้อง output ตาม schema นี้:

```python
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional

class SourceType(str, Enum):
    RSS = "rss"
    WIRE = "wire"           # Reuters, AP, ไทยรัฐ
    SOCIAL = "social"       # FB, X, TikTok
    CMS = "cms"             # internal CMS
    MESSAGING = "messaging" # email, Line, Telegram
    WEBHOOK = "webhook"     # external push

class MediaItem(BaseModel):
    url: str
    media_type: str         # image, video, document
    caption: Optional[str] = None

class CanonicalFeedItem(BaseModel):
    # identity
    external_id: str                  # id จากแหล่งต้นทาง
    source_id: str                    # ระบุ adapter ที่ส่งมา
    source_type: SourceType

    # content
    title: str
    body: str
    url: Optional[str] = None
    language: str = "th"

    # timing
    published_at: Optional[datetime] = None
    ingested_at: datetime = Field(default_factory=datetime.utcnow)

    # media
    media: list[MediaItem] = []

    # trust & routing
    source_weight: float = 1.0        # น้ำหนักในการ triage (0-2)
    verified_source: bool = False     # แหล่งเชื่อถือได้หรือไม่

    # flexibility
    raw_metadata: dict = {}           # ข้อมูลเพิ่มเติมเฉพาะแหล่ง
```

---

## 2. Base Adapter Interface

ทุก adapter สืบทอดจาก base class นี้:

```python
from abc import ABC, abstractmethod
from typing import AsyncIterator

class BaseAdapter(ABC):
    """Base class สำหรับทุก ingestion adapter"""

    def __init__(self, config: dict):
        self.config = config
        self.source_id = config["source_id"]
        self.source_weight = config.get("source_weight", 1.0)

    @abstractmethod
    async def connect(self) -> bool:
        """สร้างการเชื่อมต่อ + ยืนยันตัวตน"""
        ...

    @abstractmethod
    async def fetch(self) -> AsyncIterator[dict]:
        """ดึงข้อมูลดิบ — yield ทีละ raw item"""
        ...

    @abstractmethod
    def transform(self, raw: dict) -> CanonicalFeedItem:
        """แปลง raw → canonical format"""
        ...

    async def health_check(self) -> dict:
        """รายงานสถานะ adapter"""
        return {
            "source_id": self.source_id,
            "status": "healthy",
            "last_fetch": self.last_fetch_time,
            "success_rate": self.success_rate,
        }

    async def run(self):
        """วงจรหลัก: connect → fetch → transform → emit"""
        if not await self.connect():
            raise AdapterConnectionError(self.source_id)
        async for raw in self.fetch():
            try:
                item = self.transform(raw)
                await self.emit(item)
            except TransformError as e:
                await self.quarantine(raw, e)

    async def emit(self, item: CanonicalFeedItem):
        """ส่งเข้า Redis queue กลาง"""
        await redis_queue.push("ingestion:items", item.json())

    async def quarantine(self, raw: dict, error: Exception):
        """เก็บ item ที่แปลงไม่สำเร็จไว้ตรวจสอบ"""
        await db.quarantine.insert({
            "source_id": self.source_id,
            "raw": raw,
            "error": str(error),
            "timestamp": datetime.utcnow(),
        })
```

---

## 3. ตัวอย่าง Adapter จริง

### 3.1 RSS Adapter

```python
import feedparser

class RSSAdapter(BaseAdapter):
    async def connect(self) -> bool:
        self.feed_url = self.config["feed_url"]
        return True  # RSS ไม่ต้อง auth (ส่วนใหญ่)

    async def fetch(self):
        feed = feedparser.parse(self.feed_url)
        for entry in feed.entries:
            if self._is_new(entry.id):
                yield entry

    def transform(self, raw) -> CanonicalFeedItem:
        return CanonicalFeedItem(
            external_id=raw.id,
            source_id=self.source_id,
            source_type=SourceType.RSS,
            title=raw.title,
            body=raw.get("summary", ""),
            url=raw.link,
            published_at=self._parse_date(raw.get("published")),
            source_weight=self.source_weight,
        )
```

### 3.2 Webhook Adapter (flexible)

```python
class WebhookAdapter(BaseAdapter):
    """รับ push จากระบบภายนอก — mapping ผ่าน config"""

    async def connect(self) -> bool:
        # webhook ไม่ fetch เอง รอรับ push
        self.field_map = self.config["field_map"]
        return True

    async def fetch(self):
        # ดึงจาก buffer ที่ webhook endpoint เก็บไว้
        async for payload in webhook_buffer.consume(self.source_id):
            yield payload

    def transform(self, raw) -> CanonicalFeedItem:
        m = self.field_map  # config-driven mapping
        return CanonicalFeedItem(
            external_id=str(raw[m["id"]]),
            source_id=self.source_id,
            source_type=SourceType.WEBHOOK,
            title=raw[m["title"]],
            body=raw[m["body"]],
            url=raw.get(m.get("url")),
            raw_metadata=raw,
        )
```

config สำหรับ webhook adapter ตัวอย่าง:

```json
{
  "source_id": "partner-cms-001",
  "source_type": "webhook",
  "source_weight": 1.2,
  "verified_source": true,
  "field_map": {
    "id": "article_id",
    "title": "headline",
    "body": "content_text",
    "url": "permalink"
  }
}
```

---

## 4. Adapter Registry & Plugin System

adapter ลงทะเบียนแบบ plugin ทำให้เพิ่มใหม่ได้โดยไม่แตะ core:

```python
ADAPTER_REGISTRY = {
    "rss": RSSAdapter,
    "wire_reuters": ReutersAdapter,
    "wire_thairath": ThairathAdapter,
    "social_facebook": FacebookAdapter,
    "social_x": XAdapter,
    "cms_generic": GenericCMSAdapter,
    "messaging_line": LineAdapter,
    "messaging_telegram": TelegramAdapter,
    "webhook": WebhookAdapter,
}

def load_adapter(config: dict) -> BaseAdapter:
    adapter_class = ADAPTER_REGISTRY[config["adapter_type"]]
    return adapter_class(config)

# adapter ใหม่จาก 3rd party — drop-in
def register_adapter(name: str, cls: type[BaseAdapter]):
    ADAPTER_REGISTRY[name] = cls
```

---

## 5. การ orchestrate ผ่าน n8n

adapter รันเป็น scheduled job ผ่าน Celery + n8n:

```python
@celery_app.task
def run_adapter(source_id: str):
    config = db.sources.get(source_id)
    adapter = load_adapter(config)
    asyncio.run(adapter.run())

# n8n schedule: ทุก adapter ตาม interval ของตัวเอง
# rss → ทุก 5 นาที
# wire → ทุก 1 นาที
# social → ทุก 10 นาที (rate limit)
# webhook → realtime (event-driven)
```

---

## 6. Flow สมบูรณ์

```
External Source
      ↓
[Adapter: connect → fetch → transform]
      ↓
CanonicalFeedItem
      ↓
Redis Queue (ingestion:items)
      ↓
Celery Worker → LLM Triage Scoring
      ↓
PostgreSQL + Alert
      ↓
User sees in "Today's Intel"
```

ไม่ว่าข้อมูลมาจาก Reuters, Facebook, หรือ Line — เมื่อผ่าน adapter แล้วทุกอย่างเหมือนกันหมดจากจุดนี้
