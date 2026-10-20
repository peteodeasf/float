"""The check that no test case is copied into an AI prompt (AI-dev/evals/check_no_cases_in_prompts.py).

A case in a prompt stops testing anything, and nothing noticed the three times it happened
(docs/solutions/eval-cases-burned-by-putting-them-in-the-prompt.md). CI runs the check on the real
repository. These tests run it on a small made-up repository, so they show the check itself works:
if it passed everything, CI would stay green and prove nothing.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "AI-dev" / "evals"))

import check_no_cases_in_prompts as check  # noqa: E402

CASE = "Mia ate her lunch in the library again because the cafeteria was too loud for her"


def fake_repo(tmp_path, prompt_source, cases):
    (tmp_path / "backend/app").mkdir(parents=True)
    (tmp_path / "backend/app/feature.py").write_text(prompt_source)
    families = tmp_path / "AI-dev/evals/pool/families"
    families.mkdir(parents=True)
    (families / "fam-test-01.json").write_text(json.dumps(
        {"id": "fam-test-01", "inputs": {"monitoring_log": [{"text": t} for t in cases]}}))
    return tmp_path


def test_a_case_planted_in_a_prompt_fails(tmp_path, capsys):
    """The job the check exists for: a case's words pasted into a prompt are caught and named."""
    root = fake_repo(tmp_path, f'PROMPT = """Sort the note. For example: {CASE}."""\n', [CASE])
    assert check.main(["--root", str(root)]) == 1
    out = capsys.readouterr().out
    assert "AI-dev/evals/pool/families/fam-test-01.json#fam-test-01" in out
    assert "backend/app/feature.py:1" in out


def test_a_clean_prompt_passes(tmp_path):
    """No false alarm when the prompt and the case share only ordinary short phrases."""
    prompt = 'PROMPT = """Read the note about the child and list what they did at lunch."""\n'
    assert check.main(["--root", str(fake_repo(tmp_path, prompt, [CASE]))]) == 0


def test_a_case_in_an_fstring_prompt_fails(tmp_path):
    """Several prompts are built by functions returning f-strings (monitoring_capture._prompt)."""
    source = f'def _prompt(name):\n    return f"""Hello {{name}}. Example: {CASE}."""\n'
    assert check.main(["--root", str(fake_repo(tmp_path, source, [CASE]))]) == 1


def test_case_text_in_a_docstring_is_not_a_prompt(tmp_path):
    """Docstrings never reach the model, and they are where code explains a case it handles."""
    source = f'def f():\n    """{CASE}"""\n    return 1\n'
    assert check.main(["--root", str(fake_repo(tmp_path, source, [CASE]))]) == 0


def test_spacing_capitals_and_curly_quotes_do_not_hide_a_copy(tmp_path):
    """A pasted case is often reflowed or retyped; that must not be enough to get past the check."""
    case = "I’ll just be on my own again and nobody will even notice I am gone"
    prompt = 'P = """e.g. "i\'ll just be on my own   again,\n and NOBODY will even notice"."""\n'
    assert check.main(["--root", str(fake_repo(tmp_path, prompt, [case]))]) == 1


def test_six_shared_words_is_not_a_match():
    """RUN_WORDS is 7 because at 6 the downward arrow template matched cases never copied in."""
    prompts = [check.Text("p", "What will happen if you feel yucky?")]
    cases = [check.Text("c", "What will happen if you feel left out at lunch?")]
    assert check.find_matches(prompts, cases) == []


def test_every_allowed_case_is_still_in_its_prompt():
    """The allowed list is for cases known to be in a prompt. One taken out of the prompt must come
    off the list, or the list quietly lets it back in later."""
    matched = {m.case for m in check.find_matches(check.prompt_texts(check.REPO),
                                                  check.case_texts(check.REPO))}
    assert check.ALLOWED <= matched, check.ALLOWED - matched
