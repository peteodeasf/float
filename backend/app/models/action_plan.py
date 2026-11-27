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
        CheckConstraint("confidence IN ('low', 'medium', 'high')", name="ck_action_plans_confidence"),
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
    # The child's confidence they can do it: low, medium or high. Publishing needs high.
    confidence: Mapped[str | None] = mapped_column(String, nullable=True)
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
        CheckConstraint("outcome IN ('keep', 'done')", name="ck_action_plan_items_outcome"),
        CheckConstraint("reward_given_by IN ('parent', 'clinician')", name="ck_action_plan_items_given_by"),
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
    # Exposure: this plan's wording, empty for the rung's own. Parent instruction: the instruction.
    # Reward: what the reward is.
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Reward only: what it is given for.
    reward_for: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Parent instruction only: whether the child sees it too.
    share_with_child: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=sql("false"), default=False
    )
    # Reward only: was it given. Empty until the parent (or, at the next session, the clinician) says.
    reward_given: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    reward_given_by: Mapped[str | None] = mapped_column(String, nullable=True)  # parent | clinician
    reward_answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set at the next session: keep (carried to the new plan) or done.
    outcome: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sql("now()"))


class Tool(Base):
    """A coping tool or strategy: a technique, or something to learn or watch ("The worry hill").
    Platform-wide, written in the admin app. Action plans pick from this list only."""

    __tablename__ = "tools"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=sql("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    link: Mapped[str | None] = mapped_column(String, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=sql("0"), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=sql("true"), default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sql("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=sql("now()"))
