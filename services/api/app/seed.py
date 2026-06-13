"""Seed script — สร้าง admin user เริ่มต้น (idempotent: รันซ้ำได้ปลอดภัย)"""
import asyncio
import os
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .core.auth import hash_password
from .models.user import User


async def seed(
    email: str = "admin@osintdesk.local",
    password: str = "changeme",
    full_name: str = "System Admin",
) -> None:
    postgres_url = os.getenv(
        "POSTGRES_URL",
        "postgresql+asyncpg://osint:changeme@postgres:5432/osintdesk",
    )
    engine = create_async_engine(postgres_url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            print(f"  admin '{email}' มีอยู่แล้ว — ข้าม")
            return

        user = User(
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            role="admin",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        print(f"  ✓ สร้าง admin: {email}")

    await engine.dispose()


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "admin@osintdesk.local"
    password = sys.argv[2] if len(sys.argv) > 2 else "changeme"
    asyncio.run(seed(email, password))
