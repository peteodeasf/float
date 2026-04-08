import asyncio
import os
import uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select

# Use the public Railway database URL
DATABASE_URL = "postgresql+asyncpg://postgres:FwINIuaqqfrtXhIZTPgruLqyDEphqcSX@junction.proxy.rlwy.net:51458/railway"

engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def setup():
    async with AsyncSessionLocal() as session:
        # Import models
        from app.models.organization import Organization
        from app.models.user import User, UserRole
        from app.models.patient import PractitionerProfile
        from app.core.security import hash_password

        # Create organization
        org = Organization(
            id=uuid.uuid4(),
            name="Float Demo",
            type="clinic"
        )
        session.add(org)
        await session.flush()

        # Create user
        user = User(
            id=uuid.uuid4(),
            email="pete@float.com",
            password_hash=hash_password("testpassword123")
        )
        session.add(user)
        await session.flush()

        # Create role
        role = UserRole(
            user_id=user.id,
            organization_id=org.id,
            role="practitioner"
        )
        session.add(role)

        # Create practitioner profile
        practitioner = PractitionerProfile(
            id=uuid.uuid4(),
            user_id=user.id,
            organization_id=org.id,
            name="Pete O'Dea"
        )
        session.add(practitioner)

        await session.commit()
        print(f"Created org: {org.id}")
        print(f"Created user: {user.id}")
        print(f"Created practitioner: {practitioner.id}")

asyncio.run(setup())
