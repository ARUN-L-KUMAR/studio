"""
Custom folders and PIN locks for the Media Vault.

How it works
- A folder is a plain sub-folder of output/. Every Instagram account has one, and you can make your own.
- Any folder can be locked with a PIN or password (4 to 32 characters). Only a salted PBKDF2 hash is stored, in
  folder_locks.json (keep it out of git; it is in .gitignore).
- Unlocking sets a signed HttpOnly cookie that opens that folder for 30 minutes in that browser. "Lock now" closes it
  again. Changing or removing the PIN closes it on every device.
- While a folder is locked the server withholds its file list, refuses to move or delete its files, and refuses to
  serve /output/<folder>/... , so knowing a file's address is not enough.
- Wrong PINs are rate limited (5 per 15 minutes for each folder and client).
- This sits on top of the app login (auth.py): it is a second lock for the folders you want kept private.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import auth
import instagram_api

BASE = Path(__file__).resolve().parent
LOCK_FILE = Path(os.environ.get("APP_FOLDER_LOCKS_FILE") or BASE / "folder_locks.json")
OUTPUT_DIR = BASE / "output"          # web_server.py points this at its own output folder with configure()

COOKIE = "is_unlock"
UNLOCK_MINUTES = 30
MIN_PIN, MAX_PIN = 4, 32
NAME_RE = re.compile(r"[A-Za-z0-9._ -]{1,64}")
RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}

WINDOW = 15 * 60
MAX_FAILS = 5
_fails: dict = {}
_file_lock = threading.Lock()

router = APIRouter(prefix="/api/folders", tags=["folders"])


def configure(out_dir):
    global OUTPUT_DIR
    OUTPUT_DIR = Path(out_dir)


# ====================================================================== storage
def _load() -> dict:
    try:
        d = json.loads(LOCK_FILE.read_text(encoding="utf-8"))
    except Exception:
        d = {}
    d.setdefault("locks", {})
    return d


def _save(d: dict):
    LOCK_FILE.write_text(json.dumps(d, indent=1), encoding="utf-8")
    try:
        os.chmod(LOCK_FILE, 0o600)
    except OSError:
        pass


def _key(d: dict) -> bytes:
    """Cookie signing key; made once and kept in folder_locks.json."""
    if not d.get("secret"):
        d["secret"] = secrets.token_hex(32)
        _save(d)
    return hashlib.sha256(bytes.fromhex(d["secret"])).digest()


def _id(name: str) -> str:
    return name.casefold()               # Windows treats Photos and photos as one folder, so a lock must too


def _fingerprint(entry: dict) -> str:
    return hashlib.sha256(entry["hash"].encode()).hexdigest()[:16]


def is_locked(name: str) -> bool:
    return bool(name) and _id(name) in _load()["locks"]


def locked_names() -> list:
    return [v["name"] for v in _load()["locks"].values()]


# ====================================================================== which folder does a path point into
def folder_of(rel: str) -> str:
    """The top-level folder of output/ that a path points into ("" for a file directly inside output/)."""
    try:
        base = OUTPUT_DIR.resolve()
        target = (base / unquote(rel)).resolve()
        parts = target.relative_to(base).parts
    except (ValueError, OSError):
        return ""
    if len(parts) > 1 or (len(parts) == 1 and target.is_dir()):
        return parts[0]
    return ""


def resolve_folder(name: str) -> Optional[str]:
    """The real name of an existing folder of output/ (matching ignores case), or None."""
    name = (name or "").strip()
    if not name or "/" in name or "\\" in name or not OUTPUT_DIR.exists():
        return None
    for d in OUTPUT_DIR.iterdir():
        if d.is_dir() and d.name.casefold() == name.casefold():
            return d.name
    return None


def valid_name(raw: str) -> str:
    name = (raw or "").strip()
    if not NAME_RE.fullmatch(name) or name.strip(".") == "" or name.endswith(".") or name.startswith("."):
        raise HTTPException(status_code=400, detail="Use 1 to 64 letters, numbers, spaces, dots, dashes or underscores for the folder name.")
    if name.casefold() in RESERVED or name.casefold() == "unassigned":
        raise HTTPException(status_code=400, detail="That name is reserved. Choose another one.")
    return name


def _name_taken(name: str) -> bool:
    if resolve_folder(name):
        return True
    for a in instagram_api.accounts():              # an account's folder may not exist on disk until its first file is saved
        try:
            if instagram_api.account_folder(a["id"]).casefold() == name.casefold():
                return True
        except instagram_api.InstagramApiError:
            pass
    return False


# ====================================================================== unlock cookie
def _read_grants(request: Request) -> dict:
    token = request.cookies.get(COOKIE)
    if not token:
        return {}
    try:
        payload, sig = token.split(".", 1)
        expected = base64.urlsafe_b64encode(hmac.new(_key(_load()), payload.encode(), hashlib.sha256).digest()).decode().rstrip("=")
        if not hmac.compare_digest(sig, expected):
            return {}
        grants = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        now = time.time()
        return {k: v for k, v in grants.items() if isinstance(v, list) and len(v) == 2 and v[0] > now}
    except Exception:
        return {}


def _write_grants(request: Request, response: Response, grants: dict):
    payload = base64.urlsafe_b64encode(json.dumps(grants).encode()).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(hmac.new(_key(_load()), payload.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    response.set_cookie(COOKIE, f"{payload}.{sig}", max_age=UNLOCK_MINUTES * 60, httponly=True, samesite="lax",
                        secure=auth._https(request), path="/")


def is_unlocked(request: Request, name: str) -> bool:
    entry = _load()["locks"].get(_id(name))
    if not entry:
        return True                      # no PIN on this folder
    grant = _read_grants(request).get(_id(name))
    return bool(grant) and grant[1] == _fingerprint(entry)


def lock_state(request: Request, name: str) -> str:
    """"none" (no PIN), "locked" (PIN, not entered yet) or "open" (PIN entered in this browser)."""
    if not is_locked(name):
        return "none"
    return "open" if is_unlocked(request, name) else "locked"


def require_open(request: Request, name: str):
    """Raise 423 when the folder has a PIN that has not been entered in this browser."""
    if name and not is_unlocked(request, name):
        raise HTTPException(status_code=423, detail=f"The folder “{name}” is locked. Enter its PIN first.")


def _grant(request: Request, response: Response, name: str):
    entry = _load()["locks"].get(_id(name))
    if not entry:
        return
    grants = _read_grants(request)
    grants[_id(name)] = [time.time() + UNLOCK_MINUTES * 60, _fingerprint(entry)]
    _write_grants(request, response, grants)


def _revoke(request: Request, response: Response, name: str):
    grants = _read_grants(request)
    if grants.pop(_id(name), None) is not None:
        _write_grants(request, response, grants)


# ====================================================================== PIN handling
def _check_pin_format(pin: str):
    if not (MIN_PIN <= len(pin or "") <= MAX_PIN):
        raise HTTPException(status_code=400, detail=f"Use {MIN_PIN} to {MAX_PIN} characters for the PIN.")


def _verify(request: Request, name: str, pin: str):
    """Check a PIN for a locked folder, with a limit on wrong guesses."""
    key = (_id(name), auth._client_key(request))
    now = time.time()
    mine = [t for t in _fails.get(key, []) if now - t < WINDOW]
    _fails[key] = mine
    if len(mine) >= MAX_FAILS:
        wait = int(WINDOW - (now - mine[0])) + 1
        raise HTTPException(status_code=429, detail=f"Too many wrong PINs. Try again in {wait // 60 + 1} minute(s).",
                            headers={"Retry-After": str(wait)})
    entry = _load()["locks"].get(_id(name))
    if entry and auth._check_hash(pin or "", entry["hash"]):
        _fails.pop(key, None)
        return
    mine.append(now)
    time.sleep(0.6)                      # slows down guessing (these handlers run in a worker thread)
    left = MAX_FAILS - len(mine)
    raise HTTPException(status_code=403, detail="That PIN is not correct." + (f" {left} attempt(s) left." if 0 < left <= 2 else ""))


def _set_lock(name: str, pin: str):
    with _file_lock:
        d = _load()
        d["locks"][_id(name)] = {"name": name, "hash": auth.make_hash(pin)}
        _save(d)


def _remove_lock(name: str):
    with _file_lock:
        d = _load()
        if d["locks"].pop(_id(name), None) is not None:
            _save(d)


# ====================================================================== guard for /output/<folder>/...
async def guard(request: Request, call_next):
    path = request.url.path.lstrip("/")
    if path.startswith("output/") and _load()["locks"]:
        name = folder_of(path[len("output/"):])
        if name and is_locked(name):
            if not is_unlocked(request, name):
                return JSONResponse({"detail": "This folder is locked.", "folder_locked": True}, status_code=423)
            response = await call_next(request)
            response.headers["Cache-Control"] = "no-store"     # a locked folder's pictures must not stay in the browser cache
            return response
    return await call_next(request)


# ====================================================================== endpoints
class CreateRequest(BaseModel):
    name: str
    pin: str = ""


class PinRequest(BaseModel):
    pin: str = ""


class NewPinRequest(BaseModel):
    new: str
    current: str = ""


class CurrentPinRequest(BaseModel):
    current: str = ""


def _existing(name: str) -> str:
    folder = resolve_folder(name)
    if not folder:
        raise HTTPException(status_code=404, detail="That folder does not exist.")
    return folder


@router.post("")
def create_folder(payload: CreateRequest, request: Request, response: Response):
    name = valid_name(payload.name)
    if _name_taken(name):
        raise HTTPException(status_code=409, detail="A folder with that name already exists.")
    if payload.pin:
        _check_pin_format(payload.pin)
    (OUTPUT_DIR / name).mkdir()
    if payload.pin:
        _set_lock(name, payload.pin)
        _grant(request, response, name)          # you just chose the PIN, so this browser starts unlocked
    return {"status": "success", "name": name, "locked": bool(payload.pin)}


@router.delete("/{name}")
def delete_folder(name: str, request: Request):
    folder = _existing(name)
    owner = instagram_api.folder_owner(folder)
    if owner:
        raise HTTPException(status_code=400, detail=f"This is the folder of @{owner.get('username') or owner['id']}, so it can't be deleted here.")
    require_open(request, folder)
    if any((OUTPUT_DIR / folder).iterdir()):
        raise HTTPException(status_code=400, detail="Only empty folders can be deleted. Move or delete its files first.")
    (OUTPUT_DIR / folder).rmdir()
    _remove_lock(folder)
    return {"status": "success"}


@router.post("/{name}/unlock")
def unlock(name: str, payload: PinRequest, request: Request, response: Response):
    folder = _existing(name)
    if is_locked(folder):
        _verify(request, folder, payload.pin)
        _grant(request, response, folder)
    return {"status": "success"}


@router.post("/{name}/lock")
def lock_now(name: str, request: Request, response: Response):
    folder = _existing(name)
    _revoke(request, response, folder)
    return {"status": "success"}


@router.post("/{name}/pin")
def set_pin(name: str, payload: NewPinRequest, request: Request, response: Response):
    """Add a PIN to a folder, or change its PIN (the current one is needed then)."""
    folder = _existing(name)
    if is_locked(folder):
        _verify(request, folder, payload.current)
    _check_pin_format(payload.new)
    _set_lock(folder, payload.new)
    _grant(request, response, folder)            # other browsers are locked out: their unlock no longer matches
    return {"status": "success"}


@router.post("/{name}/pin/remove")
def remove_pin(name: str, payload: CurrentPinRequest, request: Request, response: Response):
    folder = _existing(name)
    if is_locked(folder):
        _verify(request, folder, payload.current)
        _remove_lock(folder)
        _revoke(request, response, folder)
    return {"status": "success"}
