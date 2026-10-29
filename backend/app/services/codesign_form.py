"""The co-design permission form: Peter's text of 2026-10-21. docs/plans/codesign-signup.md

The one copy of the wording. The permission page on floatcbt.com fetches it from the server, and the
copy emailed to the parent is built from it, so the page and the copy cannot say different things.
Each answered form stores FORM_VERSION, so a record says which wording was agreed to.

Change the wording here only, and the version changes with it.
"""
import hashlib
import json

# Blocks, in order. {"h": heading}, {"p": paragraph}, {"ul": [bullets]}, {"dl": [[label, text]]}.
# {session1} and {session2} are filled with the teen's two dates ("Tuesday, November 3 at 12pm
# Eastern"). Nothing else about the teen goes into this text.
ABOUT = [
    {"h": "About this session"},
    {"p": "We are asking your permission for your child to take part in a Float co-design session. "
          "Please read this form and ask us any questions before you decide."},
    {"p": "Float is a company building an app to help children and teens work through anxiety "
          "together with their therapist and parents. The app is still in development and is not yet "
          "used with patients."},
    {"p": "In a co-design session, young people share their ideas and opinions to help us design the "
          "app. Your child does not need any experience with anxiety to take part."},
    {"p": "The session is run by the Float team."},
    {"h": "What your child will do"},
    {"p": "Your child will take part in two online focus groups with other teens their age, led by the "
          "Float team. We will ask for their opinions on:"},
    {"ul": [
        "The apps they love, and why",
        "What feels supportive to them in stressful situations, and what doesn’t",
        "Their own ideas for how Float should look and work",
    ]},
    {"dl": [
        ["Date and time", "Session 1: {session1}. Session 2: {session2}."],
        ["Location", "Online. We will email you the link before each session."],
        ["Length", "45-60 minutes per session"],
        ["Group size", "Up to 5 other teens, ages 13 to 17"],
        ["Adults present", "Float team members"],
    ]},
    {"p": "Your child can share as much or as little as they like."},
    {"h": "Taking part is voluntary"},
    {"p": "You decide whether your child can take part. Your child also decides. If either of you says "
          "no, your child will not take part."},
    {"ul": [
        "Your child can skip any question or activity.",
        "Your child can take a break or stop at any time, for any reason.",
        "You can withdraw your permission at any time.",
        "Saying no or stopping will not affect your child's relationship with Float.",
    ]},
    {"p": "If your child stops, we will delete their notes and recordings if you ask us to."},
    {"h": "Possible discomforts"},
    {"p": "Some teens may feel shy sharing ideas in a group. Your child can skip any activity or take a "
          "break, and a staff member will check in if they seem uncomfortable."},
    {"h": "Recording and privacy"},
    {"p": "We will take written notes and photos of the work the group creates, such as sketches and "
          "sticky notes. We will only audio or video record the session if you and your child agree "
          "below."},
    {"ul": [
        "Only the Float team will see notes, photos and recordings.",
        "We use first names only during the session. We remove names from notes and anything we "
        "write up.",
        "We do not sell or share this information with anyone outside Float.",
    ]},
    {"p": "We will ask everyone in the group to keep what others say private. We cannot promise that "
          "every participant will do so."},
    {"h": "How we use your child's ideas"},
    {"p": "We will use the ideas, feedback and sketches from the session to design and improve Float. "
          "By agreeing to this form, you agree that Float may use these ideas in its products without "
          "further payment or credit beyond the thank-you gift."},
    # Peter, 2026-10-29: the sentence about using short quotes, and its yes/no line, are removed.
    {"p": "We will not use your child's name, face or voice in any public material."},
    {"h": "Thank-you gift and questions"},
    {"p": "Your child will receive $60 at the end of the second session. They will receive it even if "
          "they stop early."},
    {"p": "If you have questions before, during or after the session, contact Sally McCarthy at "
          "sally@floatcbt.com."},
    {"p": "We will give you a copy of this form to keep."},
]

TITLE = "Float Co-Design Session: Parent/Guardian Permission"

PARENT_HEADING = "Parent or guardian permission"
PARENT_INTRO = "Please check one box for each line."
# Key: the answer's field on the form and in the database.
PARENT_QUESTIONS = {
    "parent_consents": "I give permission for my child to take part in the co-design session.",
    "parent_allows_recording": "The session may be audio or video recorded.",
}
PARENT_CONFIRM = ("I confirm that I am this child's parent or legal guardian, I am at least 18 years "
                  "old, I have read this form, and I have had the chance to ask questions.")

# Peter, 2026-10-29: the teen agreement is dropped (it made the form too long). In its place, one
# box on the parent's part. The teen takes part only if the parent says yes and ticks it.
CHILD_WANTS = "My child wants to participate in this initiative."

_TEMPLATE = {
    "title": TITLE, "about": ABOUT,
    "parent": {"heading": PARENT_HEADING, "intro": PARENT_INTRO, "questions": PARENT_QUESTIONS,
               "child_wants": CHILD_WANTS, "confirm": PARENT_CONFIRM},
}

# The date of Peter's text, then a short hash of every word above, so any edit gives a new version.
FORM_VERSION = "2026-10-29-" + hashlib.sha256(
    json.dumps(_TEMPLATE, sort_keys=True).encode()).hexdigest()[:8]


def _fill(blocks: list[dict], dates: list[str]) -> list[dict]:
    def fill(text: str) -> str:
        return text.replace("{session1}", dates[0]).replace("{session2}", dates[1])

    out = []
    for b in blocks:
        if "ul" in b:
            out.append({"ul": [fill(x) for x in b["ul"]]})
        elif "dl" in b:
            out.append({"dl": [[label, fill(text)] for label, text in b["dl"]]})
        else:
            out.append({k: fill(v) for k, v in b.items()})
    return out


def form_for(dates: list[str]) -> dict:
    """The whole form with the teen's two dates filled in, for the page to show."""
    return {**_TEMPLATE, "about": _fill(ABOUT, dates), "version": FORM_VERSION}


def _paragraphs(blocks: list[dict]) -> list[str]:
    out = []
    for b in blocks:
        if "ul" in b:
            out.extend(f"\u2022 {x}" for x in b["ul"])
        elif "dl" in b:
            out.extend(f"{label}: {text}" for label, text in b["dl"])
        else:
            out.append(next(iter(b.values())))
    return out


def as_paragraphs(dates: list[str]) -> list[str]:
    """The form's information part as plain paragraphs, for the emailed copy."""
    return _paragraphs(_fill(ABOUT, dates))

