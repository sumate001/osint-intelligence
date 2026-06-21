import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from .models import PIR
from .schemas import PIRCreate, PIRUpdate

logger = logging.getLogger(__name__)

MATCH_PROMPT = """คุณเป็น analyst ข่าวกรอง หน้าที่คือตรวจสอบว่าข่าวชิ้นนี้ตอบคำถาม EEI (Essential Elements of Information) ข้อใดได้บ้าง

กฎ:
- จับคู่เฉพาะเมื่อข่าวมีข้อมูลที่ตอบคำถาม EEI นั้นได้ชัดเจน ไม่ใช่แค่เกี่ยวข้องกัน
- answer ต้องสรุปข้อมูลจากข่าวที่ตอบคำถามนั้นโดยตรง ความยาว 1-3 ประโยค
- ถ้าข่าวไม่ตอบ EEI ใดเลย ให้ matches เป็น []
- EEI เดียวกันตอบได้แค่ครั้งเดียว

ตอบเป็น JSON เท่านั้น:
{"matches": [{"pir_id": "<id>", "eei_id": "<id>", "answer": "<สรุปคำตอบ>"}]}"""


async def create_pir(db: AsyncSession, data: PIRCreate, user_id: str) -> PIR:
    pir = PIR(
        question=data.question,
        priority=data.priority,
        deadline=data.deadline,
        eei_list=[e.model_dump() for e in data.eei_list],
        assigned_to=data.assigned_to,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(pir)
    await db.flush()
    await db.refresh(pir)
    return pir


async def list_pirs(db: AsyncSession, status: str | None = None) -> list[PIR]:
    q = select(PIR).order_by(PIR.priority, desc(PIR.created_at))
    if status:
        q = q.where(PIR.status == status)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_pir(db: AsyncSession, pir_id: str) -> PIR | None:
    result = await db.execute(select(PIR).where(PIR.id == pir_id))
    return result.scalar_one_or_none()


async def update_pir(db: AsyncSession, pir: PIR, data: PIRUpdate) -> PIR:
    if data.question is not None:
        pir.question = data.question
    if data.priority is not None:
        pir.priority = data.priority
    if data.status is not None:
        pir.status = data.status
    if data.deadline is not None:
        pir.deadline = data.deadline
    if data.eei_list is not None:
        pir.eei_list = [e.model_dump() for e in data.eei_list]
    if data.notes is not None:
        pir.notes = data.notes
    pir.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(pir)
    return pir


async def delete_pir(db: AsyncSession, pir: PIR) -> None:
    await db.delete(pir)
    await db.flush()


async def match_feed_item_to_pirs(
    db: AsyncSession,
    feed_item_id: str,
    title: str,
    body: str,
) -> list[str]:
    """Match a feed item against active PIRs with unanswered EEIs using LLM.
    Updates EEI answers in place. Returns list of PIR IDs that were updated."""
    from ...core.llm import chat_json

    pirs = await list_pirs(db, status="ACTIVE")
    pirs_with_gaps = [
        p for p in pirs
        if any(not e.get("answered") for e in (p.eei_list or []))
    ]
    if not pirs_with_gaps:
        return []

    pir_list_text = "\n".join(
        f"PIR (id={p.id}): {p.question}\n" +
        "\n".join(
            f"  EEI (id={e['id']}): {e['question']}"
            for e in p.eei_list
            if not e.get("answered")
        )
        for p in pirs_with_gaps
    )

    messages = [
        {"role": "system", "content": MATCH_PROMPT},
        {
            "role": "user",
            "content": (
                f"ข่าว:\nหัวข้อ: {title}\nเนื้อหา: {body[:2000]}\n\n"
                f"รายการ PIR/EEI ที่ยังไม่มีคำตอบ:\n{pir_list_text}"
            ),
        },
    ]

    try:
        result = await chat_json(messages, module="requirements")
    except Exception as exc:
        logger.warning("PIR auto-match LLM failed for feed_item %s: %s", feed_item_id, exc)
        return []

    matches = result.get("matches", [])
    if not matches:
        return []

    pir_map = {p.id: p for p in pirs_with_gaps}
    updated_ids: list[str] = []

    for match in matches:
        pir_id = match.get("pir_id", "")
        eei_id = match.get("eei_id", "")
        answer = (match.get("answer") or "").strip()
        if not pir_id or not eei_id or not answer:
            continue
        pir = pir_map.get(pir_id)
        if not pir:
            continue

        new_list = []
        changed = False
        for e in pir.eei_list:
            if e["id"] == eei_id and not e.get("answered"):
                new_list.append({**e, "answered": True, "answer": answer})
                changed = True
            else:
                new_list.append(e)

        if not changed:
            continue

        pir.eei_list = new_list
        if all(e.get("answered") for e in new_list):
            pir.status = "ANSWERED"
        pir.updated_at = datetime.now(timezone.utc)
        updated_ids.append(pir_id)
        logger.info("PIR auto-match: feed_item=%s answered EEI %s in PIR %s", feed_item_id, eei_id, pir_id)

    if updated_ids:
        await db.flush()

    return updated_ids
