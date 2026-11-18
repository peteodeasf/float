"""What the AI proposed for a patient, and what the clinician did with it.

One row each time the AI drafts something. The record shows that a clinician made every decision,
gives Dr. Walker real cases to review, and lets a newer model be checked against what clinicians
actually kept. docs/plans/ai-foundation-and-features.md (part 1, item 1)

This is patient data: it holds what the AI wrote about the patient. Same access rules as the rest of
the record. Deleted with the patient.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

#: The jobs the AI does. New ones are added here.
MONITORING_EXTRACTION = "monitoring_extraction"
CASE_SUMMARY = "case_summary"
SESSION_ANALYSIS = "session_analysis"
STEP_SENTENCE = "step_sentence"            # "the situation without X", which the clinician edits
STEP_SUGGESTIONS = "step_suggestions"      # smaller versions of a situation to pick from
SESSION_NOTE_DRAFT = "session_note_draft"  # a session note written from a recording
VOICE_NOTE_WRITEUP = "voice_note_writeup"  # a parent's spoken or typed note, as observations

#: What happened to it.
PENDING = "pending"            # waiting for the clinician
ACCEPTED = "accepted"          # kept as the AI wrote it
EDITED = "edited"              # kept after the clinician changed it
REJECTED = "rejected"          # the clinician turned it down
REPLACED = "replaced"          # a newer draft of the same thing came along first
NO_DECISION = "no_decision"    # something to read, like the Case Summary; nothing to accept


class AiSuggestion(Base):
    __tablename__ = "ai_suggestions"
    __table_args__ = (
        Index("ix_ai_suggestions_patient", "patient_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    job: Mapped[str] = mapped_column(String, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    #: The first 12 characters of a hash of the instructions the model was given, so a change to a
    #: prompt shows up in the record.
    prompt_fingerprint: Mapped[str] = mapped_column(String(12), nullable=False)
    #: What it was drafted from, as ids: {"session_note_id": ...}, {"monitoring_entry_ids": [...]}.
    source: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output: Mapped[dict] = mapped_column(JSONB, nullable=False)
    #: Who started it. Empty when it ran on its own (the automatic Case Summary updates).
    triggered_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default=PENDING, server_default=PENDING)
    decided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    #: The version kept, when the clinician edited it.
    final: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
