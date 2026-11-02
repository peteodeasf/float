"""What a college student agrees to when signing up: Peter's text of 2026-11-02, word for word.
docs/plans/codesign-signup.md ("College students")

The one copy of the wording, like codesign_form.py is for the high school permission form. The
college page on floatcbt.com fetches it from the server, and the copy emailed to the student is
built from it. Each college sign-up stores AGREEMENT_VERSION, so a record says which wording was
agreed to.

Change the wording here only, and the version changes with it.
"""
import hashlib
import json

from app.services import codesign_form

# Blocks, in order, in the same shapes as codesign_form.py: {"h": heading}, {"p": paragraph},
# {"ul": [bullets]}.
BLOCKS = [
    {"h": "What signing up entails:"},
    {"ul": [
        "Small groups of students, led by two members of the Float team.",
        "You'll share your opinions on apps you use and give feedback on early designs for Float.",
        "This is product research, not a counseling session, so we won't ask about your own mental "
        "health and you can skip any question.",
        "We record the session (audio and video) so our notes are accurate.",
        "Recordings and notes are only used by the Float team to improve the app. We may quote "
        "comments in internal reports, but never with your name or anything that identifies you.",
        "Recordings are stored securely. We never sell or share personal information.",
    ]},
    {"h": "Payment"},
    {"p": "Students who attend the session receive a $60 gift card after completing full session."},
    {"h": "Taking part is voluntary"},
    {"p": "You can leave the session or stop taking part at any time, for any reason. You can withdraw, "
          "or ask us to delete your information, at any time by emailing sally@floatcbt.com."},
]

# The two boxes under the text. Key: the answer's field on the form and in the database. Both must be
# ticked to sign up (Peter, 2026-11-02).
BOXES = {
    "agrees_to_recording": "I agree to the session being recorded as described above.",
    "agrees_to_take_part": "I have read this information and agree to take part.",
}

_TEMPLATE = {"blocks": BLOCKS, "boxes": BOXES}

# The date of Peter's text, then a short hash of every word above, so any edit gives a new version.
AGREEMENT_VERSION = "2026-11-02-" + hashlib.sha256(
    json.dumps(_TEMPLATE, sort_keys=True).encode()).hexdigest()[:8]


def agreement() -> dict:
    """The text and the boxes, for the page to show."""
    return {**_TEMPLATE, "version": AGREEMENT_VERSION}


def as_paragraphs() -> list[str]:
    """The text as plain paragraphs, for the emailed copy, built the same way as the parent's copy."""
    return codesign_form.paragraphs(BLOCKS)
