"""What we know about a patient, in one list.

Peter, 2026-09-05: everything the app suggests has to come from this patient's own record, and
nothing here is on the treatment plan until a clinician explicitly adds it.

    "it's not part of the plan until explicitly added. That's true of situations, behaviors,
     sub-situations, accommodations, etc."

So this table holds what the monitoring log (and later the session notes) say, each item carrying
the evidence it came from. Adding an item to the plan creates the plan row and points the item at
it. Removing it from the plan puts the item back on the list rather than losing it.

See docs/plans/patient-specific-suggestions.md.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Index, Numeric, String, Text, text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

#: A situation the child finds hard.
KIND_SITUATION = "situation"
#: Something the child does — avoidance, safety behaviour, escape.
KIND_BEHAVIOR = "behavior"
#: Something a parent or another adult does to lower the child's distress.
KIND_ACCOMMODATION = "accommodation"
#: A smaller version of a situation. Generated, not extracted — saved so it is reviewable and so we
#: stop paying to produce the same four every time the panel opens.
KIND_SUB_SITUATION = "sub_situation"

KINDS = {KIND_SITUATION, KIND_BEHAVIOR, KIND_ACCOMMODATION, KIND_SUB_SITUATION}

#: Where an item came from. Not cosmetic: the clinician reads "he hides in his room" differently
#: depending on whether the parent logged it or they wrote it in session, and a suggestion has to
#: be traceable to something real.
SOURCE_MONITORING = "monitoring"
SOURCE_SESSION_NOTE = "session_note"
SOURCE_SUGGESTION = "suggestion"
#: The parent named it, or confirmed it, in the accommodation conversation
#: (docs/plans/accommodation-conversation.md).
SOURCE_PARENT = "parent"


class PatientInsight(Base):
    __tablename__ = "patient_insights"
    __table_args__ = (
        Index("ix_patient_insights_patient", "patient_id", "kind"),
        Index("ix_patient_insights_parent", "parent_insight_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patient_profiles.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String, nullable=False)

    #: The item in the family's own words.
    name: Mapped[str] = mapped_column(Text, nullable=False)
    #: Lowercased and stripped. What a re-run matches on, so pressing the button again folds into
    #: what is already here instead of duplicating it.
    normalized_name: Mapped[str] = mapped_column(Text, nullable=False)

    #: A behaviour or accommodation belongs to a situation; so does a sub-situation.
    parent_insight_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("patient_insights.id", ondelete="CASCADE"), nullable=True
    )

    #: Kind-specific extras that do not deserve their own column — the behaviour type, a fear
    #: rating the parent gave. Deliberately loose: this is a working list, not the plan.
    attributes: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    #: The fear rating, when the record carries one. Pulled out of attributes because it is read on
    #: every list and sorted on.
    fear_rating: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)

    # ── Where it came from ────────────────────────────────────────────────────
    sources: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default=text("'{}'")
    )
    monitoring_entry_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(PgUUID(as_uuid=True)), nullable=False, server_default=text("'{}'")
    )
    session_note_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(PgUUID(as_uuid=True)), nullable=False, server_default=text("'{}'")
    )

    # ── What the parent said, for an accommodation ────────────────────────────
    # From the accommodation conversation (docs/plans/accommodation-conversation.md). The parent's
    # guess at how hard it would be for the child if they stopped — the clinician sees it next to
    # the child's own rating. Never shown to the child.
    parent_estimate_min: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)
    parent_estimate_max: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)
    #: The parent's answer to "Do you still do this?" — null until asked.
    still_does: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    #: The parent who named it, when it came from them rather than from the log.
    named_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # ── Whether a clinician has put it on the plan ────────────────────────────
    # One of these, matching the kind. Real foreign keys with SET NULL: delete the situation from
    # the ladder and the item goes back to being available, rather than claiming forever that it
    # was added.
    trigger_situation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("trigger_situations.id", ondelete="SET NULL"), nullable=True
    )
    avoidance_behavior_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("avoidance_behaviors.id", ondelete="SET NULL"), nullable=True
    )
    accommodation_behavior_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("accommodation_behaviors.id", ondelete="SET NULL"), nullable=True
    )
    added_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    #: The clinician took it off the list. It stays removed when the log is analysed again —
    #: otherwise they would remove the same thing every week.
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    #: True when a clinician typed or edited the wording. A re-run must not overwrite it.
    is_edited: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )

    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
