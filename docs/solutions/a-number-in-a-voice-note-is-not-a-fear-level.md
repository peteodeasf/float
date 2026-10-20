# A number in a parent's note was taken as a Fear Level

## Symptom
A voice note or quick note saying "at 8pm" could save a Fear Level of 8. The check that the model
did not invent the number (`_said` in `backend/app/services/monitoring_capture.py`) only asked
whether the number appeared anywhere in the parent's words.

## Root cause
Parents' notes are full of numbers that are not ratings: times ("at 8:15", "left at 7 10"), counts
("three dogs", "three times"), durations ("twenty minutes"), ages ("a six-year-old"). The eval pool
marks these as traps in many families (`AI-dev/evals/pool/families/`, the `trap` field).

## Fix
`_said_as_rating` takes a number only when it is said the way a rating is said: "a seven" / "an
eight" (with "about", "like", "maybe" before it), "6 out of 10", "7/10", "Fear Level: 6", "rated it
a 4", "a 6 or 7". And only when what comes straight after it is on a short allowed list: the end, a
punctuation mark not followed by a digit, or words such as "out", "maybe", "already", "when".

## How to avoid it next time
- Choose the direction of the mistake. A missed rating costs little: the Fear Level stays empty and
  the parent is asked to tap one. A wrong rating is a made-up clinical number. So the check lists
  what may follow a rating, rather than listing nouns that may not ("minute", "dogs", ...), which
  can never be complete.
- Use the pool's traps as test examples, written in your own short words. Never put them in a
  prompt (`eval-cases-burned-by-putting-them-in-the-prompt.md`).
