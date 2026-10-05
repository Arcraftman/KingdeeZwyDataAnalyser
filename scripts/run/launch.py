"""Run KingdeeZwyDataAnalyser directly from this source checkout."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from KingdeeZwyDataAnalyser.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
