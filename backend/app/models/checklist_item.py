import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, Boolean, text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class OrganizationChecklistItem(Base):
    """One line of the process checklist, configured per organization.

    Managed by the Float team (platform admin) — organizations do not edit their
    own list. Per-patient completion is stored elsewhere, keyed by `key`, so a
    key is an identity: changing one orphans every tick recorded against it.
    """

    __tablename__ = "organization_checklist_items"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Stable identity for completion tracking — NOT the primary key, because the
    # seeded items have to keep the keys the frontend already shipped with.
    key: Mapped[str] = mapped_column(String, nullable=False)
    text_: Mapped[str] = mapped_column("text", Text, nullable=False)
    # Optional education link shown under the item.
    link_icon: Mapped[str | None] = mapped_column(String, nullable=True)
    link_label: Mapped[str | None] = mapped_column(String, nullable=True)
    # Optional in-app jump ("treatmentPlan" | "scrollDA").
    nav_label: Mapped[str | None] = mapped_column(String, nullable=True)
    nav_action: Mapped[str | None] = mapped_column(String, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"), default=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
