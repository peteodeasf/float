"""The two instructions the generator gives the model: write the facts, then write the inputs from
the facts.

No family from the pool is quoted here, and none may be. A prompt that shows a case teaches the
model to copy it (docs/solutions/eval-cases-burned-by-putting-them-in-the-prompt.md).

The behavior types are the definitions Dr. Walker confirmed, as the pool README gives them.
"""

FACTS_SYSTEM = """You write made-up families for testing a CBT app for anxious children aged 8 to 17.
The app reads a parent's monitoring log and voice notes and pulls out the anxiety situations, what
the child does in them, and what the parent does to help (accommodations). Your family is the
answer key the app will be scored against, so it must be exact and internally consistent.

Everything you write is fiction. Do not base it on a real person.

You are given the kind of anxiety, the child's name and age, where the family lives, who keeps the
log, and how they write. Write the facts only. The log is written later from your facts.

Return one JSON object and nothing else:

{
  "anxiety": "<short description, e.g. the kind of anxiety and its focus>",
  "situations": [
    {
      "id": "s1",
      "name": "<the situation, in a few words>",
      "fear_level": <0-10, or null if the parent would never give a number for it>,
      "feared_outcome": "<what the child fears will happen, in the child's terms, or null if not known>",
      "behaviors": [{"id": "b1", "type": "avoidance|escape|safety|unclear", "text": "<what the child does>"}],
      "accommodations": [{"id": "a1", "text": "<what the parent or another adult does>"}]
    }
  ],
  "trap_ideas": ["<one or two things the log should contain that could fool the app>"]
}

Behavior types:
- avoidance: the child does not enter the situation.
- escape: the child was in it and leaves when anxiety spikes.
- safety: the child stays but does something to feel safer, including seeking reassurance and
  keeping a parent close.
- unclear: what the parent saw does not say enough to classify.

Rules:
- 2 to 4 situations. 1 to 4 behaviors and 1 to 3 accommodations in each.
- Number ids across the whole family: s1, s2...; b1, b2...; a1, a2... Never reuse one.
- Behaviors are things the child does. Things an adult does are accommodations, never behaviors.
- Include at least one safety behavior. Mix the types; not every family needs every type.
- Leave at least one fear_level or feared_outcome null.
- Situations must be specific to this child and plausible for their age and where they live.
- Write no risk sign: nothing about self-harm, abuse, suicide or danger at home.
- Use American spelling (behavior, color, mom), even for a family outside the US.
"""

INPUTS_SYSTEM = """You write the inputs for a made-up family used to test a CBT app for anxious
children. You are given the facts (the answer key), where the family lives, who keeps the log and
how they write. Write what that parent would type into the app's monitoring log, and a few voice
notes they would say into the app, so that the facts can be recovered from them.

Everything you write is fiction.

Return one JSON object and nothing else:

{
  "monitoring_log": [
    {
      "date": "YYYY-MM-DD",
      "situation": "<the parent's words for where or when it happened>",
      "child_behavior_observed": "<what the parent saw the child do>",
      "parent_response": "<what the parent did>",
      "fear_thermometer": <0-10 or null>,
      "parent_words": null,
      "situation_ref": "<the fact situation id this entry is about>"
    }
  ],
  "voice_notes": [
    {
      "text": "<what the parent said, as speech-to-text writes it: lowercase, no punctuation, ums>",
      "expected": {"refs": ["<every fact id the note mentions>"], "observations": <separate moments described>, "fear_level_said": <the Fear Level said out loud, or null>},
      "trap": "<optional: what in this note could fool the app>"
    }
  ]
}

Rules:
- 6 to 10 log entries over two to three weeks of October 2026. Every situation gets at least one.
- Write in the parent's style, really. Their style beats tidiness: fields can be short, wrong, or
  mixed up the way a real parent's would be.
- Some entries can be words only: then situation, child_behavior_observed and parent_response are
  empty strings, fear_thermometer is null, and parent_words holds what they wrote.
- fear_thermometer is the parent's number for that moment. Near the fact's fear_level, not always
  equal. If the fact's fear_level is null, every entry for that situation has fear_thermometer null.
- Every behavior and accommodation in the facts must be recoverable from the log or the notes. Do
  not add behaviors or situations that are not in the facts.
- Build in the trap ideas you are given.
- 1 to 3 voice notes. Get each note's expected exactly right: it is the answer key.
- No therapy session, transcript or clinician's words.
- Use American spelling (behavior, color, mom, realize), even for a family outside the US.
"""


def facts_message(slot_description: str) -> str:
    return f"The family to write:\n\n{slot_description}"


def inputs_message(slot_description: str, facts_json: str, problems: list[str] | None = None) -> str:
    msg = f"The family:\n\n{slot_description}\n\nThe facts:\n\n{facts_json}"
    if problems:
        msg += ("\n\nAn earlier attempt at these inputs failed these checks. Avoid them:\n- "
                + "\n- ".join(problems))
    return msg
