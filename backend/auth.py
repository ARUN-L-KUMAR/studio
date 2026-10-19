"""
Sign-in for InstaStudio AI.

How it works
- A password is stored as a salted PBKDF2 hash in auth.json (set it with `python set_password.py` or in Settings),
  or given in .env as APP_PASSWORD.
- Signing in sets a signed, HttpOnly session cookie (14 days). Changing the password signs everyone out.
- Everything under /api, /output, /input and /music needs the cookie. The web page itself (the login screen) is public.
- Wrong passwords are rate limited.
- If NO password is set, the app stays open for you on this computer only (a direct request from 127.0.0.1). Any request
  that arrives through a proxy or tunnel (it carries forwarded headers) or from another machine is refused until a
  password exists, so forgetting to set one can't expose the app.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent
AUTH_FILE = Path(os.environ.get("APP_AUTH_FILE") or BASE / "auth.json")
COOKIE = "is_session"
SESSION_DAYS = 14
PBKDF2_ITERATIONS = 600_000
MIN_PASSWORD_LENGTH = 8

PROTECTED_PREFIXES = ("api/", "output/", "input/", "music/")
OPEN_PREFIXES = ("api/auth/",)
FORWARD_HEADERS = ("x-forwarded-for", "x-forwarded-host", "x-real-ip", "cf-connecting-ip", "forwarded", "x-forwarded-proto")

# failed sign-in attempts: per client and overall (in memory, reset on restart)
WINDOW = 15 * 60
MAX_PER_CLIENT = 5
MAX_OVERALL = 40
_fails: dict = {}
_all_fails: list = []

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ====================================================================== storage and hashing
def _load() -> dict:
    try:
        return json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save(data: dict):
    AUTH_FILE.write_text(json.dumps(data, indent=1), encoding="utf-8")
    try:
        os.chmod(AUTH_FILE, 0o600)
    except OSError:
        pass


def make_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def _check_hash(password: str, stored: str) -> bool:
    try:
        _, iters, salt, digest = stored.split("$")
        test = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iters))
        return hmac.compare_digest(test.hex(), digest)
    except Exception:
        return False


def _env_password() -> str:
    return os.environ.get("APP_PASSWORD", "").strip()


def configured() -> bool:
    return bool(_load().get("hash")) or bool(_env_password())


def check_password(password: str) -> bool:
    """The password saved in auth.json wins over APP_PASSWORD in .env."""
    stored = _load().get("hash")
    if stored:
        return _check_hash(password, stored)
    env = _env_password()
    return bool(env) and hmac.compare_digest(hashlib.sha256(password.encode()).digest(), hashlib.sha256(env.encode()).digest())


def set_password(password: str):
    """Save a new password and sign everyone out (the cookie key changes)."""
    d = _load()
    d["hash"] = make_hash(password)
    d["secret"] = secrets.token_hex(32)
    _save(d)


# ====================================================================== session cookie
def _key() -> bytes:
    d = _load()
    secret = d.get("secret")
    if not secret:
        secret = secrets.token_hex(32)
        d["secret"] = secret
        try:
            _save(d)
        except OSError:
            pass
    ident = d.get("hash") or _env_password()
    return hashlib.sha256(f"{secret}|{ident}".encode()).digest()


def _sign(payload: str) -> str:
    return base64.urlsafe_b64encode(hmac.new(_key(), payload.encode(), hashlib.sha256).digest()).decode().rstrip("=")


def make_token() -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"exp": int(time.time()) + SESSION_DAYS * 86400}).encode()).decode().rstrip("=")
    return f"{payload}.{_sign(payload)}"


def valid_token(token: str) -> bool:
    try:
        payload, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _sign(payload)):
            return False
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return int(data["exp"]) > time.time()
    except Exception:
        return False


def is_signed_in(request: Request) -> bool:
    token = request.cookies.get(COOKIE)
    return bool(token) and valid_token(token)


def _https(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "").lower() == "https"


def _set_cookie(request: Request, response: Response):
    response.set_cookie(COOKIE, make_token(), max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax",
                        secure=_https(request), path="/")


# ====================================================================== who is asking
def direct_local(request: Request) -> bool:
    """True only for a request made directly from this computer (not through a proxy or tunnel)."""
    host = request.client.host if request.client else ""
    if host not in ("127.0.0.1", "::1", "localhost"):
        return False
    return not any(h in request.headers for h in FORWARD_HEADERS)


def required(request: Request) -> bool:
    """Is sign-in needed for this request? Yes when a password exists, or when the request isn't plainly local."""
    return configured() or not direct_local(request)


def _client_key(request: Request) -> str:
    fwd = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return fwd or (request.client.host if request.client else "unknown")


def _retry_after(key: str) -> int:
    now = time.time()
    mine = [t for t in _fails.get(key, []) if now - t < WINDOW]
    _fails[key] = mine
    _all_fails[:] = [t for t in _all_fails if now - t < WINDOW]
    waits = []
    if len(mine) >= MAX_PER_CLIENT:
        waits.append(int(WINDOW - (now - mine[0])) + 1)
    if len(_all_fails) >= MAX_OVERALL:
        waits.append(int(WINDOW - (now - _all_fails[0])) + 1)
    return max(waits) if waits else 0


# ====================================================================== the guard (runs before every request)
async def guard(request: Request, call_next):
    path = request.url.path.lstrip("/")
    protected = path.startswith(PROTECTED_PREFIXES) and not path.startswith(OPEN_PREFIXES)

    # Block cross-site form posts: a browser sends Origin on those, and it must match this site
    if request.method not in ("GET", "HEAD", "OPTIONS") and path.startswith("api/"):
        origin = request.headers.get("origin")
        if origin:
            host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
            netloc = urlparse(origin).netloc
            # a dev server on this computer (npm run dev, port 5173) forwards the page's own origin: allow that
            dev_local = (urlparse(origin).hostname or "") in ("localhost", "127.0.0.1", "::1") and direct_local(request)
            extra = [o.strip().rstrip("/") for o in os.environ.get("APP_ALLOWED_ORIGINS", "").split(",") if o.strip()]
            if netloc != host and not dev_local and origin.rstrip("/") not in extra:
                return JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)

    if protected and request.method != "OPTIONS":
        if configured():
            if not is_signed_in(request):
                return JSONResponse({"detail": "Please sign in.", "auth": True}, status_code=401)
        elif not direct_local(request):
            return JSONResponse({"detail": "This server is locked until a password is set (run: python set_password.py).",
                                 "auth": True, "locked": True}, status_code=401)

    response = await call_next(request)
    if protected:
        response.headers["Cache-Control"] = "no-store" if path.startswith("api/") else response.headers.get("Cache-Control", "private")
    return response


# ====================================================================== endpoints
class LoginRequest(BaseModel):
    password: str


class PasswordRequest(BaseModel):
    new: str
    current: str = ""


def _status(request: Request) -> dict:
    cfg = configured()
    need = required(request)
    return {"configured": cfg, "required": need, "authenticated": (is_signed_in(request) if need else True),
            "locked": need and not cfg}


@router.get("/status")
def auth_status(request: Request):
    return _status(request)


@router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    if not configured():
        raise HTTPException(status_code=400, detail="No password is set on this server yet. Run: python set_password.py")
    key = _client_key(request)
    wait = _retry_after(key)
    if wait:
        raise HTTPException(status_code=429, detail=f"Too many wrong attempts. Try again in {wait // 60 + 1} minute(s).",
                            headers={"Retry-After": str(wait)})
    if not check_password(payload.password):
        now = time.time()
        _fails.setdefault(key, []).append(now)
        _all_fails.append(now)
        await asyncio.sleep(0.6)                   # slows down guessing
        left = MAX_PER_CLIENT - len(_fails[key])
        raise HTTPException(status_code=401, detail="That password is not correct." + (f" {left} attempt(s) left." if 0 < left <= 2 else ""))
    _fails.pop(key, None)
    _set_cookie(request, response)
    return {"status": "success"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"status": "success"}


@router.post("/password")
async def change_password(payload: PasswordRequest, request: Request, response: Response):
    cfg = configured()
    if cfg:
        if not is_signed_in(request):
            raise HTTPException(status_code=401, detail="Please sign in.")
        if not check_password(payload.current):
            await asyncio.sleep(0.6)
            raise HTTPException(status_code=400, detail="The current password is not correct.")
    elif not direct_local(request):
        raise HTTPException(status_code=403, detail="A password can only be set from this computer, or with: python set_password.py")
    if len(payload.new) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Use at least {MIN_PASSWORD_LENGTH} characters.")
    if cfg and hmac.compare_digest(payload.new, payload.current):
        raise HTTPException(status_code=400, detail="The new password must be different.")
    set_password(payload.new)
    _set_cookie(request, response)                 # keep this browser signed in; every other session is signed out
    return {"status": "success", "message": "Password saved. Other devices were signed out."}
