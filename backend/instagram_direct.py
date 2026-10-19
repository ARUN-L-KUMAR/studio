"""
Instagram Direct Login & Publishing via instagrapi
Simulates the official mobile client and uses session caching (ig_session.json)
to prevent repeated logins, avoiding account checkpoints.
"""
import functools
import os
import json
import subprocess
import tempfile
import time
from pathlib import Path
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, ChallengeRequired, TwoFactorRequired, ClientForbiddenError

SESSION_FILE = Path(__file__).resolve().parent / "ig_session.json"

LOGIN_STATE_FILE = Path(__file__).resolve().parent / "ig_login_state.json"
AUTO_LOGIN_COOLDOWN = 30 * 60   # after a failed login, the app waits this long before trying automatically again


def _cooldown_left() -> int:
    try:
        failed_at = json.loads(LOGIN_STATE_FILE.read_text(encoding="utf-8")).get("failed_at", 0)
        return max(0, int(failed_at + AUTO_LOGIN_COOLDOWN - time.time()))
    except Exception:
        return 0


def _mark_login(ok: bool):
    try:
        if ok:
            LOGIN_STATE_FILE.unlink(missing_ok=True)
        else:
            LOGIN_STATE_FILE.write_text(json.dumps({"failed_at": time.time()}), encoding="utf-8")
    except Exception:
        pass


def get_instagram_client(username: str = None, password: str = None, verification_code: str = None, sessionid: str = None,
                         fresh: bool = False, sessionid_only: bool = False):
    """fresh=True ignores the cached session and logs in again (session ID first, then username/password).
    sessionid_only=True never falls back to the password login (used when the user just pasted a session ID, so a
    failure is reported as a session ID problem)."""
    sessionid = sessionid or os.environ.get("IG_SESSION_ID")
    username = username or os.environ.get("IG_USERNAME")
    password = password or os.environ.get("IG_PASSWORD")
    cl = Client()
    cl.delay_range = [2, 5]

    # 1. Try reusing existing cached mobile session
    if SESSION_FILE.exists() and not fresh:
        try:
            cl.load_settings(SESSION_FILE)
            user_id = getattr(cl, "user_id", None)
            if user_id:
                print(f"[ig-direct] Reused existing authenticated mobile session for user ID {user_id}")
                return cl
        except (LoginRequired, Exception) as e:
            print(f"[ig-direct] Cached session expired ({e}), re-authenticating...")

    # 2. Login by sessionid if available (bypasses version/challenge locks completely)
    if sessionid and len(sessionid.strip()) > 20:
        clean_sid = sessionid.strip().strip("'\"")
        print("[ig-direct] Authenticating using Instagram web session ID...")
        try:
            cl.login_by_sessionid(clean_sid)
            cl.account_info()          # login_by_sessionid does not check anything: make a real request
            cl.dump_settings(SESSION_FILE)
            print(f"[ig-direct] Session ID login successful for @{cl.username}! Cached to {SESSION_FILE.name}")
            return cl
        except Exception as sid_err:
            print(f"[ig-direct] sessionid login error: {sid_err}")
            if sessionid_only or not username or not password:
                raise RuntimeError(
                    "Instagram does not accept this session ID. Copy the sessionid cookie again from instagram.com "
                    "(logged in, F12 > Application > Cookies > instagram.com > sessionid), paste only the value, "
                    f"and make sure it is the newest one. ({str(sid_err)[:120]})")
            cl = Client()          # start clean before the password attempt
            cl.delay_range = [2, 5]

    # 3. Direct mobile client login via username & password
    if not username or not password:
        raise ValueError("Instagram credentials required: Provide IG_SESSION_ID or IG_USERNAME & IG_PASSWORD in .env")

    verification_code = verification_code or os.environ.get("IG_VERIFICATION_CODE")
    try:
        if verification_code:
            cl.login(username, password, verification_code=verification_code)
        else:
            cl.login(username, password)
    except TwoFactorRequired:
        raise RuntimeError("Instagram 2FA is enabled on this account. Please enter your 6-digit verification code.")
    except ChallengeRequired as challenge_err:
        raise RuntimeError(f"Instagram security challenge: {challenge_err}. Open Instagram on your phone and tap 'This Was Me', then retry.")
    except Exception as login_err:
        text = str(login_err)
        low = text.lower()
        if "version" in low or "out of date" in low or "update" in low:
            raise RuntimeError("Instagram refused the password login from this app ('app version out of date'). "
                               "Use the browser Session ID in Settings instead.")
        if "bad_password" in low or "incorrect" in low or "password" in low and "wrong" in low:
            raise RuntimeError("Instagram says the username or password is wrong. Check IG_USERNAME and IG_PASSWORD.")
        if "wait" in low or "try again" in low or "too many" in low or "rate" in low:
            raise RuntimeError("Instagram asks you to wait before logging in again (too many attempts). Try again in a while.")
        raise RuntimeError(f"Instagram password login failed: {text[:200]}")

    # 4. Save session to avoid logging in again
    try:
        cl.dump_settings(SESSION_FILE)
        print(f"[ig-direct] Saved fresh session to {SESSION_FILE.name}")
    except Exception as dump_err:
        print(f"[ig-direct] Note: Failed to dump session: {dump_err}")

    return cl

def fresh_login(username: str = None, password: str = None, verification_code: str = None, sessionid: str = None,
                respect_cooldown: bool = False):
    """Log in again ignoring the cached session. Automatic callers pass respect_cooldown=True so a login that keeps
    failing is not hammered (Instagram can lock an account after repeated attempts); the Settings button does not."""
    if respect_cooldown:
        wait = _cooldown_left()
        if wait:
            raise RuntimeError(f"The last automatic login failed, so the app is waiting {wait // 60 + 1} more minute(s) before "
                               "trying again. Press Test and Verify in Settings to try now.")
    try:
        cl = get_instagram_client(username, password, verification_code, sessionid, fresh=True)
    except Exception:
        _mark_login(False)
        raise
    _mark_login(True)
    return cl


def check_connection(username: str = None, password: str = None, verification_code: str = None, sessionid: str = None,
                     sessionid_only: bool = False):
    """Verifies credentials or active session, returning account profile info if successful.
    When the user has just typed a session ID or password, the old saved session is ignored (it may be dead)."""
    explicit = bool(sessionid) or bool(password)
    cl = get_instagram_client(username, password, verification_code, sessionid, fresh=explicit, sessionid_only=sessionid_only)
    try:
        cl.account_info()                                  # a real request: proves the session works
    except (LoginRequired, ClientForbiddenError) as err:
        if not _is_logged_out(err):
            raise
        if explicit:
            raise RuntimeError("Instagram logged this session out right away. Copy a newer sessionid cookie and try again.")
        print("[ig-direct] Saved session is dead, logging in again...")
        cl = fresh_login(username, password, verification_code, sessionid)
        cl.account_info()
    target_user = username or getattr(cl, "username", None) or os.environ.get("IG_USERNAME")
    try:
        user_info = cl.user_info_by_username(target_user)
        SESSION_STATE["expired"] = False
        return {
            "status": "connected",
            "username": user_info.username,
            "full_name": user_info.full_name or user_info.username,
            "media_count": getattr(user_info, "media_count", 0),
            "follower_count": getattr(user_info, "follower_count", 0),
            "session_cached": SESSION_FILE.exists()
        }
    except Exception as e:
        return {
            "status": "connected",
            "username": target_user or "Instagram User",
            "full_name": target_user or "Instagram User",
            "media_count": 0,
            "follower_count": 0,
            "session_cached": SESSION_FILE.exists()
        }

# Configure ffmpeg binary location for MoviePy and instagrapi
try:
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    os.environ["IMAGEIO_FFMPEG_EXE"] = ffmpeg_exe
    # Also add its directory to PATH so any call to 'ffmpeg' succeeds
    ffmpeg_dir = str(Path(ffmpeg_exe).parent)
    if ffmpeg_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
except Exception as e:
    print(f"[ig-direct] Note: Could not auto-configure ffmpeg: {e}")

def extract_video_thumbnail(video_path: Path) -> Path:
    """Extracts a high quality frame from the video to use as cover thumbnail."""
    thumb_path = video_path.with_suffix(".thumb.jpg")
    try:
        import imageio_ffmpeg
        ffmpeg_cmd = imageio_ffmpeg.get_ffmpeg_exe()
        res = subprocess.run([
            ffmpeg_cmd, "-y", "-ss", "00:00:00.500", "-i", str(video_path),
            "-vframes", "1", "-q:v", "2", str(thumb_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if thumb_path.exists() and thumb_path.stat().st_size > 0:
            print(f"[ig-direct] Extracted cover thumbnail: {thumb_path.name}")
            return thumb_path
    except Exception as err:
        print(f"[ig-direct] Thumbnail extraction notice: {err}")
    return None

class InstagramSessionExpired(RuntimeError):
    """Instagram no longer accepts the saved login (it logged the session out)."""


SESSION_STATE = {"expired": False}
_EXPIRED_MESSAGE = ("Instagram logged this session out. Open Settings, paste a fresh sessionid cookie from "
                    "instagram.com (or log in again), then try again.")


def _is_logged_out(err) -> bool:
    """Instagram signals a dead session in two ways: login_required, or a 403 saying user_has_logged_out."""
    if isinstance(err, LoginRequired):
        return True
    text = f"{err} {getattr(err, 'message', '')} {getattr(err, 'logout_reason', '')}".lower()
    return isinstance(err, ClientForbiddenError) and ("logged_out" in text or "login_required" in text)


def _reject_reason(err) -> str:
    """What Instagram said when it rejected a request (the library keeps it on the exception)."""
    parts = []
    for key in ("error_title", "message", "logout_reason", "error_type", "status"):
        val = getattr(err, key, None)
        if val not in (None, "", "fail"):
            parts.append(f"{key}={val}")
    return ", ".join(dict.fromkeys(parts)) or "no reason given"


def _session_guard(retry: bool = True):
    """Turn Instagram's cryptic 'login_required' into a clear message and remember the state for the UI.

    retry=True (reads such as song search): if the saved session is dead, log in again once and retry.
    retry=False (publishing): if Instagram rejects the post, stop. Logging in again cannot fix a rejected post,
    and repeating requests after a rejection only adds more failed attempts."""
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                result = fn(*args, **kwargs)
            except (LoginRequired, ClientForbiddenError) as err:
                if not _is_logged_out(err):
                    raise
                reason = _reject_reason(err)
                resp = getattr(err, "response", None)
                where = f"{getattr(resp, 'status_code', '?')} {str(getattr(resp, 'url', '?')).split('?')[0]}" if resp is not None else "?"
                print(f"[ig-direct] Instagram rejected '{fn.__name__}' with login_required ({reason}) at: {where}")
                if not retry:
                    SESSION_STATE["expired"] = True
                    song = bool(kwargs.get("track_id"))
                    album = fn.__name__ == "post_album"
                    hint = ""
                    if song or album:
                        hint = (" Plain single-photo posts worked before, so the "
                                + ("song and carousel" if song and album else "song" if song else "carousel")
                                + " part is the likely cause. Reconnect in Settings, then try posting without it first.")
                    raise InstagramSessionExpired(
                        f"Instagram rejected the post and logged this session out (reason: {reason}).{hint}"
                    ) from None
                print("[ig-direct] Logging in again...")
                try:
                    fresh_login(respect_cooldown=True)        # also saves the new session file
                except Exception as login_err:
                    SESSION_STATE["expired"] = True
                    raise InstagramSessionExpired(f"{_EXPIRED_MESSAGE} (Automatic login failed: {login_err})") from None
                try:
                    result = fn(*args, **kwargs)
                except (LoginRequired, ClientForbiddenError) as err2:
                    if not _is_logged_out(err2):
                        raise
                    SESSION_STATE["expired"] = True
                    raise InstagramSessionExpired(_EXPIRED_MESSAGE) from None
            SESSION_STATE["expired"] = False
            return result
        return wrapper
    return decorator


def validate_session():
    """One cheap request that tells us whether the saved session still works. Never raises."""
    if not SESSION_FILE.exists():
        return
    try:
        cl = get_instagram_client()
        cl.account_info()
        SESSION_STATE["expired"] = False
    except (LoginRequired, ClientForbiddenError):
        SESSION_STATE["expired"] = True
    except Exception:
        pass   # offline or something else: say nothing rather than guess


FEED_MIN_RATIO, FEED_MAX_RATIO = 0.8, 1.91   # Instagram feed photos must be between 4:5 and 1.91:1


def _fit_for_feed(paths):
    """Pictures outside Instagram's accepted shape are placed on a blurred 4:5 background so nothing is
    cropped. If any picture of a carousel needs it, all are done so the set stays consistent.
    Returns (paths_to_upload, temp_files_to_delete)."""
    from PIL import Image, ImageFilter, ImageOps
    sizes = []
    needs = False
    for p in paths:
        if p.suffix.lower() in (".mp4", ".mov"):
            sizes.append(None)
            continue
        with Image.open(p) as im:
            w, h = ImageOps.exif_transpose(im).size
        sizes.append((w, h))
        if not FEED_MIN_RATIO <= w / h <= FEED_MAX_RATIO:
            needs = True
    if not needs:
        return list(paths), []
    out, temps = [], []
    for p, size in zip(paths, sizes):
        if size is None:
            out.append(p)
            continue
        with Image.open(p) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
        W, H = 1080, 1350
        canvas = ImageOps.fit(im, (W, H)).filter(ImageFilter.GaussianBlur(40))
        fg = im.copy()
        fg.thumbnail((W, H))
        canvas.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
        fd, tmp = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)
        canvas.save(tmp, "JPEG", quality=93)
        out.append(Path(tmp))
        temps.append(tmp)
    print(f"[ig-direct] adjusted {len(temps)} picture(s) to Instagram's 4:5 feed shape")
    return out, temps


def _cleanup(temps):
    for t in temps:
        try:
            os.unlink(t)
        except OSError:
            pass


# Songs found by search, kept so a later "post" request can attach the chosen one by id
_TRACK_CACHE = {}


@_session_guard(retry=True)
def search_tracks(query: str, limit: int = 10):
    """Search Instagram's licensed music catalog. Returns plain dicts for the UI."""
    cl = get_instagram_client()
    out = []
    for t in cl.search_music(query)[:limit]:
        _TRACK_CACHE[str(t.id)] = t
        out.append({
            "id": str(t.id),
            "title": t.title,
            "artist": t.display_artist,
            "duration_ms": t.duration_in_ms,
            "explicit": bool(t.is_explicit),
            "highlights": list(t.highlight_start_times_in_ms or []),   # Instagram's suggested start points
            "cover": str(t.cover_artwork_thumbnail_uri or t.cover_artwork_uri or ""),
            "preview": str(t.progressive_download_url or t.fast_start_progressive_download_url or t.uri or ""),
        })
    return out


def _cached_track(track_id):
    if not track_id:
        return None
    track = _TRACK_CACHE.get(str(track_id))
    if track is None:
        raise ValueError("That song is no longer available (the server restarted). Search for it again and re-select it.")
    return track


def _music_window(track, start_ms, clip_ms):
    """Which part of the song to use: start position and clip length, kept inside the song."""
    duration = int(getattr(track, "duration_in_ms", 0) or 0)
    clip = max(5000, min(int(clip_ms or 30000), 90000))
    if duration:
        clip = min(clip, duration)
    start = max(0, int(start_ms or 0))
    if duration:
        start = min(start, max(0, duration - clip))
    return {"audio_asset_start_time": start, "overlap_duration": clip}


def _result(media):
    code = getattr(media, "code", "")
    url = f"https://www.instagram.com/p/{code}/" if code else ""
    print(f"[ig-direct] Published successfully! Post URL: {url} (ID: {media.pk})")
    return {"id": str(media.pk), "code": code, "url": url}


@_session_guard(retry=False)
def post_direct(media_path: str, caption: str, is_video: bool = None, track_id: str = None,
                start_ms: int = 0, clip_ms: int = 30000):
    """Uploads a video (Reel) or photo directly to Instagram. With track_id, attaches that Instagram song."""
    cl = get_instagram_client()
    path = Path(media_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Media file not found: {media_path}")

    if is_video is None:
        is_video = path.suffix.lower() in (".mp4", ".mov")
    track = _cached_track(track_id)
    window = _music_window(track, start_ms, clip_ms) if track else {}

    print(f"[ig-direct] Uploading {'Reel (Clip)' if is_video else 'Photo'}{' with song' if track else ''}: {path.name}...")
    if track:
        print(f"[ig-direct] song clip: starts at {window['audio_asset_start_time'] / 1000:.0f}s, plays {window['overlap_duration'] / 1000:.0f}s")
    if is_video:
        thumb = extract_video_thumbnail(path)
        thumb = thumb if thumb and thumb.exists() else None
        if track:
            media = cl.clip_upload_with_music(path, caption=caption, track=track, thumbnail=thumb, **window)
        elif thumb:
            media = cl.clip_upload(path, caption=caption, thumbnail=thumb)
        else:
            media = cl.clip_upload(path, caption=caption)
    else:
        fitted, temps = _fit_for_feed([path])
        try:
            if track:
                media = cl.photo_upload_with_music(fitted[0], caption=caption, track=track, **window)
            else:
                media = cl.photo_upload(fitted[0], caption=caption)
        finally:
            _cleanup(temps)
    return _result(media)


def post_album(media_paths, caption: str, track_id: str = None, start_ms: int = 0, clip_ms: int = 30000):
    """Uploads 2-10 pictures as ONE swipeable carousel post, the way instagram.com does it.

    The phone-app carousel request is refused by Instagram (403 login_required), so this uses the website's request
    with your browser session ID (see instagram_web.py). The website has no way to add a song to a carousel."""
    if track_id:
        raise ValueError("A song can't be added to a carousel (Instagram's website has no way to). Post without a song, "
                         "or use a Slideshow Reel, or post a single photo with the song.")
    import instagram_web as web
    if any(Path(p).suffix.lower() in (".mp4", ".mov") for p in media_paths):
        raise ValueError("Videos in a carousel need the Instagram API. Use pictures only, or set up the Instagram API in Settings.")
    try:
        result = web.post_carousel([Path(p) for p in media_paths], caption)
    except web.WebSessionExpired as e:
        SESSION_STATE["expired"] = True
        raise InstagramSessionExpired(f"{_EXPIRED_MESSAGE} ({e})") from None
    SESSION_STATE["expired"] = False
    return result
