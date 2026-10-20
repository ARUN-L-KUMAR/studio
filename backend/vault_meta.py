"""
What happened to each file of the Vault: was it posted to Instagram, and did you upload it yourself?

The Vault shows this as labels ("Posted", "Uploaded") and can filter by it, so you do not need separate folders for
"already posted" and "not posted yet". A generated file that was never posted has no label at all.

- Stored in vault_meta.json next to this file (private, in .gitignore), keyed by the file's path inside output/.
- Posting records it automatically (Post page, queue jobs and daily automations); uploading records "uploaded".
- Custom labels: names you make yourself ("Taniya", "Best of", "Ads"...), put on any files, used to filter the Vault.
  The list of labels is kept under the "_labels" entry; each file entry holds its own "labels" list.
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
    """{"posted": bool, "posted_at": str|None, "uploaded": bool, "labels": [names]} for one file."""
    e = (data if data is not None else _load()).get(key_of(path) or "", {})
    return {"posted": bool(e.get("posted")), "posted_at": e.get("posted_at"), "uploaded": bool(e.get("uploaded")), "labels": list(e.get("labels") or [])}


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


# ---------------------------------------------------------------------------------------------------- custom labels
COLORS = ["emerald", "sky", "violet", "pink", "amber", "rose", "teal", "slate"]
MAX_LABELS = 50
MAX_NAME = 30


def _name(raw) -> str:
    n = " ".join(str(raw or "").split())                    # one space between words, no tabs or line breaks
    if not n:
        raise ValueError("Give the label a name.")
    if len(n) > MAX_NAME:
        raise ValueError(f"A label can have at most {MAX_NAME} characters.")
    if not n.isprintable():
        raise ValueError("A label can only use normal letters, numbers and symbols.")
    return n


def _registry(d: dict) -> dict:
    reg = d.get("_labels")
    if not isinstance(reg, dict):
        reg = d["_labels"] = {}
    return reg


def label_list() -> List[dict]:
    """Every label you made, A to Z: [{"name", "color"}]."""
    reg = _load().get("_labels")
    reg = reg if isinstance(reg, dict) else {}
    return sorted(({"name": v["name"], "color": v.get("color", COLORS[0])} for v in reg.values()), key=lambda v: v["name"].casefold())


def create_label(name: str, color: Optional[str] = None) -> dict:
    n = _name(name)
    with _lock:
        d = _load()
        reg = _registry(d)
        if n.casefold() in reg:
            raise ValueError(f"A label named “{reg[n.casefold()]['name']}” already exists.")
        if len(reg) >= MAX_LABELS:
            raise ValueError(f"You can have at most {MAX_LABELS} labels. Delete one you no longer use.")
        reg[n.casefold()] = {"name": n, "color": color if color in COLORS else COLORS[len(reg) % len(COLORS)]}
        _save(d)
        return dict(reg[n.casefold()])


def update_label(name: str, new_name: Optional[str] = None, color: Optional[str] = None) -> dict:
    """Rename and / or recolor a label; the files that have it follow."""
    with _lock:
        d = _load()
        reg = _registry(d)
        cur = reg.get(str(name or "").casefold())
        if not cur:
            raise KeyError("That label does not exist.")
        old = cur["name"]
        if color is not None:
            if color not in COLORS:
                raise ValueError("Choose one of the offered colors.")
            cur["color"] = color
        if new_name is not None and _name(new_name) != old:
            n = _name(new_name)
            if n.casefold() != old.casefold() and n.casefold() in reg:
                raise ValueError(f"A label named “{reg[n.casefold()]['name']}” already exists.")
            del reg[old.casefold()]
            cur["name"] = n
            reg[n.casefold()] = cur
            for k, e in d.items():
                if k != "_labels" and isinstance(e, dict) and old in (e.get("labels") or []):
                    e["labels"] = [n if x == old else x for x in e["labels"]]
        _save(d)
        return dict(cur)


def delete_label(name: str) -> int:
    """Delete a label everywhere. Returns how many files had it. The files themselves are not touched."""
    with _lock:
        d = _load()
        reg = _registry(d)
        cur = reg.pop(str(name or "").casefold(), None)
        if not cur:
            raise KeyError("That label does not exist.")
        n = 0
        for k in list(d):
            e = d[k]
            if k != "_labels" and isinstance(e, dict) and cur["name"] in (e.get("labels") or []):
                e["labels"] = [x for x in e["labels"] if x != cur["name"]]
                if not e["labels"]:
                    e.pop("labels")
                if not e:
                    d.pop(k)
                n += 1
        _save(d)
        return n


def set_labels(paths: Iterable, add: Iterable[str] = (), remove: Iterable[str] = ()) -> int:
    """Put labels on files and / or take them off. A label that does not exist yet is an error (create it first)."""
    with _lock:
        d = _load()
        reg = _registry(d)
        def canon(names):
            out = []
            for raw in names:
                v = reg.get(str(raw or "").casefold())
                if not v:
                    raise KeyError(f"The label “{raw}” does not exist.")
                out.append(v["name"])
            return out
        add_l, rem_l = canon(add), canon(remove)
        changed = 0
        for p in paths:
            k = key_of(p)
            if not k:
                continue
            e = d.setdefault(k, {})
            before = list(e.get("labels") or [])
            now = [x for x in before if x not in rem_l] + [x for x in add_l if x not in before and x not in rem_l]
            if now:
                e["labels"] = now
            else:
                e.pop("labels", None)
            if not e:
                d.pop(k, None)
            changed += now != before
        _save(d)
        return changed


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
