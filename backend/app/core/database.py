from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

db_url = settings.ASYNC_DATABASE_URL if settings.ASYNC_DATABASE_URL else settings.DATABASE_URL
engine = create_async_engine(db_url, echo=settings.SQL_ECHO)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

def get_session_factory():
    """Opens a session of its own, for work that runs after the response has gone: the request's
    session is closed by then. Tests swap it for theirs."""
    return AsyncSessionLocal


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
