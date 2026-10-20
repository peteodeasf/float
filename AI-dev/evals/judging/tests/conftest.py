import sys
from pathlib import Path

JUDGING = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(JUDGING.parent / "runner"))
sys.path.insert(0, str(JUDGING))
