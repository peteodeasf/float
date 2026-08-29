import uuid
from datetime import datetime, date
from sqlalchemy import String, DateTime, Date, Integer, ForeignKey, ARRAY, Index, text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class PractitionerProfile(Base):
    __tablename__ = "practitioner_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    credentials: Mapped[str | None] = mapped_column(String, nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )


class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String, nullable=True)
    anxiety_presentations: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_name: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_email: Mapped[str | None] = mapped_column(String, nullable=True)
    parent_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    teen_email: Mapped[str | None] = mapped_column(String, nullable=True)
    teen_invited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Parental consent to connect the child into the app. Gates the teen invite.
    child_connect_consent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    consent_source: Mapped[str | None] = mapped_column(String, nullable=True)  # 'parent_form' | 'clinician'
    primary_practitioner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("practitioner_profiles.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )


class ParentPatientLink(Base):
    __tablename__ = "parent_patient_links"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    parent_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patient_profiles.id"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    phone_number: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()")
    )


class PatientAccessGrant(Base):
    """Which clinicians may open which patient.

    Before this existed, any clinician could open any patient in their institution: the lookup
    filtered on organization_id and nothing else. Access is now explicit - a clinician sees a
    patient because someone granted it, or because they are an admin of the institution.

    Revoking sets revoked_at rather than deleting the row, so who had access when stays answerable.
    A partial unique index keeps one live grant per (patient, practitioner) while still allowing a
    grant to be given again after it was revoked.
    """

    __tablename__ = "patient_access_grants"
    __table_args__ = (
        Index(
            "uq_patient_access_grants_live",
            "patient_id",
            "practitioner_id",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
        Index("ix_patient_access_grants_practitioner", "practitioner_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()")
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patient_profiles.id"), nullable=False
    )
    practitioner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("practitioner_profiles.id"), nullable=False
    )
    # Carried here so a grant can be scoped without joining back to the patient.
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    # Null means the migration created it from primary_practitioner_id.
    granted_by_practitioner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("practitioner_profiles.id"), nullable=True
    )
    revoked_by_practitioner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("practitioner_profiles.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PatientAccessLog(Base):
    """Who opened which patient record, and when.

    PatientAccessGrant controls who MAY. This records who DID. HIPAA requires the second, and a
    patient asking for a list of everyone who saw their file cannot be answered without it.

    Written from get_patient_for_practitioner, which every clinician read of a patient goes through
    — so a route added later is covered without anyone remembering.

    Plan: docs/plans/patient-access-log.md
    """

    __tablename__ = "patient_access_log"
    __table_args__ = (
        Index("ix_patient_access_log_patient", "patient_id", "occurred_at"),
        Index("ix_patient_access_log_user", "user_id", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patient_profiles.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    practitioner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("practitioner_profiles.id"), nullable=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    # What they were doing: the request method and path.
    method: Mapped[str | None] = mapped_column(String, nullable=True)
    path: Mapped[str | None] = mapped_column(String, nullable=True)
    # 'grant' or 'admin'. Institution admins bypass grants, so without this you cannot tell
    # ordinary access from an admin opening a record they were never granted.
    via: Mapped[str] = mapped_column(String, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
