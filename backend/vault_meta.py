"""
What happened to each file of the Vault: was it posted to Instagram, and did you upload it yourself?

The Vault shows this as labels ("Posted", "Uploaded") and can filter by it, so you do not need separate folders for
"already posted" and "not posted yet". A generated file that was never posted has no label at all.

- Stored in vault_meta.json next to this file (private, in .gitignore), keyed by the file's path inside output/.
- Posting records it automatically (Post page, queue jobs and daily automations); uploading records "uploaded".
- Moving or deleting a file in the app moves / removes its entry.
- Files posted before this existed are filled in once from the finished jobs in jobs.yaml; anything else can be
  marked by hand in the Vault.
"""
import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional

BASE = Path(__file__).resolve().parent
FILE = Path(os.environ.get("APP_VAULT_META") or BASE / "vault_meta.json")
OUTPUT_DIR = BASE / "output"
_lock = threading.Lock()


def configure(out_dir):
    global OUTPUT_DIR
    OUTPUT_DIR = Path(out_dir)


def _load() -> dict:
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _save(d: dict):
    FILE.write_text(json.dumps(d, indent=1), encoding="utf-8")


def key_of(path) -> Optional[str]:
    """The entry name for a file: its path inside output/ (lower-case, so Windows case differences do not matter).
    None for anything outside output/."""
    try:
        rel = Path(path).resolve().relative_to(OUTPUT_DIR.resolve()).as_posix()
    except (ValueError, OSError):
        rel = str(path).replace("\\", "/")                  # "/output/x/y.png", "output\\x\\y.png" or "x/y.png"
        if rel.lower().startswith("/output/"):
            rel = rel[8:]
        elif rel.lower().startswith("output/"):
            rel = rel[7:]
        if rel.startswith("/") or ":" in rel or ".." in rel.split("/"):
            return None
    return rel.casefold() or None


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def mark_uploaded(paths: Iterable):
    with _lock:
        d = _load()
        for p in paths:
            k = key_of(p)
            if k:
                d.setdefault(k, {})["uploaded"] = True
        _save(d)


def mark_posted(paths: Iterable, account: Optional[str] = None, url: Optional[str] = None, when: Optional[str] = None):
    """Call for every file that went out in a post. Files outside output/ (for example uploads in input/) are ignored."""
    with _lock:
        d = _load()
        changed = False
        for p in paths:
            k = key_of(p)
            if not k:
                continue
            e = d.setdefault(k, {})
            e.update(posted=True, posted_at=when or _now(), posted_to=account, post_url=url)
            changed = True
        if changed:
            _save(d)


def set_posted(paths: Iterable, posted: bool):
    """Mark by hand (the Vault's "Mark as posted / not posted")."""
    with _lock:
        d = _load()
        for p in paths:
            k = key_of(p)
            if not k:
                continue
            e = d.setdefault(k, {})
            if posted:
                e.update(posted=True, posted_at=e.get("posted_at") or _now())
            else:
                for f in ("posted", "posted_at", "posted_to", "post_url"):
                    e.pop(f, None)
            if not e:
                d.pop(k, None)
        _save(d)


def info(path, data: Optional[dict] = None) -> dict:
    """{"posted": bool, "posted_at": str|None, "uploaded": bool} for one file."""
    e = (data if data is not None else _load()).get(key_of(path) or "", {})
    return {"posted": bool(e.get("posted")), "posted_at": e.get("posted_at"), "uploaded": bool(e.get("uploaded"))}


def snapshot() -> dict:
    """All entries, read once (use with info(path, data) when listing many files)."""
    return _load()


def is_posted(path) -> bool:
    return info(path)["posted"]


def move(old_path, new_path):
    with _lock:
        d = _load()
        a, b = key_of(old_path), key_of(new_path)
        if a and b and a in d:
            d[b] = d.pop(a)
            _save(d)


def remove(path):
    with _lock:
        d = _load()
        k = key_of(path)
        if k and d.pop(k, None) is not None:
            _save(d)


def backfill_from_jobs(jobs: List[dict]):
    """Once: files that finished jobs already posted get the "Posted" label. Never runs again, so a label you remove
    by hand stays removed."""
    with _lock:
        d = _load()
        if d.get("_backfilled"):
            return
        for j in jobs:
            if j.get("status") == "done" and j.get("posted"):
                paths = j.get("media_paths") or ([j["media"]] if j.get("media") else [])
                for p in paths:
                    k = key_of(p)
                    if k and not d.get(k, {}).get("posted"):
                        d.setdefault(k, {}).update(posted=True, posted_at=str(j.get("finished_at") or _now()), posted_to=None, post_url=None)
        d["_backfilled"] = True
        _save(d)
