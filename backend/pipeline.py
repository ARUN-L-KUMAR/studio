"""
Instagram AI content automation
  generate (HF Spaces) -> caption (GPT) -> add music (ffmpeg) -> upload -> post (Graph API)

Usage:
  python pipeline.py text_to_video  --prompt "a girl walking in a rainy neon city"
  python pipeline.py image_to_video --prompt "slow zoom, cinematic" --image photo.jpg
  python pipeline.py video_to_video --prompt "anime style" --video clip.mp4
  python pipeline.py text_to_image  --prompt "sunset over a calm sea"
  python pipeline.py image_to_image --prompt "make it golden hour" --image photo.jpg
  python pipeline.py face_swap      --prompt "caption idea" --face face.jpg --image scene.jpg
"""
import argparse, glob, hashlib, json, os, random, re, socket, subprocess, tempfile, time
from pathlib import Path

import httpx
import requests
import yaml
from dotenv import load_dotenv
from gradio_client import Client, handle_file

load_dotenv()
# huggingface_hub uses short default time-outs (10s) when looking up a Space; give slow connections more room
os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "30")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "60")
CFG =yaml.safe_load(open("config.yaml", encoding="utf-8"))
OUT = Path("output"); OUT.mkdir(exist_ok=True)


# ---------------------------------------------------------------- 1. Generate
def _fill(params, prompt, image, video, face=None):
    out = {}
    for k, v in params.items():
        if isinstance(v, str):
            if v == "{image}":
                v = handle_file(image)
            elif v == "{video}":
                v = handle_file(video)
            elif v == "{face}":
                v = handle_file(face)
            else:
                v = v.replace("{prompt}", prompt)
        out[k] = v
    return out


def _find_file(result, last=False):
    """Spaces return paths in different shapes; dig out a file path.
    last=True returns the last file instead of the first (e.g. the "after"
    image of a before/after slider)."""
    if isinstance(result, str) and os.path.exists(result):
        return result
    if isinstance(result, dict):
        for key in ("video", "image", "path", "value"):
            if key in result:
                found = _find_file(result[key], last)
                if found:
                    return found
    if isinstance(result, (list, tuple)):
        for item in (reversed(result) if last else result):
            found = _find_file(item, last)
            if found:
                return found
    return None


# ---------------------------------------------------------------- 1. Generate & Token Failover
_HF_STATUS = {"at": 0.0, "valid": {}}   # token -> True/False, from check_hf_tokens()


def check_hf_tokens(force=False, ttl=600):
    """Ask Hugging Face (read-only whoami) which configured tokens are still accepted.
    Results are cached for `ttl` seconds. Returns [{"index": 1, "valid": True}, ...] (no token values).
    A network error counts as 'unknown' and the token is kept as valid so we never drop a good one by mistake."""
    tokens = get_hf_tokens(valid_first=False)
    fresh = time.time() - _HF_STATUS["at"] < ttl and all(t in _HF_STATUS["valid"] for t in tokens)
    if force or not fresh:
        status = {}
        for t in tokens:
            try:
                r = requests.get("https://huggingface.co/api/whoami-v2",
                                 headers={"Authorization": f"Bearer {t}"}, timeout=15)
                status[t] = r.status_code != 401
            except Exception:
                status[t] = True
        _HF_STATUS["valid"] = status
        _HF_STATUS["at"] = time.time()
    return [{"index": i + 1, "valid": _HF_STATUS["valid"].get(t, True)} for i, t in enumerate(tokens)]


def get_hf_tokens(valid_first=True):
    """Retrieve list of configured Hugging Face tokens for automatic failover.
    Supports 1, 2, or as many accounts as desired (HF_TOKENS=hf_1,hf_2,... or HF_TOKEN_1, HF_TOKEN_2, etc.)
    With valid_first=True, tokens known to be rejected (see check_hf_tokens) are dropped, unless all are."""
    tokens = _collect_hf_tokens()
    if valid_first and _HF_STATUS["valid"]:
        good = [t for t in tokens if _HF_STATUS["valid"].get(t, True)]
        if good:
            return good
    return tokens


def _collect_hf_tokens():
    tokens = []
    # 1. Comma-separated list (e.g. HF_TOKENS=hf_1,hf_2,hf_3,hf_4...)
    if os.environ.get("HF_TOKENS"):
        tokens.extend([t.strip() for t in os.environ["HF_TOKENS"].split(",") if t.strip()])
    
    # 2. Standard primary token
    primary = os.environ.get("HF_TOKEN") or os.environ.get("HF_TOKEN_1")
    if primary and primary.strip() and primary.strip() not in tokens:
        tokens.append(primary.strip())
    
    # 3. Backup / secondary aliases
    for alt in ("HF_TOKEN_2", "HF_TOKEN_SECONDARY"):
        b = os.environ.get(alt)
        if b and b.strip() and b.strip() not in tokens:
            tokens.append(b.strip())

    # 4. Numbered tokens (HF_TOKEN_2 up to HF_TOKEN_50)
    for i in range(2, 50):
        val = os.environ.get(f"HF_TOKEN_{i}")
        if val and val.strip() and val.strip() not in tokens:
            tokens.append(val.strip())

    return tokens


# ---------------------------------------------------------------- ZeroGPU quota memory
# When an account runs out of its daily free GPU time, remember it (also across restarts) so the next
# job goes straight to an account that still has quota instead of failing on this one first.
QUOTA_FILE = Path(__file__).resolve().parent / "hf_quota.json"
_QUOTA_DEFAULT_WAIT = 24 * 3600   # ZeroGPU quota comes back 24h after the account first hit its limit


def _token_id(token):
    return hashlib.sha256(token.encode()).hexdigest()[:12]   # never store the token itself


def _load_quota():
    try:
        return json.loads(QUOTA_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_quota(data):
    try:
        QUOTA_FILE.write_text(json.dumps(data), encoding="utf-8")
    except Exception:
        pass


def is_quota_error(err):
    m = str(err).lower()
    return ("zerogpu" in m or "gpu quota" in m or "gpu limit" in m) and any(k in m for k in ("quota", "limit", "exceeded"))


def mark_quota_used_up(token, err):
    """Remember that this account has no GPU quota left. Uses 'try again in H:MM:SS' from the error if present."""
    found = re.search(r"try again in (\d+):(\d+):(\d+)", str(err), re.IGNORECASE)
    wait = int(found[1]) * 3600 + int(found[2]) * 60 + int(found[3]) if found else _QUOTA_DEFAULT_WAIT
    data = _load_quota()
    key = _token_id(token)
    now = time.time()
    if data.get(key, 0) > now:
        # Already marked: the 24h window started at the FIRST time the limit was hit, so don't push it later
        return int(data[key] - now)
    data[key] = now + max(60, wait)
    _save_quota(data)
    return wait


def clear_quota(token):
    data = _load_quota()
    if data.pop(_token_id(token), None) is not None:
        _save_quota(data)


def quota_wait(token):
    """Seconds until this account should have GPU quota again (0 = available)."""
    if not token:
        return 0
    return max(0, int(_load_quota().get(_token_id(token), 0) - time.time()))


def quota_status():
    """[{"index": 1, "wait_seconds": 0}, ...] for every configured account, in Settings order."""
    return [{"index": i + 1, "wait_seconds": quota_wait(t)} for i, t in enumerate(get_hf_tokens(valid_first=False))]


def _fmt_wait(seconds):
    return f"{seconds // 3600}h {seconds % 3600 // 60}m" if seconds >= 3600 else f"{max(1, seconds // 60)} min"


_SPACE_TIMEOUT = httpx.Timeout(connect=30, read=900, write=180, pool=30)


def _is_timeout(err):
    """True for network time-outs (httpx/httpcore ReadTimeout, 'The read operation timed out', ...)."""
    return isinstance(err, (TimeoutError, httpx.TimeoutException)) or "timed out" in str(err).lower()


def _shrink_image(path, max_px):
    """Downscale a big picture before uploading it to a Space (uploads and preprocessing dominate the
    run time for 2-4 MB photos). Returns (path_to_use, temp_file_to_delete_or_None)."""
    if not path or not max_px:
        return path, None
    try:
        from PIL import Image, ImageOps
        with Image.open(path) as im:
            if max(im.size) <= max_px:
                return path, None
            im = ImageOps.exif_transpose(im)
            has_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
            before = Path(path).stat().st_size
            im.thumbnail((max_px, max_px), Image.LANCZOS)
            fd, tmp = tempfile.mkstemp(suffix=".png" if has_alpha else ".jpg")
            os.close(fd)
            if has_alpha:
                im.convert("RGBA").save(tmp, "PNG", optimize=True)
            else:
                im.convert("RGB").save(tmp, "JPEG", quality=93, optimize=True)
        print(f"[gen] resized {Path(path).name}: {before / 1e6:.1f} MB -> {Path(tmp).stat().st_size / 1e6:.1f} MB (max {max_px}px)")
        return tmp, tmp
    except Exception as e:  # never block generation because of an optimisation
        print(f"[warn] could not resize {path}: {e}")
        return path, None


def _is_network_error(err):
    """True when the computer itself can't reach Hugging Face (offline, DNS failure, VPN drop).
    Switching accounts can't fix this, so it must not trigger the account failover."""
    m = str(err).lower()
    return isinstance(err, (socket.gaierror, ConnectionError, httpx.ConnectError)) or any(
        k in m for k in ("getaddrinfo failed", "name or service not known", "temporary failure in name resolution",
                         "nodename nor servname", "network is unreachable", "no route to host", "connection refused")
    )


def _is_input_error(err):
    """True when the Space rejected our parameters or files, as opposed to quota / GPU / network trouble."""
    msg = str(err).lower()
    return isinstance(err, (ValueError, FileNotFoundError)) and any(
        k in msg for k in ("not in the list of choices", "is not a valid", "does not exist", "invalid", "expected")
    )


def account_out_dir(account=None) -> Path:
    """Folder where files for this Instagram account are saved: output/<account folder>/.
    With no account connected (or an unknown one) files go to the plain output folder, as before."""
    try:
        import instagram_api
        if not instagram_api.accounts():
            return OUT
        folder = OUT / instagram_api.account_folder(account)
    except Exception:
        return OUT
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def generate(task, prompt, image=None, video=None, override=None, face=None, status_cb=None, out_dir=None):
    """Run a generation task. Large input pictures are shrunk first (config: generation.max_input_px,
    0 turns it off), which noticeably shortens upload and processing time."""
    max_px = int((CFG.get("generation") or {}).get("max_input_px", 1536) or 0)
    temps = []
    try:
        if (image or face) and max_px:
            if status_cb:
                status_cb("Preparing images...")
            image, t1 = _shrink_image(image, max_px)
            face, t2 = _shrink_image(face, max_px)
            temps = [t for t in (t1, t2) if t]
        return _generate(task, prompt, image, video, override, face, status_cb, out_dir)
    finally:
        for t in temps:
            try:
                os.unlink(t)
            except OSError:
                pass


def _generate(task, prompt, image=None, video=None, override=None, face=None, status_cb=None, out_dir=None):
    t = {**CFG["tasks"][task], **(override or {})}  # override: space/api_name/params
    try:
        check_hf_tokens()   # cached; lets us skip tokens Hugging Face already rejects
    except Exception:
        pass
    all_tokens = get_hf_tokens(valid_first=False)   # Settings order, used for the "Account N" labels
    tokens = get_hf_tokens()
    if not tokens:
        tokens = [None]  # Fallback to anonymous access if no token set

    def label(tk):
        return f"Account {all_tokens.index(tk) + 1}" if tk in all_tokens else "Anonymous"

    # Accounts with GPU quota left go first; used-up ones last (soonest to recover first) as a final resort
    tokens = sorted(tokens, key=quota_wait)
    used_up = [tk for tk in tokens if quota_wait(tk) > 0]
    if used_up and len(used_up) < len(tokens):
        skipped = ", ".join(f"{label(tk)} (back in ~{_fmt_wait(quota_wait(tk))})" for tk in used_up)
        note = f"Skipping {skipped}: GPU quota used up"
        print(f"[gen] {note}")
        if status_cb:
            status_cb(note)

    kwargs = _fill(t["params"], prompt, image, video, face)
    last_err = None

    for idx, token in enumerate(tokens):
        account_label = label(token)
        try:
            msg = f"[gen] {task} on {t['space']} using {account_label}..."
            print(msg)
            if status_cb:
                status_cb(f"Connecting to {t['space']} ({account_label})...")

            result = None
            for attempt in range(3):
                try:
                    client = Client(t["space"], token=token, httpx_kwargs={"timeout": _SPACE_TIMEOUT})
                    result = client.predict(api_name=t["api_name"], **kwargs)
                    break
                except Exception as net_err:
                    # Shared GPU Spaces often time out for a moment; retry the same account before giving up
                    if attempt < 2 and (_is_timeout(net_err) or _is_network_error(net_err)):
                        if _is_network_error(net_err):
                            retry_msg = f"Can't reach Hugging Face (internet or DNS problem), retrying ({attempt + 2}/3)..."
                        else:
                            retry_msg = f"{t['space']} timed out, retrying ({attempt + 2}/3)..."
                        print(f"[gen] {retry_msg}")
                        if status_cb:
                            status_cb(retry_msg)
                        time.sleep(4 * (attempt + 1))
                        continue
                    raise
            path = _find_file(result, last=t.get("pick") == "last")
            if not path:
                raise RuntimeError(f"Could not find output file in: {result}")
            
            ext = Path(path).suffix
            target_dir = Path(out_dir) if out_dir else OUT
            target_dir.mkdir(parents=True, exist_ok=True)
            final = target_dir / f"{task}_{int(time.time())}{ext}"
            Path(path).replace(final)
            print(f"[gen] saved {final} (via {account_label})")
            if token:
                clear_quota(token)
            return str(final)

        except Exception as e:
            last_err = e
            err_str = str(e)
            print(f"[warn] {account_label} encountered error: {err_str[:250]}")

            # No internet / DNS failure affects every account equally: stop and say so, don't cycle accounts
            if _is_network_error(e):
                raise RuntimeError(
                    "Can't reach Hugging Face. Check your internet connection (or VPN / DNS), then try again."
                ) from e

            # A bad input (wrong option value, missing file...) fails the same way on every account,
            # so don't waste time trying the rest of the pool
            if _is_input_error(e):
                raise last_err

            quota_hit = bool(token) and is_quota_error(e)
            if quota_hit:
                wait = mark_quota_used_up(token, err_str)
                print(f"[gen] {account_label} GPU quota used up; skipping it for ~{_fmt_wait(wait)}")

            # Check if we have another token in pool to swap to
            if idx + 1 < len(tokens):
                next_label = label(tokens[idx + 1])
                reason = "GPU quota used up" if quota_hit else "hit an error"
                failover_notice = f"{account_label} {reason}. Auto-swapping to {next_label}..."
                print(f"[HF FAILOVER] {failover_notice}")
                if status_cb:
                    status_cb(failover_notice)
                time.sleep(2)
                continue
            else:
                # All accounts failed or only 1 account configured
                raise last_err


# ---------------------------------------------------------------- 2. Caption
def _parse_json(text):
    """Pull the JSON object out of a model reply, tolerating fences and extra prose."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError(f"No JSON object in caption reply: {text[:200]!r}")
    return json.loads(text[start:end + 1])


def _clean_hashtags(raw, limit):
    """Models sometimes return one string of many tags, tags with spaces, or tags missing the #.
    Turn whatever came back into a clean, de-duplicated list like ["#Cozy", "#CatLover"]."""
    tags = []
    for item in raw or []:
        for word in re.findall(r"\w+", str(item), re.UNICODE):
            tag = "#" + word
            if tag.lower() not in [t.lower() for t in tags]:
                tags.append(tag)
    return tags[:limit]


def make_caption(prompt, media_kind, media_path=None, provider=None, model=None, with_info=False, media_paths=None):
    """
    Write a caption (and a song suggestion) with Gemini, Groq, OpenRouter or OpenAI.
    If media_path is given, vision-capable models look at the actual picture / video frame.
    Returns (caption, song), or (caption, song, {"provider", "model"}) when with_info=True.
    """
    import captioner
    c = CFG["caption"]
    data, used_provider, used_model = captioner.caption_json(
        c, prompt, media_kind, media_path=media_path, provider=provider, model=model, media_paths=media_paths)
    hashtags = _clean_hashtags(data.get("hashtags"), c["max_hashtags"])
    tags = list(dict.fromkeys(hashtags + c.get("my_hashtags", [])))
    full = f"{data.get('caption', prompt)}\n\n.\n.\n{' '.join(tags)}"
    song = data.get("song_suggestion", "")
    if with_info:
        return full, song, {"provider": used_provider, "model": used_model}
    return full, song


# ---------------------------------------------------------------- 3. Music
def _ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def add_music(video_path, track=None):
    """Mix a song into a video. `track` = path of a specific audio file; otherwise a random mp3 from the
    music folder is used (only if music is enabled in config)."""
    m = CFG["music"]
    if track is None:
        if not m["enabled"]:
            return video_path
        tracks = glob.glob(os.path.join(m["folder"], "*.mp3"))
        if not tracks:
            print("[music] no tracks found, skipping")
            return video_path
        track = random.choice(tracks)
    track = str(track)
    out = str(Path(video_path).resolve().parent / f"final_{int(time.time())}_{Path(video_path).name}")   # next to the original
    subprocess.run([
        _ffmpeg(), "-y", "-i", str(video_path), "-stream_loop", "-1", "-i", track,
        "-filter:a", f"volume={m['volume']}", "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("[music] mixed", Path(track).name)
    return out


def make_slideshow(image_paths, seconds_per=3.0, audio=None, volume=None):
    """Turn one or more pictures into a vertical 1080x1920 Reel video, each shown for `seconds_per` seconds
    over a blurred copy of itself (no black bars). If `audio` is given it plays under the slideshow and
    fades out at the end. Returns the path of the new mp4 in the output folder."""
    paths = [str(p) for p in image_paths]
    if not paths:
        raise ValueError("No pictures to build a slideshow from.")
    n = len(paths)
    d = min(10.0, max(1.0, float(seconds_per)))
    total = n * d
    vol = CFG["music"].get("volume", 0.8) if volume is None else volume

    cmd = [_ffmpeg(), "-y"]
    for pth in paths:
        cmd += ["-framerate", "30", "-loop", "1", "-t", f"{d}", "-i", pth]
    if audio:
        cmd += ["-stream_loop", "-1", "-i", str(audio)]

    chains = []
    for i in range(n):
        chains.append(
            f"[{i}:v]split=2[bg{i}][fg{i}];"
            f"[bg{i}]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:6[b{i}];"
            f"[fg{i}]scale=1080:1920:force_original_aspect_ratio=decrease[f{i}];"
            f"[b{i}][f{i}]overlay=(W-w)/2:(H-h)/2,setsar=1,scale=out_range=tv:out_color_matrix=bt709,format=yuv420p,fps=30[v{i}]"
        )
    chains.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[v]")
    cmd += ["-filter_complex", ";".join(chains), "-map", "[v]"]
    if audio:
        fade_at = max(0.0, total - 1.5)
        cmd += ["-map", f"{n}:a:0", "-c:a", "aac", "-af", f"volume={vol},afade=t=out:st={fade_at:.2f}:d=1.5", "-shortest"]
    first = Path(paths[0]).resolve()
    keep_with = first.parent if OUT.resolve() in first.parents or first.parent == OUT.resolve() else OUT   # same folder as the pictures
    out = str(keep_with / f"slideshow_{int(time.time())}.mp4")
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", "-t", f"{total:.2f}", out]
    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if res.returncode != 0 or not Path(out).exists():
        raise RuntimeError("Could not build the slideshow video: " + res.stderr.decode(errors="ignore")[-300:])
    print(f"[slideshow] {n} picture(s) x {d:g}s{' + audio' if audio else ''} -> {out}")
    return out


# ---------------------------------------------------------------- 4. Upload
def upload_public(path):
    """Instagram needs a public URL. Cloudinary free tier works well."""
    import cloudinary, cloudinary.uploader
    cloudinary.config(cloudinary_url=os.environ["CLOUDINARY_URL"])
    kind = "video" if path.endswith(".mp4") else "image"
    res = cloudinary.uploader.upload(path, resource_type=kind)
    return res["secure_url"]


# ---------------------------------------------------------------- 5. Post
def post_to_instagram(url, caption, is_video):
    ig_id = os.environ["IG_USER_ID"]
    token = os.environ["IG_ACCESS_TOKEN"]
    base = f"https://graph.facebook.com/v21.0/{ig_id}"
    payload = {"caption": caption, "access_token": token}
    if is_video:
        payload.update(media_type="REELS", video_url=url)
    else:
        payload.update(image_url=url)
    r = requests.post(f"{base}/media", data=payload); r.raise_for_status()
    creation_id = r.json()["id"]

    for _ in range(40):  # wait for processing
        s = requests.get(f"https://graph.facebook.com/v21.0/{creation_id}",
                         params={"fields": "status_code", "access_token": token}).json()
        if s.get("status_code") == "FINISHED":
            break
        if s.get("status_code") == "ERROR":
            raise RuntimeError(s)
        time.sleep(5)

    r = requests.post(f"{base}/media_publish",
                      data={"creation_id": creation_id, "access_token": token})
    r.raise_for_status()
    print("[post] published, media id:", r.json()["id"])


# ---------------------------------------------------------------- shared job runner
def _real_path(p):
    """Jobs may hold a web path like /output/x.png (set by the UI); turn it into a real file path."""
    p = str(p)
    for prefix, folder in (("/output/", OUT), ("/input/", Path("input"))):
        if p.startswith(prefix):
            target = (folder / p.split("?")[0][len(prefix):]).resolve()
            if folder.resolve() in target.parents:          # no ../ escapes
                return str(target)
            return str(folder / Path(p).name)
    return p


def publish_media(media, caption, is_video=False, media_paths=None, fmt=None, account=None):
    """Post to Instagram. Order of preference: the official API (token), then the saved browser session /
    phone login. Several items (media_paths) are posted as one carousel. Returns {"url": ...}."""
    import instagram_api as official
    paths = [_real_path(p) for p in (media_paths or [])]
    if len(paths) > 1:
        if fmt not in (None, "carousel"):
            raise ValueError("Scheduled posts of several items are posted as a carousel.")
        if official.configured():
            return official.post_carousel(paths, caption, account=account)
        import instagram_direct as D
        return D.post_album(paths, caption)         # website-style carousel with the browser session
    media = _real_path(media)
    if official.configured():
        return (official.post_reel(media, caption, account=account) if is_video
                else official.post_photo(media, caption, account=account))
    if os.environ.get("IG_USERNAME") and os.environ.get("IG_PASSWORD") or os.environ.get("IG_SESSION_ID"):
        from instagram_direct import post_direct
        return post_direct(media, caption, is_video)
    if os.environ.get("IG_ACCESS_TOKEN") and os.environ.get("IG_USER_ID"):
        post_to_instagram(upload_public(media), caption, is_video)
        return {"url": None}
    raise ValueError("No Instagram connection is set up. Add the Instagram API values to .env or connect in Settings.")


def run_job(job, dry_run=None):
    """Full flow for one job dict. Used by CLI, batch runner, scheduler and web UI.
    job keys: task, prompt, image?, video?, face?, override?, caption?, media?, media_paths?, format?, account?
    (account = which connected Instagram API account to post to; empty means the default one)
    If job has 'media' (already generated) generation is skipped.
    If job has 'media_paths' (2-10 items) they are posted together as one carousel.
    If job has 'caption' (already approved) caption generation is skipped."""
    if dry_run is None:
        dry_run = CFG["instagram"]["dry_run"]
    task = job["task"]
    multi = job.get("media_paths") or []
    is_video = task.endswith("video")

    if multi:
        media = _real_path(multi[0])
        is_video = Path(media).suffix.lower() in (".mp4", ".mov", ".m4v")
    else:
        media = job.get("media") or generate(task, job["prompt"], job.get("image"),
                                             job.get("video"), job.get("override"),
                                             job.get("face"), out_dir=account_out_dir(job.get("account")))
        if is_video and not job.get("media"):
            media = add_music(media)
        media = _real_path(media)

    caption, song = job.get("caption"), ""
    if not caption:
        caption, song = make_caption(job["prompt"], "Reel video" if is_video else "photo", media_path=media,
                                     media_paths=[_real_path(p) for p in multi] or None)

    posted = False
    post_url = None
    if not dry_run:
        res = publish_media(media, caption, is_video, media_paths=multi, fmt=job.get("format"), account=job.get("account"))
        posted = True
        post_url = (res or {}).get("url")

    return {"media": media, "caption": caption, "song": song, "posted": posted, "url": post_url}


# ---------------------------------------------------------------- main
if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("task", choices=CFG["tasks"].keys())
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--image")
    ap.add_argument("--video")
    ap.add_argument("--face", help="reference face image (face_swap)")
    a = ap.parse_args()

    res = run_job({"task": a.task, "prompt": a.prompt, "image": a.image,
                   "video": a.video, "face": a.face})
    print("\n--- CAPTION ---\n", res["caption"], "\n--- Suggested song:", res["song"], "\n")
    if res["posted"] is False:
        print("[dry_run] not posted. Set dry_run: false in config.yaml to publish.")
