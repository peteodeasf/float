"""Review rounds — a reviewer marks generated suggestions without logging in.

Built for Dr. Walker reviewing ladder suggestions, and meant to be reused for the extraction and
arrow work. A round is a frozen list of items; a reviewer gets an unguessable link; every click is
saved as it happens. No login, because the people whose judgement we need are not going to manage
one.

**These tables hold their own copy of the text and never reference patient rows.** If a link is
forwarded or leaks, whoever opens it sees the review items and nothing else.
"""
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReviewRound(Base):
    __tablename__ = "review_rounds"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    slug: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The frozen items. A copy of the text, never a pointer to a patient row.
    items: Mapped[list] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class ReviewReviewer(Base):
    """One person, one link. The token is the whole of the authentication, so it is long."""

    __tablename__ = "review_reviewers"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    round_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("review_rounds.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    token: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ReviewMark(Base):
    """One decision on one item. Re-marking overwrites; there is no history to keep."""

    __tablename__ = "review_marks"
    __table_args__ = (
        Index("uq_review_marks_item", "reviewer_id", "item_key", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("review_reviewers.id"), nullable=False
    )
    item_key: Mapped[str] = mapped_column(String, nullable=False)
    choice: Mapped[str] = mapped_column(String, nullable=False)  # 'show' | 'hide'
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class ReviewAddition(Base):
    """A suggestion the reviewer wrote herself.

    The most valuable thing on the page: marking ours tells us what is wrong, writing her own tells
    us what right looks like. Kept separate from ReviewMark because it answers a different question
    and should never be counted as a judgement of our output.
    """

    __tablename__ = "review_additions"
    __table_args__ = (
        Index("ix_review_additions_reviewer", "reviewer_id", "item_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("review_reviewers.id"), nullable=False
    )
    item_key: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
