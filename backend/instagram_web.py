"""
Post a carousel the way instagram.com does it.

The phone-app style request used by instagrapi is refused for carousels (HTTP 403 login_required), while the
website's own request is accepted. Your saved session ID is a *browser* cookie, so this module speaks the website's
protocol with it: it loads instagram.com once for the page tokens, uploads each picture to
i.instagram.com/rupload_igphoto/fb_uploader_<id>, then publishes them with media/configure_sidecar.

The request shapes below were taken from a real carousel post made on instagram.com.
"""
import json
import os
import random
import re
import string
import tempfile
import time
from pathlib import Path
from urllib.parse import quote, unquote

import requests

WEB = "https://www.instagram.com"
UPLOAD = "https://i.instagram.com"
APP_ID = "936619743392459"     # Instagram web app id
ASBD_ID = "359341"             # constant sent by the web client
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/155.0.0.0 Safari/537.36")


class WebSessionExpired(RuntimeError):
    """The browser session ID is no longer accepted by Instagram."""


class WebPostError(RuntimeError):
    pass


def _rand6():
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))


def normalize_sessionid(raw: str) -> str:
    """The cookie is stored URL-encoded (46654950528%3A...). Accept it either way."""
    return quote(unquote((raw or "").strip().strip("'\"")), safe="")


class WebClient:
    def __init__(self, sessionid: str):
        sid = normalize_sessionid(sessionid)
        if len(sid) < 20:
            raise WebSessionExpired("No browser session ID is saved. Add it in Settings under Instagram Login.")
        self.sessionid = sid
        self.user_id = unquote(sid).split(":")[0]
        self.s = requests.Session()
        self.s.headers.update({"user-agent": UA, "accept-language": "en-US,en;q=0.9"})
        self.s.cookies.set("sessionid", sid, domain=".instagram.com")
        self.s.cookies.set("ds_user_id", self.user_id, domain=".instagram.com")
        self.rollout = ""
        self.jazoest = ""
        self.fb_dtsg = ""
        self.claim = "0"
        self.web_session_id = f"{_rand6()}:{_rand6()}:{_rand6()}"
        self.username = None

    # ------------------------------------------------------------------ plumbing
    @property
    def csrf(self) -> str:
        return self.s.cookies.get("csrftoken", domain=".instagram.com") or self.s.cookies.get("csrftoken") or ""

    def _api_headers(self, extra=None):
        h = {
            "accept": "*/*",
            "origin": WEB,
            "referer": WEB + "/",
            "x-asbd-id": ASBD_ID,
            "x-csrftoken": self.csrf,
            "x-ig-app-id": APP_ID,
            "x-ig-max-touch-points": "0",
            "x-ig-www-claim": self.claim,
            "x-instagram-ajax": self.rollout,
            "x-requested-with": "XMLHttpRequest",
            "x-web-session-id": self.web_session_id,
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
        }
        h.update(extra or {})
        return h

    def _remember_claim(self, response):
        claim = response.headers.get("x-ig-set-www-claim")
        if claim:
            self.claim = claim

    # ------------------------------------------------------------------ step 1: page tokens
    def bootstrap(self):
        """Load instagram.com with the session cookie and read the tokens the page embeds."""
        r = self.s.get(WEB + "/", headers={"accept": "text/html,application/xhtml+xml,*/*;q=0.8"}, timeout=30)
        html = r.text

        def find(pattern):
            m = re.search(pattern, html)
            return next((g for g in (m.groups() if m else []) if g), "")

        self.rollout = find(r'"rollout_hash":"(\w+)"')
        self.jazoest = find(r'jazoest["=:\s]+"?(\d+)')
        self.fb_dtsg = find(r'"dtsg":\{"token":"([^"]*)"') or find(r'DTSGInitialData",\[\],\{"token":"([^"]*)"')
        if not (self.rollout and self.csrf and self.fb_dtsg and self.jazoest):
            raise WebPostError("Could not read the page tokens from instagram.com "
                               f"(rollout={bool(self.rollout)}, csrf={bool(self.csrf)}, dtsg={bool(self.fb_dtsg)}, "
                               f"jazoest={bool(self.jazoest)}). Instagram may have changed its page.")
        print("[ig-web] page tokens read")

    # ------------------------------------------------------------------ step 2: is the session valid?
    def check(self) -> str:
        r = self.s.get(WEB + "/api/v1/accounts/current_user/?edit=true", headers=self._api_headers(), timeout=30)
        self._remember_claim(r)
        if r.status_code in (400, 401, 403) or "login_required" in r.text[:300]:
            snippet = " ".join(r.text[:160].split())
            raise WebSessionExpired(f"Instagram does not accept this browser session ID any more "
                                    f"(HTTP {r.status_code}: {snippet})")
        try:
            self.username = r.json()["user"]["username"]
        except Exception:
            raise WebPostError(f"Unexpected answer while checking the session (HTTP {r.status_code}).")
        print(f"[ig-web] session valid for @{self.username}")
        return self.username

    # ------------------------------------------------------------------ step 3: upload a picture
    def upload_photo(self, path) -> str:
        from PIL import Image
        path = Path(path)
        with Image.open(path) as im:
            width, height = im.size
        data = path.read_bytes()
        upload_id = str(int(time.time() * 1000))
        name = f"fb_uploader_{upload_id}"
        params = json.dumps({"media_type": 1, "upload_id": upload_id,
                             "upload_media_height": height, "upload_media_width": width}, separators=(",", ":"))
        headers = self._api_headers({
            "content-type": "image/jpeg",
            "offset": "0",
            "x-entity-length": str(len(data)),
            "x-entity-name": name,
            "x-entity-type": "image/jpeg",
            "x-instagram-rupload-params": params,
        })
        r = self.s.post(f"{UPLOAD}/rupload_igphoto/{name}", data=data, headers=headers, timeout=120)
        self._remember_claim(r)
        if r.status_code in (401, 403) or "login_required" in r.text[:300]:
            raise WebSessionExpired("Instagram rejected the upload and logged the session out.")
        try:
            ok = r.status_code == 200 and r.json().get("status") == "ok"
        except ValueError:
            ok = False
        if not ok:
            raise WebPostError(f"Upload failed (HTTP {r.status_code}): {r.text[:200]}")
        print(f"[ig-web] uploaded {path.name} as {upload_id} ({width}x{height}, {len(data) // 1024} KB)")
        return upload_id

    # ------------------------------------------------------------------ step 4: publish
    def publish_carousel(self, upload_ids, caption: str) -> dict:
        body = {
            "archive_only": False,
            "caption": caption,
            "children_metadata": [{"upload_id": u} for u in upload_ids],
            "client_sidecar_id": str(int(time.time() * 1000)),
            "disable_comments": "0",
            "like_and_view_counts_disabled": 0,
            "media_share_flow": "creation_flow",
            "source_type": "library",
            "jazoest": self.jazoest,
            "fb_dtsg": self.fb_dtsg,
        }
        headers = self._api_headers({"content-type": "application/json", "sec-fetch-site": "same-origin"})
        r = self.s.post(WEB + "/api/v1/media/configure_sidecar/", data=json.dumps(body, separators=(",", ":")),
                        headers=headers, timeout=120)
        self._remember_claim(r)
        text = r.text[:400]
        if r.status_code in (401, 403) or "login_required" in text:
            raise WebSessionExpired("Instagram rejected the publish request and logged the session out.")
        try:
            payload = r.json()
        except ValueError:
            raise WebPostError(f"Publish failed (HTTP {r.status_code}): {text}")
        if r.status_code != 200 or payload.get("status") != "ok":
            raise WebPostError(f"Publish failed (HTTP {r.status_code}): {text}")
        media = payload.get("media") or {}
        code = media.get("code", "")
        return {"id": str(media.get("pk") or media.get("id") or ""), "code": code,
                "url": f"https://www.instagram.com/p/{code}/" if code else ""}


# ---------------------------------------------------------------------- pictures for the web uploader
def prepare_jpegs(paths):
    """The website uploads JPEG. Convert every picture, placing ones outside Instagram's accepted shape
    (4:5 to 1.91:1) on a blurred 4:5 background; if any picture needs it, all get the same treatment.
    Returns (jpeg_paths, temp_files_to_delete)."""
    from PIL import Image, ImageFilter, ImageOps
    images = []
    for p in paths:
        if Path(p).suffix.lower() in (".mp4", ".mov"):
            raise ValueError("Carousels with videos are not supported yet. Use pictures only.")
        with Image.open(p) as im:
            images.append(ImageOps.exif_transpose(im).convert("RGB"))
    pad = any(not 0.8 <= im.width / im.height <= 1.91 for im in images)
    out, temps = [], []
    for im in images:
        if pad:
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
        out.append(Path(tmp))
        temps.append(tmp)
    return out, temps


def post_carousel(media_paths, caption: str, sessionid: str = None) -> dict:
    """Upload 2-10 pictures and publish them as ONE carousel post."""
    paths = [Path(p) for p in media_paths]
    if not 2 <= len(paths) <= 10:
        raise ValueError("A carousel needs between 2 and 10 pictures.")
    sessionid = sessionid or os.environ.get("IG_SESSION_ID", "")
    client = WebClient(sessionid)
    client.bootstrap()
    client.check()
    jpegs, temps = prepare_jpegs(paths)
    try:
        ids = []
        for jp in jpegs:
            ids.append(client.upload_photo(jp))
            time.sleep(0.4)
        time.sleep(1.5)
        result = client.publish_carousel(ids, caption)
    finally:
        for t in temps:
            try:
                os.unlink(t)
            except OSError:
                pass
    print(f"[ig-web] Published carousel: {result.get('url')}")
    return result
