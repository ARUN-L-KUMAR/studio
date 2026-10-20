"""
A small record of every successful post (not dry runs), so the dashboard can show real "Published" numbers.
Stored in publish_log.json next to this file (private, in .gitignore). Only the time, kind, account and link are kept.
"""
import json
import os
import threading
from datetime import datetime, timedelta
from pathlib import Path

FILE = Path(os.environ.get("APP_PUBLISH_LOG") or Path(__file__).resolve().parent / "publish_log.json")
KEEP = 5000
_lock = threading.Lock()


def _load() -> list:
    try:
        data = json.loads(FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def record(kind: str, account=None, url=None):
    """Call once for each post that really went out."""
    entry = {"at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "kind": kind, "account": account, "url": url}
    with _lock:
        items = _load()
        items.append(entry)
        FILE.write_text(json.dumps(items[-KEEP:], indent=1), encoding="utf-8")


def summary(days: int = 7) -> dict:
    """Totals for the dashboard: all time, today, a count for each of the last `days` days (oldest first), and the latest posts."""
    items = _load()
    today = datetime.now().date()
    per_day = {(today - timedelta(days=i)).isoformat(): 0 for i in range(days - 1, -1, -1)}
    for it in items:
        day = str(it.get("at", ""))[:10]
        if day in per_day:
            per_day[day] += 1
    recent = [{k: it.get(k) for k in ("at", "kind", "account", "url")} for it in reversed(items[-8:])]
    return {"total": len(items), "today": per_day[today.isoformat()], "days": list(per_day.values()), "recent": recent}
