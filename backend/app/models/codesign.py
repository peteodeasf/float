"""Teen co-design sessions and who signed up for them. docs/plans/codesign-signup.md

Not patients: nothing here links to a patient, family or clinician record.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class CodesignSession(Base):
    __tablename__ = "codesign_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4,
                                          server_default=text("gen_random_uuid()"))
    week: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 or 2
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    seats: Mapped[int] = mapped_column(Integer, nullable=False)


class CodesignSignup(Base):
    __tablename__ = "codesign_signups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4,
                                          server_default=text("gen_random_uuid()"))
    teen_first_name: Mapped[str] = mapped_column(String, nullable=False)
    teen_last_name: Mapped[str] = mapped_column(String, nullable=False)
    teen_age: Mapped[int] = mapped_column(Integer, nullable=False)
    teen_email: Mapped[str] = mapped_column(String, nullable=False)
    parent_name: Mapped[str] = mapped_column(String, nullable=False)
    parent_email: Mapped[str] = mapped_column(String, nullable=False)
    session1_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("codesign_sessions.id"), nullable=False)
    session2_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("codesign_sessions.id"), nullable=False)
    # Only a hash of the permission link's token is kept, so the database alone cannot give it.
    permission_token_hash: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    permission_given_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    permission_given_by: Mapped[str | None] = mapped_column(String, nullable=True)  # the name typed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
