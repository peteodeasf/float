import uuid
from datetime import date, datetime
from sqlalchemy import String, DateTime, Date, ForeignKey, text, Numeric, Boolean, Text, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    ladder_rung_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ladder_rungs.id"), nullable=True
    )
    avoidance_behavior_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("avoidance_behaviors.id"), nullable=True
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patient_profiles.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    scheduled_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="planned")
    # Before state
    plan_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    prediction: Mapped[str | None] = mapped_column(Text, nullable=True)
    bip_before: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    distress_thermometer_expected: Mapped[float | None] = mapped_column(
        Numeric(3, 1), nullable=True
    )
    tempting_behaviors: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_level: Mapped[str | None] = mapped_column(String, nullable=True)
    # Scheduling: repeats per scheduled day. Previously encoded as `times:N`
    # inside tempting_behaviors.
    times_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Coarse "when" the teen commits to (e.g. morning / afternoon / evening).
    # scheduled_date carries the day (and a representative hour for the bucket);
    # this keeps the bucket label so it survives relabelling/time changes and
    # can drive a future reminder. Provisional — labels are UI-side.
    scheduled_time_bucket: Mapped[str | None] = mapped_column(String, nullable=True)
    # After state
    feared_outcome_occurred: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    what_happened: Mapped[str | None] = mapped_column(Text, nullable=True)
    distress_thermometer_actual: Mapped[float | None] = mapped_column(
        Numeric(3, 1), nullable=True
    )
    bip_after: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    what_learned: Mapped[str | None] = mapped_column(Text, nullable=True)
    committed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    too_hard_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reminder_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )


class AccommodationBehavior(Base):
    __tablename__ = "accommodation_behaviors"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    treatment_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("treatment_plans.id"), nullable=False
    )
    # Optional — the parent may not yet have an account when the therapist
    # enters the accommodation from monitoring/consultation.
    parent_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    # Optional situation link — some accommodations belong to no single situation.
    trigger_situation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("trigger_situations.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The child's distress if the parent stops the accommodation, as a range.
    # A single value is just min == max. Seeds the per-child ladder order.
    distress_min: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)
    distress_max: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)
    # Per-child ladder position; authoritative and reorderable.
    display_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # The parent's estimate of the same thing, carried over from their suggestion. The clinician
    # sees it beside the child's rating; the child never does. docs/plans/accommodation-conversation.md
    parent_estimate_min: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)
    parent_estimate_max: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)
    # Set when the child gave distress_min/max themselves; null means it is the clinician's guess.
    child_rated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Where the parent has got to with stopping it: not_started, started or stopped. The clinician
    # sets it; making it the weekly focus marks it started. docs/plans/accommodation-states.md
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="not_started", server_default="not_started"
    )
    # The one accommodation the clinician has set as this week's focus for the
    # parent. Only one per plan should be true (enforced in the service).
    is_weekly_focus: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )
    accommodator: Mapped[str] = mapped_column(
    String, nullable=False, default="parent"
    )


class AccommodationMoment(Base):
    """A lightweight parent log — one tap recording that an accommodation came up
    and whether the parent held the line. Its job is a coaching signal for the
    clinician, not a journal."""

    __tablename__ = "accommodation_moments"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    treatment_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("treatment_plans.id"), nullable=False
    )
    accommodation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("accommodation_behaviors.id"), nullable=True
    )
    parent_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    # True = parent held the line (didn't accommodate); False = gave in.
    held: Mapped[bool] = mapped_column(Boolean, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )


class AccommodationCheckin(Base):
    """The parent's weekly answer about their focus accommodation: held every time, mostly, or
    gave in. One per parent, accommodation and week; answering again that week changes it.

    Replaced AccommodationMoment, one tap per moment, on 2026-09-10 (Peter): logging every moment
    is what parents stop keeping up. docs/plans/weekly-checkin.md
    """

    __tablename__ = "accommodation_checkins"
    __table_args__ = (
        UniqueConstraint("accommodation_id", "parent_user_id", "week_start", name="uq_checkin_per_week"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    # Deleting the plan, the accommodation or the parent's account takes these with it — nothing
    # else in this database deletes on its own (docs/solutions/delete-fails-silently-no-fk-cascade.md).
    treatment_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("treatment_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    accommodation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("accommodation_behaviors.id", ondelete="CASCADE"), nullable=False
    )
    parent_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    # The Monday of the week, in the parent's own time.
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    # every_time | mostly | gave_in
    answer: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
