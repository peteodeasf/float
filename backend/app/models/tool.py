"""Tools and strategies: pages in the Library, written in the admin app.

docs/plans/tools-and-strategies.md
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    String, Text, DateTime, Integer, Boolean, ForeignKey, LargeBinary, CheckConstraint, UniqueConstraint,
    text as sql,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

KINDS = ("tool", "strategy")
AUDIENCES = ("child", "parent", "both")


class Tool(Base):
    """One tool or strategy page. Platform-wide, like tips and videos."""

    __tablename__ = "tools"
    __table_args__ = (
        CheckConstraint("kind IN ('tool', 'strategy')", name="ck_tools_kind"),
        CheckConstraint("audience IN ('child', 'parent', 'both')", name="ck_tools_audience"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sql("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False, server_default="tool", default="tool")
    audience: Mapped[str] = mapped_column(String, nullable=False, server_default="both", default="both")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The page: [{"type": "text", "text"}, {"type": "image", "image_id"}, {"type": "video", "video_id"}]
    blocks: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=sql("'[]'::jsonb"), default=list)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=sql("0"), default=0)
    # A draft is seen only in the admin app.
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sql("false"), default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sql("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sql("now()"))


class ToolExample(Base):
    """One example on a page, such as one motto, with how it is used."""

    __tablename__ = "tool_examples"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sql("gen_random_uuid()")
    )
    tool_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tools.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    how_used: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default=sql("0"), default=0)


class ToolImage(Base):
    """An image on a page. Kept in the database: Float's own content, small, never patient data."""

    __tablename__ = "tool_images"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sql("gen_random_uuid()")
    )
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sql("now()"))


class ToolHighlight(Base):
    """A clinician put this page first for a patient's child, parent, or both."""

    __tablename__ = "tool_highlights"
    __table_args__ = (UniqueConstraint("tool_id", "patient_id", name="uq_tool_highlights_tool_patient"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sql("gen_random_uuid()")
    )
    tool_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tools.id", ondelete="CASCADE"), nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    for_child: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sql("false"), default=False)
    for_parent: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sql("false"), default=False)
    highlighted_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("practitioner_profiles.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sql("now()"))


class ToolOpen(Base):
    """A child or parent opened a page. Kept once per person per page."""

    __tablename__ = "tool_opens"
    __table_args__ = (UniqueConstraint("tool_id", "user_id", name="uq_tool_opens_tool_user"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sql("gen_random_uuid()")
    )
    tool_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tools.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sql("now()"))
