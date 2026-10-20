"""
How long each pipeline really takes on this server, and when it was last used, from finished runs only.
The dashboard shows these as "typical time" and "last used" (nothing is guessed). Stored in usage_stats.json next to
this file (private, in .gitignore); only task names, durations and times are kept.
"""
import json
import os
import statistics
import threading
from datetime import datetime
from pathlib import Path

FILE = Path(os.environ.get("APP_USAGE_STATS") or Path(__file__).resolve().parent / "usage_stats.json")
KEEP = 10                      # runs remembered per pipeline
_lock = threading.Lock()


def _load() -> dict:
    try:
        data = json.loads(FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def record_run(task: str, seconds: float):
    """Call once when a generation finished successfully."""
    with _lock:
        data = _load()
        entry = data.setdefault(task, {"runs": []})
        entry["runs"] = (entry.get("runs", []) + [round(float(seconds), 1)])[-KEEP:]
        entry["last_used"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        FILE.write_text(json.dumps(data, indent=1), encoding="utf-8")


def summary() -> dict:
    """{task: {"median_seconds": float, "runs": int, "last_used": "YYYY-MM-DD HH:MM:SS"}}"""
    out = {}
    for task, e in _load().items():
        runs = e.get("runs") or []
        if runs:
            out[task] = {"median_seconds": round(statistics.median(runs), 1), "runs": len(runs), "last_used": e.get("last_used")}
    return out
