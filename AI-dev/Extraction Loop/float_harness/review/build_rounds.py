"""Build Dr. Walker's two extraction review rounds as files the seed script loads.

    cd backend
    railway run --service floatcbt -- .venv/bin/python "../AI-dev/Extraction Loop/float_harness/review/build_rounds.py"

Runs the app's extraction (the same prompt and call as Analyze with AI) and writes:

  review/disagreements.json  Round 1. Each of the 18 test cases is run RUNS times. Where the AI's
                             most common answer for a situation differs from the confirmed June
                             answer, she sees both and says which is right.
  review/samples_round.json  Round 2. Each note in samples.json is run once, and she marks every
                             part of the AI's answer: each situation and accommodation right or
                             wrong, each behavior's type.

Everything here is made up, so both files are committed. The answers the AI gave are saved next to
them in review/outputs_<stamp>.json.

Then create the rounds (needs the database tunnel; see AI-dev/scripts/db.py):

    python AI-dev/scripts/seed_review_round.py extraction-disagreements-1 "AI-dev/Extraction Loop/float_harness/review/disagreements.json" "Dr. Walker" "Peter"
"""
import concurrent.futures as cf
import datetime
import json
import pathlib
import sys
from collections import Counter

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import accuracy  # noqa: E402
import extractor  # noqa: E402

RUNS = 3
TYPES = ("avoidance", "safety", "escape", "unclear")
TYPE_OPTIONS = [{"v": t, "label": t.title()} for t in TYPES] + [{"v": "remove", "label": "Not a behavior"}]
RIGHT_WRONG = [{"v": "right", "label": "Right"}, {"v": "wrong", "label": "Wrong"}]
WHICH = [
    {"v": "june", "label": "My June answer is right"},
    {"v": "ai", "label": "The AI’s answer is right"},
    {"v": "neither", "label": "Neither"},
]


def _log(note):
    return [{"situation": e.situation, "fear": e.fear_thermometer,
             "child": e.child_behavior_observed, "parent": e.parent_response}
            for e in extractor.entries_from_note(note)]


def _run(prompt, case):
    _, out = extractor.extract(prompt, case)
    return out or {"situations": []}


def _lines(situation):
    if situation is None:
        return ["(not listed)"]
    lines = [f'{b.get("type")}: {b.get("description")}' for b in situation.get("behaviors", [])]
    return lines or ["(no behaviors)"]


def _types(situation):
    return frozenset(b.get("type") for b in situation.get("behaviors", [])) if situation else None


def disagreements(cases, outputs):
    items = []
    for case in cases:
        gold = accuracy.merge_same_name(case["situations"])
        per_run = []  # for each run: gold index -> the AI's matched situation (or None)
        for out in outputs[case["case_id"]]:
            ai = accuracy.merge_same_name(out["situations"])
            matches, _, _ = accuracy.align_situations(gold, ai)
            found = {gi: ai[oi] for gi, oi, _ in matches}
            per_run.append([found.get(gi) for gi in range(len(gold))])

        rows = []
        for gi, g in enumerate(gold):
            answers = [run[gi] for run in per_run]
            common, times = Counter(_types(a) for a in answers).most_common(1)[0]
            # Only where the TYPES differ. Where only the number of behaviors differs (one
            # safety behavior in June, four in the AI's answer) or the AI combined two situations
            # into one, it is not a question about what kind of behavior it is, and it would
            # lengthen her review, and Peter has said she is already overloaded.
            if common is None or common == _types(g) or times < 2:
                continue
            shown = next(a for a in answers if _types(a) == common)
            rows.append({
                "id": f"s{gi + 1}",
                "text": g["name"],
                "detail": f"The AI gave this answer in {times} of {len(answers)} runs.",
                "compare": [
                    {"label": "Your June answer", "lines": _lines(g)},
                    {"label": "The AI’s answer", "lines": _lines(shown)},
                ],
                "options": WHICH,
            })
        if rows:
            items.append({
                "key": f'case-{case["case_id"]}',
                "situation": case["title"],
                "log": _log(case["source_note"]),
                "rows": rows,
                "no_add": True,
            })
    return {
        "title": "Where the AI and your June answers disagree",
        "instructions": (
            "Each card shows a parent’s note, the answer you confirmed in June, and the answer "
            "the AI gives today. For each one, choose <b>My June answer is right</b>, <b>The AI’s "
            "answer is right</b>, or <b>Neither</b>. If it could be read either way, say so in the "
            "comments. That is as useful as a choice."
        ),
        "items": items,
    }


def samples_round(samples, outputs):
    items = []
    for s in samples:
        out = outputs[s["id"]][0]
        rows = []
        for si, sit in enumerate(out.get("situations", []), start=1):
            rating = sit.get("fear_rating")
            rows.append({"id": f"s{si}", "text": sit.get("name") or "",
                         "detail": "Situation" + (f" · fear {rating}/10" if rating is not None else " · no rating"),
                         "options": RIGHT_WRONG})
            for bi, b in enumerate(sit.get("behaviors", []), start=1):
                rows.append({"id": f"s{si}b{bi}", "text": b.get("description") or "",
                             "detail": f'What the child did · the AI said: {b.get("type")}',
                             "proposed": b.get("type"), "options": TYPE_OPTIONS})
            for ai_, a in enumerate(sit.get("accommodations", []), start=1):
                rows.append({"id": f"s{si}a{ai_}", "text": a.get("description") or "",
                             "detail": "What the adult did (accommodation)", "options": RIGHT_WRONG})
        items.append({
            "key": s["id"],
            "situation": s["title"],
            "log": _log(s["note"]),
            "rows": rows,
            "add_placeholder": "Anything the AI missed",
        })
    return {
        "title": "Check the AI’s reading of these notes",
        "instructions": (
            "These notes are made up. Under each is how the AI read it. Mark each situation and "
            "each accommodation <b>Right</b> or <b>Wrong</b>. For each thing the child did, click the "
            "type it should be. The dashed button is the AI’s choice, so click it if you agree. "
            "Add anything the AI missed, and use the comments for anything else."
        ),
        "items": items,
    }


def main():
    fixtures = json.loads((HERE.parent / "tests" / "fixtures.json").read_text())["cases"]
    samples = json.loads((HERE / "samples.json").read_text())["cases"]

    # --from=outputs_<stamp>.json rebuilds the rounds from answers already saved, with no API calls.
    saved = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--from=")), None)
    if saved:
        outputs = {(int(k) if k.isdigit() else k): v for k, v in json.loads((HERE / saved).read_text()).items()}
        return write(fixtures, samples, outputs)

    prompt = extractor.app_prompt()
    jobs = [(c["case_id"], c) for c in fixtures for _ in range(RUNS)]
    jobs += [(s["id"], {"source_note": s["note"]}) for s in samples]
    outputs: dict = {}
    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_run, prompt, case): key for key, case in jobs}
        for n, f in enumerate(cf.as_completed(futures), start=1):
            outputs.setdefault(futures[f], []).append(f.result())
            print(f"{n}/{len(jobs)}", end="\r", flush=True)

    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    (HERE / f"outputs_{stamp}.json").write_text(json.dumps(outputs, indent=2, ensure_ascii=False))
    write(fixtures, samples, outputs)


def write(fixtures, samples, outputs):
    one = disagreements(fixtures, outputs)
    two = samples_round(samples, outputs)
    (HERE / "disagreements.json").write_text(json.dumps(one, indent=2, ensure_ascii=False))
    (HERE / "samples_round.json").write_text(json.dumps(two, indent=2, ensure_ascii=False))
    print(f"round 1: {len(one['items'])} cases, {sum(len(i['rows']) for i in one['items'])} disagreements")
    print(f"round 2: {len(two['items'])} notes, {sum(len(i['rows']) for i in two['items'])} things to mark")


if __name__ == "__main__":
    main()
