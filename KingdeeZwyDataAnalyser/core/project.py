"""Resolve the standalone DataAnalyser workspace."""
from pathlib import Path
import os


def project_root() -> Path:
    configured = os.environ.get("DATA_ANALYSER_ROOT")
    if configured:
        root = Path(configured).expanduser().resolve()
        if not root.is_dir():
            raise ValueError("DATA_ANALYSER_ROOT is not a directory")
        return root
    source_root = Path(__file__).resolve().parents[1]
    if (source_root / "pyproject.toml").is_file():
        return source_root
    for candidate in (Path.cwd(), *Path.cwd().parents):
        if (candidate / "pyproject.toml").is_file() and (candidate / "KingdeeZwyDataAnalyser").is_dir():
            return candidate.resolve()
    raise ValueError("DataAnalyser project directory not found")
