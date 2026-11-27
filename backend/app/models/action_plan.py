"""Action plans: what the family practices between sessions.

Design: docs/plans/action-plans-and-rewards.md. Build: docs/plans/action-plans-build.md.
"""
import uuid
from datetime import datetime, date
from sqlalchemy import (
    String, Text, Date, DateTime, Integer, Boolean, ForeignKey, CheckConstraint, Index, UniqueConstraint,
    text as sql,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

ITEM_KINDS = ("exposure", "tool", "accommodation", "parent_instruction", "reward")
# The child's own items. Parent instructions reach the child only when shared.
CHILD_KINDS = ("exposure", "tool", "reward")


class ActionPlan(Base):
    __tablename__ = "action_plans"
    __table_args__ = (
        # One plan per session number, so two clicks cannot make two drafts.
        UniqueConstraint("patient_id", "session_number", name="uq_action_plans_patient_session"),
        Index("ix_action_plans_patient_id", "patient_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sql("gen_random_uuid()")
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_profiles.id"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    practitioner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("practitioner_profiles.id"), nullable=False
    )
    session_number: Mapped[int] = mapped_column(Integer, nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False, server_default=sql("CURRENT_DATE"))
    # The plan runs from session_date (its start) to ends_on, both included. Peter, 2026-11-27.
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    # Empty while a draft. Set, the parent and child see it.
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sql("now()"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=sql("now()"), onupdate=datetime.now
    )


class ActionPlanItem(Base):
    """One line on a plan. See ITEM_KINDS; which link is set depends on the kind."""

    __tablename__ = "action_plan_items"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('exposure', 'tool', 'accommodation', 'parent_instruction', 'reward')",
            name="ck_action_plan_items_kind"),
        CheckConstraint("done_by IN ('clinician', 'child', 'parent')", name="ck_action_plan_items_done_by"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sql("gen_random_uuid()")
    )
    action_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("action_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default=sql("0"), default=0)
    avoidance_behavior_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("avoidance_behaviors.id", ondelete="SET NULL"), nullable=True
    )
    accommodation_behavior_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("accommodation_behaviors.id", ondelete="SET NULL"), nullable=True
    )
    tool_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tools.id", ondelete="SET NULL"), nullable=True
    )
    # A tool with examples (the mottos): the one picked. A written one is `text` instead.
    tool_example_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tool_examples.id", ondelete="SET NULL"), nullable=True
    )
    # Exposure: this plan's wording, empty for the rung's own. Parent instruction: the instruction.
    # Reward: what the reward is. Tool: an example the clinician wrote for this plan only.
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Reward only: what it is given for.
    reward_for: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Tool only: for the parent alone (a parent strategy, or one written in under the parent).
    parent_only: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sql("false"), default=False)
    # Parent instruction only: whether the child sees it too.
    share_with_child: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=sql("false"), default=False
    )
    # Checking in: ticked, by whom (clinician, child or parent) and when. An exposure is done by
    # recording it instead. check_note is the clinician's alone.
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    done_by: Mapped[str | None] = mapped_column(String, nullable=True)
    check_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sql("now()"))

