"""
Official Instagram publishing ("Instagram API with Instagram Login", graph.instagram.com), for ONE OR MORE accounts.

Each account has its own access token (ig_accounts.json). Pictures and videos must be reachable at a public URL, so
each file is uploaded to Cloudinary first (CLOUDINARY_URL in .env, shared by all accounts).

Supports: one photo, one Reel, and a carousel of 2-10 items (pictures and/or videos). It cannot attach Instagram songs.
Tokens last 60 days; each one is renewed automatically about every 20 days.

An account given as None means the default account. The first account is imported from IG_USER_ID / IG_ACCESS_TOKEN
in .env the first time this module is used.
"""
import json
import os
import re
import tempfile
import time
from pathlib import Path

import requests

GRAPH = "https://graph.instagram.com/v26.0"
BASE = Path(__file__).resolve().parent
ACCOUNTS_FILE = BASE / "ig_accounts.json"
REFRESH_AFTER_DAYS = 20
VIDEO_EXTS = (".mp4", ".mov", ".m4v")


class InstagramApiError(RuntimeError):
    pass


# ====================================================================== account storage
def _load() -> dict:
    """{"default": id, "accounts": [{id, username, user_id, token, added_at, refreshed_at}]}.
    Imports the account from .env once, so an existing setup keeps working."""
    try:
        data = json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
        if isinstance(data.get("accounts"), list):
            return data
    except Exception:
        pass
    data = {"default": None, "accounts": []}
    tok = os.environ.get("IG_ACCESS_TOKEN", "").strip()
    uid = os.environ.get("IG_USER_ID", "").strip()
    if tok and uid:
        now = time.time()
        data["accounts"].append({"id": uid, "username": None, "user_id": uid, "token": tok, "added_at": now, "refreshed_at": now})
        data["default"] = uid
        _save(data)
    return data


def _save(data: dict):
    ACCOUNTS_FILE.write_text(json.dumps(data, indent=1), encoding="utf-8")


def accounts() -> list:
    return _load()["accounts"]


def default_id():
    d = _load()
    ids = [a["id"] for a in d["accounts"]]
    return d["default"] if d.get("default") in ids else (ids[0] if ids else None)


def get_account(account=None) -> dict:
    """Find an account by id, or by @username, or the default one."""
    accs = accounts()
    if not accs:
        raise InstagramApiError("No Instagram account is connected. Add one in Settings under Instagram API.")
    if account in (None, "", "default"):
        account = default_id()
    key = str(account).lstrip("@").lower()
    for a in accs:
        if str(a["id"]) == str(account) or (a.get("username") or "").lower() == key:
            return a
    raise InstagramApiError(f"The Instagram account '{account}' is not connected any more. Pick another one.")


def configured() -> bool:
    """At least one account and the Cloudinary link (needed to host pictures)."""
    return bool(accounts()) and bool(os.environ.get("CLOUDINARY_URL", "").strip())


def _fill_missing_usernames():
    """An account imported from .env has no name yet. Ask Instagram once and remember it."""
    for a in accounts():
        if not a.get("username"):
            try:
                info = _call("GET", "me", a["token"], params={"fields": "username"}, timeout=10)
                _remember_username(a, info.get("username"))
            except Exception:
                pass


def public_accounts() -> list:
    """Accounts as the UI sees them: never includes the token."""
    _fill_missing_usernames()
    d = default_id()
    out = []
    for a in accounts():
        age = (time.time() - a["refreshed_at"]) / 86400 if a.get("refreshed_at") else None
        out.append({"id": str(a["id"]), "username": a.get("username"), "default": str(a["id"]) == str(d),
                    "days_left": None if age is None else max(0, round(60 - age))})
    return out


def _creds(account=None):
    a = get_account(account)
    if not a.get("username"):
        _fill_missing_usernames()
        a = get_account(a["id"])
    return str(a["user_id"]), a["token"], a


def add_account(token: str) -> dict:
    """Add (or update) an account from its token alone: Instagram tells us the user id and username."""
    token = token.strip()
    if not token:
        raise InstagramApiError("Paste the access token for the account.")
    info = _call("GET", "me", token, params={"fields": "user_id,username,account_type"})
    uid = str(info.get("user_id") or info.get("id") or "")
    if not uid:
        raise InstagramApiError("Instagram did not say which account this token belongs to.")
    d = _load()
    now = time.time()
    existing = next((a for a in d["accounts"] if str(a["id"]) == uid), None)
    if existing:
        existing.update(token=token, username=info.get("username"), refreshed_at=now)
    else:
        d["accounts"].append({"id": uid, "username": info.get("username"), "user_id": uid, "token": token,
                              "added_at": now, "refreshed_at": now})
    if not d.get("default"):
        d["default"] = uid
    _save(d)
    return {"id": uid, "username": info.get("username"), "account_type": info.get("account_type"), "updated": bool(existing)}


def remove_account(account: str):
    d = _load()
    a = get_account(account)
    d["accounts"] = [x for x in d["accounts"] if str(x["id"]) != str(a["id"])]
    if str(d.get("default")) == str(a["id"]):
        d["default"] = d["accounts"][0]["id"] if d["accounts"] else None
    _save(d)


def account_folder(account=None) -> str:
    """Name of the folder (inside output/) that holds this account's generated files, e.g. "redmedia.inn".
    It is chosen once from the username and then stored, so renaming the account later does not lose the files."""
    acc = get_account(account)
    if not acc.get("username"):
        _fill_missing_usernames()
        acc = get_account(acc["id"])
    if acc.get("folder"):
        return acc["folder"]
    d = _load()
    taken = {a.get("folder") for a in d["accounts"] if a.get("folder")}
    base = re.sub(r"[^A-Za-z0-9._-]", "_", acc.get("username") or str(acc["id"])).strip(". ") or str(acc["id"])
    folder = base if base not in taken else f"{base}_{str(acc['id'])[-4:]}"
    for a in d["accounts"]:
        if str(a["id"]) == str(acc["id"]):
            a["folder"] = folder
    _save(d)
    return folder


def default_folder_name(acc: dict) -> str:
    """The folder name an account gets by default: its username, made safe for a folder name."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", acc.get("username") or str(acc["id"])).strip(". ") or str(acc["id"])


def folder_is_default(acc: dict, folder: str) -> bool:
    """True when `folder` is the account's own folder: its username, or the username plus the short suffix that is
    added when two accounts would otherwise share a name."""
    f, d = (folder or "").casefold(), default_folder_name(acc).casefold()
    return f == d or bool(re.fullmatch(re.escape(d) + r"_\w{1,4}", f))


def unset_folder(account: str) -> str:
    """Unlink: the account goes back to its own folder (named after its username). The folder it was linked to is not
    touched, so its files stay where they are and it becomes a plain custom folder again. Returns the account's folder."""
    acc = get_account(account)
    if folder_is_default(acc, account_folder(acc["id"])):
        raise InstagramApiError("This account already uses its own folder, so there is nothing to unlink.")
    d = _load()
    for a in d["accounts"]:
        if str(a["id"]) == str(acc["id"]):
            a.pop("folder", None)
    _save(d)
    return account_folder(acc["id"])               # chosen again from the username


def folder_owner(folder: str):
    """Which account owns this folder name (or None)."""
    for a in accounts():
        if a.get("folder") == folder:
            return a
    return None


def set_folder(account: str, folder: str) -> str:
    """Point an account at an existing folder name inside output/ (for example one you made yourself)."""
    folder = (folder or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9._ -]{1,64}", folder) or folder.strip(".") == "":
        raise InstagramApiError("Folder names can use letters, numbers, spaces, dots, dashes and underscores.")
    acc = get_account(account)
    owner = folder_owner(folder)
    if owner and str(owner["id"]) != str(acc["id"]):
        raise InstagramApiError(f"That folder already belongs to @{owner.get('username') or owner['id']}.")
    d = _load()
    for a in d["accounts"]:
        if str(a["id"]) == str(acc["id"]):
            a["folder"] = folder
    _save(d)
    return folder


def set_default(account: str):
    d = _load()
    d["default"] = get_account(account)["id"]
    _save(d)


def _remember_username(account: dict, username):
    if username and account.get("username") != username:
        d = _load()
        for a in d["accounts"]:
            if str(a["id"]) == str(account["id"]):
                a["username"] = username
        _save(d)


# ====================================================================== low-level API
def _call(method, path, tok, **kw):
    """Call the API and turn Instagram's error body into a readable message (never including the token)."""
    params = dict(kw.pop("params", {}) or {})
    params["access_token"] = tok
    r = requests.request(method, f"{GRAPH}/{path}", params=params if method == "GET" else None,
                         data={**(kw.pop("data", {}) or {}), "access_token": tok} if method == "POST" else None,
                         timeout=kw.pop("timeout", 60))
    try:
        body = r.json()
    except ValueError:
        raise InstagramApiError(f"Unexpected reply from Instagram (HTTP {r.status_code}).")
    if r.status_code != 200 or "error" in body:
        e = body.get("error", {})
        msg = str(e.get("error_user_msg") or e.get("message") or body)[:300].replace(tok, "<token>")
        code = e.get("code")
        if code in (190, 102) or e.get("type") == "OAuthException" and "token" in msg.lower():
            raise InstagramApiError("Instagram rejected the access token (it expired or was revoked). "
                                    "Generate a new token on developers.facebook.com and paste it in Settings. "
                                    f"({msg})")
        raise InstagramApiError(f"Instagram API error{f' {code}' if code else ''}: {msg}")
    return body


# ====================================================================== pictures and hosting
def prepare_image(path) -> tuple:
    """Instagram's API takes JPEG only. Convert, and keep the picture inside the accepted shape (4:5 to 1.91:1)
    by placing it on a blurred background instead of cropping. Returns (jpeg_path, temp_file_to_delete)."""
    from PIL import Image, ImageFilter, ImageOps
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
    if not 0.8 <= im.width / im.height <= 1.91:
        canvas = ImageOps.fit(im, (1080, 1350)).filter(ImageFilter.GaussianBlur(40))
        fg = im.copy()
        fg.thumbnail((1080, 1350))
        canvas.paste(fg, ((1080 - fg.width) // 2, (1350 - fg.height) // 2))
        im = canvas
    elif max(im.size) > 2048:
        im = im.copy()
        im.thumbnail((2048, 2048))
    fd, tmp = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    im.save(tmp, "JPEG", quality=92)
    return Path(tmp), tmp


def _host(path: Path) -> str:
    """Upload to Cloudinary and return the public https URL."""
    import cloudinary
    import cloudinary.uploader
    cloudinary.config(cloudinary_url=os.environ["CLOUDINARY_URL"].strip())
    kind = "video" if path.suffix.lower() in VIDEO_EXTS else "image"
    try:
        return cloudinary.uploader.upload(str(path), resource_type=kind)["secure_url"]
    except Exception as e:
        raise InstagramApiError(f"Could not upload {path.name} to Cloudinary: {str(e)[:200]}")


def _wait_ready(container_id, tok, what="media", timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = _call("GET", container_id, tok, params={"fields": "status_code,status"})
        code = s.get("status_code")
        if code == "FINISHED":
            return
        if code in ("ERROR", "EXPIRED"):
            raise InstagramApiError(f"Instagram could not process the {what}: {s.get('status') or code}")
        time.sleep(3)
    raise InstagramApiError(f"Instagram took too long to process the {what}.")


def _publish(uid, tok, creation_id, who=""):
    res = _call("POST", f"{uid}/media_publish", tok, data={"creation_id": creation_id}, timeout=120)
    media_id = res.get("id", "")
    permalink = ""
    try:
        permalink = _call("GET", media_id, tok, params={"fields": "permalink"}).get("permalink", "")
    except Exception:
        pass
    print(f"[ig-api] Published{f' on @{who}' if who else ''}: {permalink or media_id}")
    return {"id": str(media_id), "code": "", "url": permalink, "account": who}


# ====================================================================== posting
def post_photo(path, caption: str, account=None) -> dict:
    uid, tok, acc = _creds(account)
    jpg, tmp = prepare_image(path)
    try:
        url = _host(jpg)
    finally:
        os.unlink(tmp)
    c = _call("POST", f"{uid}/media", tok, data={"image_url": url, "caption": caption})["id"]
    _wait_ready(c, tok, "photo")
    return _publish(uid, tok, c, acc.get("username"))


def post_reel(path, caption: str, account=None) -> dict:
    uid, tok, acc = _creds(account)
    url = _host(Path(path))
    c = _call("POST", f"{uid}/media", tok, data={"media_type": "REELS", "video_url": url, "caption": caption}, timeout=120)["id"]
    _wait_ready(c, tok, "Reel", timeout=600)
    return _publish(uid, tok, c, acc.get("username"))


def post_carousel(paths, caption: str, account=None) -> dict:
    """2-10 items (pictures and/or videos) as one swipeable post. Pictures are converted to JPEG; each picture
    outside Instagram's shape is placed on a blurred background rather than cropped. Videos should be MP4."""
    paths = [Path(p) for p in paths]
    if not 2 <= len(paths) <= 10:
        raise InstagramApiError("A carousel needs between 2 and 10 items.")
    uid, tok, acc = _creds(account)
    children, kinds, temps = [], [], []
    try:
        for i, p in enumerate(paths, 1):
            if p.suffix.lower() in VIDEO_EXTS:
                url = _host(p)
                cid = _call("POST", f"{uid}/media", tok, timeout=120,
                            data={"media_type": "VIDEO", "video_url": url, "is_carousel_item": "true"})["id"]
                kinds.append("video")
            else:
                jpg, tmp = prepare_image(p)
                temps.append(tmp)
                url = _host(jpg)
                cid = _call("POST", f"{uid}/media", tok, data={"image_url": url, "is_carousel_item": "true"})["id"]
                kinds.append("picture")
            print(f"[ig-api] carousel item {i}/{len(paths)} created ({kinds[-1]})")
            children.append(cid)
    finally:
        for t in temps:
            try:
                os.unlink(t)
            except OSError:
                pass
    for cid, kind in zip(children, kinds):
        _wait_ready(cid, tok, f"carousel {kind}", timeout=600 if kind == "video" else 240)
    c = _call("POST", f"{uid}/media", tok,
              data={"media_type": "CAROUSEL", "children": ",".join(children), "caption": caption})["id"]
    _wait_ready(c, tok, "carousel")
    return _publish(uid, tok, c, acc.get("username"))


# ====================================================================== posts already on the account
def list_media(account=None, limit: int = 24, after: str = "") -> dict:
    """Recent posts of one account, newest first. Returns {"posts": [...], "next": cursor or None}."""
    uid, tok, acc = _creds(account)
    fields = ("id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,"
              "like_count,comments_count,children{media_type,media_url,thumbnail_url}")
    params = {"fields": fields, "limit": max(1, min(int(limit), 50))}
    if after:
        params["after"] = after
    body = _call("GET", f"{uid}/media", tok, params=params)
    def piece(x):
        """One picture or video of a post: {type, url, thumb}."""
        is_video = x.get("media_type") == "VIDEO"
        return {"type": "video" if is_video else "image", "url": x.get("media_url") or "",
                "thumb": x.get("thumbnail_url") or ("" if is_video else x.get("media_url") or "")}

    posts = []
    for m in body.get("data", []):
        kind = m.get("media_type")
        product = m.get("media_product_type")
        children = (m.get("children") or {}).get("data", [])
        media = [piece(c) for c in children] if children else [piece(m)]
        posts.append({
            "id": m.get("id"),
            "caption": m.get("caption") or "",
            "kind": "carousel" if kind == "CAROUSEL_ALBUM" else "reel" if product == "REELS" else "video" if kind == "VIDEO" else "photo",
            "thumbnail": m.get("thumbnail_url") or m.get("media_url") or "",
            "media": [x for x in media if x["url"] or x["thumb"]],
            "permalink": m.get("permalink") or "",
            "timestamp": m.get("timestamp") or "",
            "likes": m.get("like_count"),
            "comments": m.get("comments_count"),
            "items": len((m.get("children") or {}).get("data", [])) or None,
        })
    nxt = (body.get("paging") or {}).get("cursors", {}).get("after") if (body.get("paging") or {}).get("next") else None
    return {"account": acc.get("username"), "posts": posts, "next": nxt}


# ====================================================================== status and token upkeep
def status(account=None) -> dict:
    """What the Settings card shows for one account. Makes read-only requests."""
    out = {"id": None, "username": None, "account_type": None, "media_count": None, "quota_used": None,
           "quota_total": None, "days_left": None, "default": False, "error": None}
    try:
        uid, tok, acc = _creds(account)
    except InstagramApiError as e:
        out["error"] = str(e)
        return out
    out["id"] = str(acc["id"])
    out["default"] = str(acc["id"]) == str(default_id())
    if acc.get("refreshed_at"):
        out["days_left"] = max(0, round(60 - (time.time() - acc["refreshed_at"]) / 86400))
    try:
        info = _call("GET", "me", tok, params={"fields": "user_id,username,account_type,media_count"})
        _remember_username(acc, info.get("username"))
        out.update(username=info.get("username"), account_type=info.get("account_type"), media_count=info.get("media_count"))
        lim = _call("GET", f"{uid}/content_publishing_limit", tok, params={"fields": "quota_usage,config"})
        d = (lim.get("data") or [{}])[0]
        out.update(quota_used=d.get("quota_usage"), quota_total=(d.get("config") or {}).get("quota_total"))
    except InstagramApiError as e:
        out["error"] = str(e)
    return out


def refresh_token(account=None) -> bool:
    """Ask Instagram for a fresh 60-day token for one account. The token must be at least 24 hours old."""
    uid, tok, acc = _creds(account)
    r = requests.get(f"{GRAPH}/refresh_access_token",
                     params={"grant_type": "ig_refresh_token", "access_token": tok}, timeout=30)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    new = body.get("access_token")
    if r.status_code != 200 or not new:
        msg = str(body.get("error", {}).get("message", r.text))[:200].replace(tok, "<token>")
        print(f"[ig-api] token refresh not possible for @{acc.get('username')}: {msg}")
        return False
    d = _load()
    for a in d["accounts"]:
        if str(a["id"]) == str(acc["id"]):
            a.update(token=new, refreshed_at=time.time())
    _save(d)
    print(f"[ig-api] token renewed for @{acc.get('username')} (~{int(body.get('expires_in', 0)) // 86400} days)")
    return True


def refresh_if_due():
    """Renew every account's token about every 20 days. Does nothing for tokens that are newer than that."""
    for a in accounts():
        if time.time() - a.get("refreshed_at", 0) > REFRESH_AFTER_DAYS * 86400:
            try:
                refresh_token(a["id"])
            except Exception as e:
                print(f"[ig-api] token refresh failed: {str(e)[:120]}")
