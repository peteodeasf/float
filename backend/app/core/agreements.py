"""The terms of use and the BAA people accept during setup.

**Placeholder text.** Neither document has been written by a lawyer yet. Replace the body and
change the version together: a new version means the text people accepted has changed, and the
acceptance record keeps which version each person agreed to.

docs/plans/clinician-practice-onboarding.md
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Agreement:
    document: str
    version: str
    title: str
    body: str


TERMS = Agreement(
    document="terms",
    version="draft-2026-09-16",
    title="Terms of use",
    body=(
        "DRAFT. This is placeholder text and not the final terms of use.\n\n"
        "You will use Float only to support the treatment of patients in your care, keep your "
        "sign-in details to yourself, and tell Float straight away if you think someone else has "
        "used your account."
    ),
)

BAA = Agreement(
    document="baa",
    version="draft-2026-09-16",
    title="Business Associate Agreement",
    body=(
        "DRAFT. This is placeholder text and not the final Business Associate Agreement.\n\n"
        "Float will protect the patient information your practice stores in it as HIPAA requires, "
        "use it only to provide the service, and tell your practice about any breach."
    ),
)

BY_DOCUMENT = {a.document: a for a in (TERMS, BAA)}


def required_for(is_practice_owner: bool) -> list[Agreement]:
    """Everyone accepts the terms for themselves. The BAA is signed once, for the practice, by
    the person setting it up."""
    return [TERMS, BAA] if is_practice_owner else [TERMS]
