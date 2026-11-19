import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

#: Who a video is for. Clinicians see every video; families only ever see ones shared with them
#: (stage 2), and only `family` or `both` can be shared.
AUDIENCES = ("clinician", "family", "both")


class Video(Base):
    """One of Float's own videos, hosted on Mux. Float-wide, not per practice, like tips and tags.

    The file lives on Mux. Float keeps what it needs to list and play it: the Mux asset, its
    signed playback id (no public one: adding a video makes it private), and how to show it.
    docs/plans/videos.md
    """
    __tablename__ = "videos"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    mux_asset_id: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    mux_playback_id: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    audience: Mapped[str] = mapped_column(String, nullable=False, server_default="clinician")
    duration_seconds: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    #: Unpublished videos are seen only on the admin page.
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
