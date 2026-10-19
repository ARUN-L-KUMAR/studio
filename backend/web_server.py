"""
InstaStudio AI - High Performance FastAPI Backend Server
Provides full REST API and static UI serving for Instagram AI Automation.
"""
import os
import re
import sys
import threading
import glob
import json
import time
import shutil
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yaml
from dotenv import load_dotenv

import pipeline as P
import instagram_api
import auth
from urllib.parse import unquote
import captioner
from batch import load_jobs, save_jobs, execute

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
INPUT_DIR = BASE_DIR / "input"
MUSIC_DIR = BASE_DIR / "music"

OUTPUT_DIR.mkdir(exist_ok=True)
INPUT_DIR.mkdir(exist_ok=True)
MUSIC_DIR.mkdir(exist_ok=True)

app = FastAPI(title="InstaStudio AI", version="2.0.0")

# Only this app's own addresses may call the API from a browser. Add your public address in .env, for example
# APP_ALLOWED_ORIGINS=https://studio.example.com
_origins = ["http://127.0.0.1:8000", "http://localhost:8000", "http://127.0.0.1:5173", "http://localhost:5173"]
_origins += [o.strip() for o in os.environ.get("APP_ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sign-in: every /api, /output, /input and /music request needs the session cookie (see auth.py)
app.middleware("http")(auth.guard)
app.include_router(auth.router)

# In-memory status for currently active background generation
active_generation = {
    "is_generating": False,
    "progress": 0,
    "current_step": "idle",
    "job_id": None,
    "result": None,
    "error": None,
    "started_at": None,
}

# --- Models ---
class CaptionRequest(BaseModel):
    prompt: str = ""
    media_kind: str = "video"
    tone: Optional[str] = None
    language: Optional[str] = None
    media_url: Optional[str] = None   # e.g. /output/file.png: lets vision models look at the picture
    media_urls: Optional[List[str]] = None   # all pictures of a carousel (the AI sees up to 4)
    provider: Optional[str] = None    # gemini | groq | openrouter | openai
    model: Optional[str] = None

class AiKeysRequest(BaseModel):
    gemini: Optional[str] = None
    groq: Optional[str] = None
    openrouter: Optional[str] = None
    openai: Optional[str] = None

class CaptionTestRequest(BaseModel):
    provider: str
    model: Optional[str] = None

class DirectPostRequest(BaseModel):
    media_path: str
    caption: str
    is_video: bool
    dry_run: Optional[bool] = None
    media_paths: Optional[List[str]] = None   # several items = one carousel or slideshow
    format: Optional[str] = None              # "carousel" | "slideshow" (needed when media_paths has 2+ items)
    seconds_per_image: float = 3.0            # slideshow only
    account: Optional[str] = None             # connected Instagram API account (id or @username); empty = default
    track_id: Optional[str] = None            # Instagram song chosen via /api/music/search
    track_start_ms: int = 0                   # where in the song the clip starts
    track_clip_ms: int = 30000                # how long the clip plays
    local_track: Optional[str] = None         # file name of an audio file in the music folder

class QueueJobItem(BaseModel):
    task: str
    prompt: str
    post_at: Optional[str] = None
    media: Optional[str] = None
    media_paths: Optional[List[str]] = None   # 2-10 items posted together as one carousel
    format: Optional[str] = None
    account: Optional[str] = None             # which Instagram API account to post to; empty = default
    caption: Optional[str] = None
    override: Optional[Dict[str, Any]] = None

class InstagramApiSettings(BaseModel):
    token: Optional[str] = None            # adds an account (the user id and name are read from Instagram)
    cloudinary_url: Optional[str] = None

class AccountTokenRequest(BaseModel):
    token: str

class BatchAddRequest(BaseModel):
    task: str
    prompts: List[str]
    post_times: Optional[List[str]] = None

class ConfigUpdateRequest(BaseModel):
    caption: Optional[Dict[str, Any]] = None
    music: Optional[Dict[str, Any]] = None
    instagram: Optional[Dict[str, Any]] = None
    schedule: Optional[Dict[str, Any]] = None
    tasks: Optional[Dict[str, Any]] = None

class HfTokensRequest(BaseModel):
    tokens: Optional[List[str]] = None
    primary_token: Optional[str] = None
    backup_token: Optional[str] = None

# --- Helper functions ---
def update_env_variable(key: str, value: str):
    env_path = BASE_DIR / ".env"
    lines = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()
    found = False
    new_lines = []
    # Match "KEY=", "KEY =" and different capitalisation (e.g. Groq_API_KEY) so we edit instead of duplicating
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*=", re.IGNORECASE)
    for line in lines:
        if pattern.match(line) or line.strip().upper() == key.upper():
            if not found:
                new_lines.append(f"{key}={value}")
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f"{key}={value}")
    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    os.environ[key] = value

def get_config():
    with open(BASE_DIR / "config.yaml", "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

def save_config(cfg):
    with open(BASE_DIR / "config.yaml", "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, sort_keys=False, allow_unicode=True)
    P.CFG = cfg

def mask_token(token: Optional[str]) -> str:
    if not token or len(token) < 8:
        return "Not Configured" if not token else "********"
    return f"{token[:4]}...{token[-4:]}"

# --- API Endpoints ---

@app.get("/api/health")
def check_health():
    load_dotenv(override=True)
    cfg = get_config()
    env = os.environ
    hf_tokens = P.get_hf_tokens(valid_first=False)   # show every configured account, valid or not
    hf_status = P._HF_STATUS["valid"]                # filled by check_hf_tokens(); empty until first check
    valid_accounts = sum(1 for t in hf_tokens if hf_status.get(t, True)) if hf_status else None
    primary_hf = env.get("HF_TOKEN")
    backup_hf = env.get("HF_TOKEN_BACKUP") or env.get("HF_TOKEN_SECONDARY")
    openai_ok = bool(captioner.get_key("openai"))
    cloudinary_ok = bool(env.get("CLOUDINARY_URL"))
    ig_user = env.get("IG_USERNAME")
    ig_pass = env.get("IG_PASSWORD")
    direct_ok = bool(ig_user and ig_pass)
    ig_id_ok = bool(env.get("IG_USER_ID"))
    ig_token_ok = bool(env.get("IG_ACCESS_TOKEN"))

    accounts_list = []
    for idx, t in enumerate(hf_tokens):
        accounts_list.append({
            "index": idx + 1,
            "label": f"Account {idx + 1}" + (" (Primary)" if idx == 0 else f" (Backup {idx})"),
            "preview": mask_token(t)
        })

    music_tracks = glob.glob(str(MUSIC_DIR / "*.mp3"))

    return {
        "status": "online",
        "dry_run": cfg.get("instagram", {}).get("dry_run", True),
        "keys": {
            "huggingface": {
                "configured": len(hf_tokens) > 0,
                "preview": mask_token(primary_hf if primary_hf else (hf_tokens[0] if hf_tokens else None)),
                "total_accounts": len(hf_tokens),
                "valid_accounts": valid_accounts,
                "quota": P.quota_status(),   # per account: seconds until GPU quota is back (0 = available)
                "has_failover": (valid_accounts if valid_accounts is not None else len(hf_tokens)) > 1,
                "accounts": accounts_list,
                "primary": {"configured": bool(primary_hf), "preview": mask_token(primary_hf)},
                "backup": {"configured": bool(backup_hf), "preview": mask_token(backup_hf)}
            },
            "instagram": {
                "mode": "direct" if direct_ok else ("graph_api" if ig_token_ok else "none"),
                "configured": direct_ok or ig_token_ok,
                "username": ig_user,
                "session_cached": (BASE_DIR / "ig_session.json").exists(),
                "official_api": instagram_api.configured(),
                "official_accounts": instagram_api.public_accounts(),
                "session_expired": bool(sys.modules.get("instagram_direct") and sys.modules["instagram_direct"].SESSION_STATE["expired"]),
                "preview": f"@{ig_user} (Direct Login Active)" if direct_ok else (mask_token(env.get("IG_ACCESS_TOKEN")) if ig_token_ok else "Not Configured")
            },
            "openai": {"configured": openai_ok, "preview": mask_token(captioner.get_key("openai"))},
            "cloudinary": {"configured": cloudinary_ok, "preview": "Configured" if cloudinary_ok else "Not Set"},
            "instagram_user_id": {"configured": ig_id_ok, "preview": mask_token(env.get("IG_USER_ID"))},
            "instagram_token": {"configured": ig_token_ok, "preview": mask_token(env.get("IG_ACCESS_TOKEN"))},
        },
        "caption_ai": {
            "provider": cfg.get("caption", {}).get("provider", "gemini"),
            "models": cfg.get("caption", {}).get("models", {}),
            "providers": captioner.catalog(),
        },
        "available_music_tracks": len(music_tracks),
        "available_tasks": list(cfg.get("tasks", {}).keys()),
        "active_generation": active_generation
    }

class IgCredentialsRequest(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    verification_code: Optional[str] = None
    session_id: Optional[str] = None

@app.post("/api/settings/instagram")
def update_instagram_credentials(payload: IgCredentialsRequest):
    if payload.username:
        update_env_variable("IG_USERNAME", payload.username.strip())
    if payload.password:
        update_env_variable("IG_PASSWORD", payload.password.strip())
    if payload.verification_code:
        update_env_variable("IG_VERIFICATION_CODE", payload.verification_code.strip())
    if payload.session_id:
        update_env_variable("IG_SESSION_ID", payload.session_id.strip())
    
    return {"status": "success", "username": os.environ.get("IG_USERNAME"), "message": f"Updated Instagram Direct Login for @{os.environ.get('IG_USERNAME')}"}

@app.post("/api/instagram/verify")
def verify_instagram_endpoint(payload: IgCredentialsRequest):
    try:
        username = payload.username.strip() if payload.username else os.environ.get("IG_USERNAME")
        password = payload.password.strip() if payload.password else os.environ.get("IG_PASSWORD")
        verification_code = payload.verification_code.strip() if payload.verification_code else os.environ.get("IG_VERIFICATION_CODE")
        session_id = payload.session_id.strip() if payload.session_id else os.environ.get("IG_SESSION_ID")

        if payload.username:
            update_env_variable("IG_USERNAME", payload.username.strip())
        if payload.password:
            update_env_variable("IG_PASSWORD", payload.password.strip())
        if payload.verification_code:
            update_env_variable("IG_VERIFICATION_CODE", payload.verification_code.strip())
        if payload.session_id:
            update_env_variable("IG_SESSION_ID", payload.session_id.strip())

        from instagram_direct import check_connection
        info = check_connection(
            username=username,
            password=password,
            verification_code=verification_code,
            sessionid=session_id,
            sessionid_only=bool(payload.session_id and not payload.password)
        )
        return {
            "status": "success",
            "message": f"Successfully authenticated as @{info['username']}! Mobile session saved to ig_session.json.",
            "details": info
        }
    except Exception as e:
        err_msg = str(e)
        status_type = "error"
        if "2FA" in err_msg or "TwoFactor" in err_msg:
            status_type = "2fa_required"
        elif "challenge" in err_msg.lower():
            status_type = "challenge_required"
        elif "out of date" in err_msg.lower() or "version" in err_msg.lower():
            status_type = "version_error"
            err_msg = "Instagram has blocked mobile password login from this IP/device ('version out of date'). Please connect using your browser Session ID below."
        return JSONResponse(status_code=400, content={"status": status_type, "message": err_msg})

@app.post("/api/settings/hf_tokens")
def update_hf_tokens_endpoint(payload: HfTokensRequest):
    if payload.tokens is not None and len(payload.tokens) > 0:
        cleaned = [t.strip() for t in payload.tokens if t.strip()]
        if cleaned:
            update_env_variable("HF_TOKENS", ",".join(cleaned))
            update_env_variable("HF_TOKEN", cleaned[0])
            if len(cleaned) > 1:
                update_env_variable("HF_TOKEN_BACKUP", cleaned[1])
            for i, tok in enumerate(cleaned[1:], start=2):
                update_env_variable(f"HF_TOKEN_{i}", tok)
    else:
        if payload.primary_token is not None:
            update_env_variable("HF_TOKEN", payload.primary_token.strip())
        if payload.backup_token is not None:
            update_env_variable("HF_TOKEN_BACKUP", payload.backup_token.strip())
    
    tokens = P.get_hf_tokens(valid_first=False)
    try:
        P.check_hf_tokens(force=True)   # re-validate so dead tokens are skipped right away
    except Exception:
        pass
    return {
        "status": "success",
        "total_accounts": len(tokens),
        "has_failover": len(tokens) > 1,
        "message": f"Saved {len(tokens)} Hugging Face account(s). Auto-failover active across {len(tokens)} accounts."
    }

@app.get("/api/config")
def read_config_endpoint():
    return get_config()

@app.post("/api/config")
def update_config_endpoint(payload: ConfigUpdateRequest):
    cfg = get_config()
    if payload.caption is not None:
        incoming = dict(payload.caption)
        models = incoming.pop("models", None)
        cfg["caption"].update(incoming)
        if isinstance(models, dict):  # merge so one provider's choice doesn't wipe the others
            cfg["caption"].setdefault("models", {}).update(models)
    if payload.music is not None:
        cfg["music"].update(payload.music)
    if payload.instagram is not None:
        cfg["instagram"].update(payload.instagram)
    if payload.schedule is not None:
        cfg["schedule"].update(payload.schedule)
    if payload.tasks is not None:
        cfg["tasks"].update(payload.tasks)
    save_config(cfg)
    return {"status": "success", "config": cfg}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = f"{int(time.time())}_{file.filename}"
    target_path = INPUT_DIR / filename
    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {
        "filename": filename,
        "original_name": file.filename,
        "path": str(target_path),
        "url": f"/input/{filename}",
        "size": target_path.stat().st_size
    }

def resolve_media(url_or_path: Optional[str]) -> Optional[str]:
    """Map /output/x.png or /input/x.png to a real file path. Only files in those two folders are allowed."""
    if not url_or_path:
        return None
    clean = url_or_path.split("?")[0]
    for prefix, folder in (("/output/", OUTPUT_DIR), ("/input/", INPUT_DIR)):
        if clean.startswith(prefix):
            target = _inside(folder, clean[len(prefix):])
            return str(target) if target and target.exists() else None
    return None

def _inside(folder: Path, rel: str) -> Optional[Path]:
    """folder/rel, or None if it would escape the folder (../ tricks)."""
    target = (folder / unquote(rel)).resolve()
    return target if folder.resolve() in target.parents else None

def out_url(path_or_url) -> str:
    """Web address of a file in the output folder (keeps the account sub-folder)."""
    text = str(path_or_url)
    if text.startswith("/output/"):
        return text.split("?")[0]
    try:
        rel = Path(text).resolve().relative_to(OUTPUT_DIR.resolve()).as_posix()
    except ValueError:
        rel = Path(text).name
    return "/output/" + rel

@app.post("/api/caption/generate")
def generate_caption_endpoint(req: CaptionRequest):
    try:
        # P.CFG is what make_caption reads; apply one-off tone/language without saving them
        cfg = json.loads(json.dumps(get_config()))
        if req.tone:
            cfg["caption"]["tone"] = req.tone
        if req.language:
            cfg["caption"]["language"] = req.language
        saved_cfg, P.CFG = P.CFG, cfg
        try:
            caption, song, info = P.make_caption(
                req.prompt,
                "Reel video" if "video" in req.media_kind else "photo",
                media_path=resolve_media(req.media_url),
                media_paths=[p for p in (resolve_media(u) for u in (req.media_urls or [])) if p] or None,
                provider=req.provider,
                model=req.model,
                with_info=True,
            )
        finally:
            P.CFG = saved_cfg
        return {"caption": caption, "song": song, **info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/hf/tokens/check")
def check_hf_token_pool(force: bool = False):
    """Which Hugging Face accounts are still accepted. Never returns token values."""
    load_dotenv(override=True)
    accounts = P.check_hf_tokens(force=force)
    valid = sum(1 for a in accounts if a["valid"])
    return {"total": len(accounts), "valid": valid, "rejected": len(accounts) - valid, "accounts": accounts}

@app.on_event("startup")
def warm_hf_token_check():
    # Validate the Hugging Face token pool in the background
    import threading
    threading.Thread(target=lambda: P.check_hf_tokens(), daemon=True).start()
    # Instagram's private web/phone interfaces are NOT contacted at startup. The official API only renews its token
    # (about every 20 days) and does nothing otherwise.
    def _renew_official_token():
        try:
            import instagram_api
            instagram_api.refresh_if_due()
        except Exception:
            pass
    threading.Thread(target=_renew_official_token, daemon=True).start()


@app.get("/api/caption/providers")
def caption_providers():
    load_dotenv(override=True)
    cfg = get_config().get("caption", {})
    return {"provider": cfg.get("provider", "gemini"), "models": cfg.get("models", {}), "providers": captioner.catalog()}

@app.post("/api/settings/ai_keys")
def save_ai_keys(payload: AiKeysRequest):
    env_names = {"gemini": "GEMINI_API_KEY", "groq": "GROQ_API_KEY", "openrouter": "OPENROUTER_API_KEY", "openai": "OPENAI_API_KEY"}
    saved = []
    for pid, env_name in env_names.items():
        value = getattr(payload, pid)
        if value and value.strip():
            update_env_variable(env_name, value.strip().strip("'\""))
            saved.append(captioner.PROVIDERS[pid]["label"])
    if not saved:
        raise HTTPException(status_code=400, detail="No key provided")
    warnings = [f"{captioner.PROVIDERS[p]['label']}: {captioner.key_problem(p)}" for p in env_names if captioner.key_problem(p)]
    return {"status": "success", "saved": saved, "warnings": warnings, "message": "Saved " + ", ".join(saved)}

@app.post("/api/caption/test")
def test_caption_provider(req: CaptionTestRequest):
    if req.provider not in captioner.PROVIDERS:
        raise HTTPException(status_code=400, detail="Unknown provider")
    model = req.model or captioner.PROVIDERS[req.provider]["default"]
    try:
        ms, sample = captioner.quick_test(req.provider, model)
        return {"status": "success", "provider": req.provider, "model": model, "ms": ms, "sample": sample}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

def _run_generation_task(task_type: str, prompt: str, image_path: Optional[str],
                         video_path: Optional[str], face_path: Optional[str],
                         override: Optional[dict], out_dir: Optional[Path] = None):
    global active_generation
    try:
        active_generation["is_generating"] = True
        active_generation["progress"] = 15
        active_generation["error"] = None
        active_generation["result"] = None

        def on_step_update(msg):
            active_generation["current_step"] = msg

        media = P.generate(task_type, prompt, image_path, video_path, override, face_path, status_cb=on_step_update, out_dir=out_dir)
        
        if task_type.endswith("video"):
            active_generation["progress"] = 65
            active_generation["current_step"] = "Mixing royalty-free background audio..."
            try:
                media = P.add_music(media)
            except Exception as music_err:
                print(f"[warn] Music mixing failed: {music_err}")

        active_generation["progress"] = 85
        active_generation["current_step"] = "Generating GPT caption & trending song recommendation..."
        caption, song = "", ""
        try:
            caption, song = P.make_caption(prompt, "Reel video" if task_type.endswith("video") else "photo", media_path=media)
        except Exception as cap_err:
            caption = f"{prompt}\n\n#reels #viral #explore"
            song = "Trending Audio"
            print(f"[warn] Caption generation failed: {cap_err}")

        media_name = Path(media).name
        active_generation["progress"] = 100
        active_generation["current_step"] = "Complete"
        active_generation["result"] = {
            "media_path": media,
            "media_url": out_url(media),
            "filename": media_name,
            "is_video": task_type.endswith("video"),
            "caption": caption,
            "song": song,
            "task": task_type,
            "prompt": prompt,
            "completed_at": datetime.now().isoformat()
        }
    except Exception as e:
        active_generation["error"] = str(e)
        active_generation["current_step"] = "Failed"
    finally:
        active_generation["is_generating"] = False

@app.post("/api/generate")
async def start_generation(
    background_tasks: BackgroundTasks,
    task: str = Form(...),
    prompt: str = Form(...),
    image: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    face: Optional[UploadFile] = File(None),
    image_path: Optional[str] = Form(None),
    video_path: Optional[str] = Form(None),
    face_path: Optional[str] = Form(None),
    space_id: Optional[str] = Form(None),
    api_name: Optional[str] = Form(None),
    params_json: Optional[str] = Form(None),
    account: Optional[str] = Form(None),
):
    global active_generation
    if active_generation["is_generating"]:
        raise HTTPException(status_code=400, detail="Another generation job is currently in progress.")

    # Process files if uploaded directly
    if image:
        fname = f"{int(time.time())}_{image.filename}"
        tgt = INPUT_DIR / fname
        with open(tgt, "wb") as buf:
            shutil.copyfileobj(image.file, buf)
        image_path = str(tgt)

    if video:
        fname = f"{int(time.time())}_{video.filename}"
        tgt = INPUT_DIR / fname
        with open(tgt, "wb") as buf:
            shutil.copyfileobj(video.file, buf)
        video_path = str(tgt)

    if face:
        fname = f"{int(time.time())}_{face.filename}"
        tgt = INPUT_DIR / fname
        with open(tgt, "wb") as buf:
            shutil.copyfileobj(face.file, buf)
        face_path = str(tgt)

    override = None
    if space_id or api_name or params_json:
        override = {}
        if space_id:
            override["space"] = space_id
        if api_name:
            override["api_name"] = api_name
        if params_json:
            try:
                override["params"] = json.loads(params_json)
            except Exception:
                pass

    active_generation["is_generating"] = True
    active_generation["progress"] = 5
    active_generation["current_step"] = "Initializing job..."
    active_generation["error"] = None
    active_generation["result"] = None
    active_generation["started_at"] = time.time()

    # New files are saved in the folder of the chosen Instagram account (the active one unless told otherwise)
    out_dir = P.account_out_dir(account)
    background_tasks.add_task(
        _run_generation_task,
        task, prompt, image_path, video_path, face_path, override, out_dir
    )

    return {"status": "started", "task": task, "prompt": prompt}

@app.get("/api/generate/status")
def get_generation_status():
    return active_generation

AUDIO_EXTS = (".mp3", ".m4a", ".wav", ".aac")

def _media_file(path_or_url: str) -> Path:
    clean = path_or_url.split("?")[0]
    if clean.startswith("/output/"):
        return _inside(OUTPUT_DIR, clean[len("/output/"):]) or (OUTPUT_DIR / "_missing_")
    if clean.startswith("/input/"):
        return _inside(INPUT_DIR, clean[len("/input/"):]) or (INPUT_DIR / "_missing_")
    if os.path.isabs(clean):
        return Path(clean)
    return OUTPUT_DIR / Path(clean).name

def _instagram_direct_ready() -> bool:
    return bool((os.environ.get("IG_USERNAME") and os.environ.get("IG_PASSWORD"))
                or os.environ.get("IG_SESSION_ID") or (BASE_DIR / "ig_session.json").exists())

@app.post("/api/post")
def post_content(payload: DirectPostRequest):
    try:
        cfg = get_config()
        dry_run = payload.dry_run if payload.dry_run is not None else cfg["instagram"]["dry_run"]

        paths = [_media_file(p) for p in (payload.media_paths or [payload.media_path])]
        for pth in paths:
            if not pth.exists():
                raise HTTPException(status_code=404, detail=f"Media file not found: {pth.name}")

        multi = len(paths) > 1
        fmt = payload.format
        if multi and fmt not in ("carousel", "slideshow"):
            raise HTTPException(status_code=400, detail="Choose Carousel or Slideshow Reel for several items.")
        if len(paths) > 10:
            raise HTTPException(status_code=400, detail="Instagram allows at most 10 items in one post.")
        if payload.track_id and payload.local_track:
            raise HTTPException(status_code=400, detail="Choose either an Instagram song or your own audio file, not both.")

        if multi and fmt == "carousel" and payload.track_id:
            raise HTTPException(status_code=400, detail="A song can't be added to a carousel. Post it without a song, use a Slideshow Reel, or post a single photo with the song.")
        import instagram_api as _official
        if multi and fmt == "carousel" and any(p.suffix.lower() in (".mp4", ".mov") for p in paths) and not _official.configured():
            raise HTTPException(status_code=400, detail="Videos in a carousel need the Instagram API (IG_ACCESS_TOKEN, IG_USER_ID and CLOUDINARY_URL in .env). Use pictures only, or set it up in Settings.")

        local_audio = None
        if payload.local_track:
            local_audio = MUSIC_DIR / Path(payload.local_track).name
            if not local_audio.exists():
                raise HTTPException(status_code=404, detail=f"Audio file not found in the music folder: {local_audio.name}")
            if multi and fmt == "carousel":
                raise HTTPException(status_code=400, detail="Your own audio can't be attached to a carousel. Use a Slideshow Reel, or pick an Instagram song.")

        # Build a video when needed (slideshow, or own audio on a photo / video)
        built_url = None
        post_is_video = payload.is_video
        post_path = paths[0]
        album = multi and fmt == "carousel"
        if (multi and fmt == "slideshow") or (local_audio and not multi and not payload.is_video):
            photos = [pth for pth in paths if pth.suffix.lower() not in (".mp4", ".mov")]
            if len(photos) != len(paths):
                raise HTTPException(status_code=400, detail="A slideshow can only be made from pictures, not videos.")
            post_path = Path(P.make_slideshow(paths, payload.seconds_per_image, audio=local_audio))
            post_is_video = True
            built_url = out_url(post_path)
        elif local_audio and not multi and payload.is_video:
            post_path = Path(P.add_music(str(paths[0]), track=str(local_audio)))
            built_url = out_url(post_path)

        posted = False
        public_url = None
        import instagram_api as official
        # Official API (token, no session cookies) for carousels, photos and Reels. Songs need the phone route.
        use_official = official.configured() and not payload.track_id
        if use_official:
            try:
                official.get_account(payload.account)       # fail early with a clear message
            except official.InstagramApiError as e:
                raise HTTPException(status_code=400, detail=str(e))
        if not dry_run and use_official:
            try:
                if album:
                    res = official.post_carousel(paths, payload.caption, account=payload.account)
                elif post_is_video:
                    res = official.post_reel(post_path, payload.caption, account=payload.account)
                else:
                    res = official.post_photo(post_path, payload.caption, account=payload.account)
            except official.InstagramApiError as e:
                raise HTTPException(status_code=502, detail=str(e))
            posted = True
            public_url = res.get("url")
        elif not dry_run:
            if album and not _instagram_direct_ready():
                raise ValueError("Carousels need either the Instagram API (IG_ACCESS_TOKEN, IG_USER_ID, CLOUDINARY_URL in .env) or a browser session ID in Settings.")
            if not _instagram_direct_ready():
                if payload.track_id or album:
                    raise ValueError("Songs and carousels need the direct Instagram login (username and password, or session ID) in Settings.")
                if os.environ.get("IG_ACCESS_TOKEN") and os.environ.get("IG_USER_ID"):
                    public_url = P.upload_public(str(post_path))
                    P.post_to_instagram(public_url, payload.caption, post_is_video)
                    posted = True
                else:
                    raise ValueError("No Instagram credentials configured. Add your login or session ID in Settings.")
            else:
                from instagram_direct import post_direct, post_album
                if album:
                    res = post_album([str(x) for x in paths], payload.caption, track_id=payload.track_id,
                                      start_ms=payload.track_start_ms, clip_ms=payload.track_clip_ms)
                else:
                    res = post_direct(str(post_path), payload.caption, post_is_video, track_id=payload.track_id,
                                      start_ms=payload.track_start_ms, clip_ms=payload.track_clip_ms)
                posted = True
                public_url = res.get("url")

        route = ""
        if use_official and not dry_run:
            route = f" on @{(res or {}).get('account') or 'your account'}"
        elif payload.track_id:
            route = " (songs post to the browser-login account)"
        what = "carousel" if album else ("slideshow Reel" if multi else ("Reel" if post_is_video else "photo"))
        song = " with an Instagram song" if payload.track_id else (" with your audio" if local_audio else "")
        return {
            "status": "success",
            "posted": posted,
            "dry_run": dry_run,
            "public_url": public_url,
            "built_media_url": built_url,
            "message": f"Published your {what}{song} to Instagram{route}!" if posted
                       else f"Dry run completed: your {what}{song} was prepared but nothing was posted.",
        }
    except HTTPException:
        raise
    except Exception as e:
        if type(e).__name__ == "InstagramSessionExpired":
            raise HTTPException(status_code=401, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))

# --- Official Instagram API: connected accounts (Settings page) ---
def _official_call(fn, *args):
    import instagram_api
    try:
        return fn(*args)
    except instagram_api.InstagramApiError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/instagram/accounts")
def list_ig_accounts():
    load_dotenv(override=True)
    import instagram_api
    return {"cloudinary": bool(os.environ.get("CLOUDINARY_URL", "").strip()), "accounts": instagram_api.public_accounts()}

@app.get("/api/instagram/accounts/{account_id}/status")
def ig_account_status(account_id: str):
    import instagram_api
    return instagram_api.status(account_id)

@app.get("/api/instagram/accounts/{account_id}/posts")
def ig_account_posts(account_id: str, limit: int = 24, after: str = ""):
    """Posts already published on this account, read from Instagram."""
    import instagram_api
    return _official_call(instagram_api.list_media, account_id, limit, after)

@app.post("/api/instagram/accounts")
def add_ig_account(payload: AccountTokenRequest):
    import instagram_api
    added = _official_call(instagram_api.add_account, payload.token)
    who = "@" + (added.get("username") or added["id"])
    return {"status": "success", "message": f"{'Updated the token for' if added['updated'] else 'Connected'} {who}.", "account": added}

@app.delete("/api/instagram/accounts/{account_id}")
def remove_ig_account(account_id: str):
    import instagram_api
    _official_call(instagram_api.remove_account, account_id)
    return {"status": "success"}

@app.post("/api/instagram/accounts/{account_id}/default")
def default_ig_account(account_id: str):
    import instagram_api
    _official_call(instagram_api.set_default, account_id)
    return {"status": "success"}

class FolderRequest(BaseModel):
    folder: str

@app.post("/api/instagram/accounts/{account_id}/folder")
def set_ig_account_folder(account_id: str, payload: FolderRequest):
    """Use an existing folder of output/ (for example one made by hand) as this account's folder."""
    import instagram_api
    name = (payload.folder or "").strip()
    if not _inside(OUTPUT_DIR, name) or not (OUTPUT_DIR / name).is_dir():
        raise HTTPException(status_code=400, detail="That folder does not exist inside the output folder.")
    folder = _official_call(instagram_api.set_folder, account_id, name)
    return {"status": "success", "folder": folder}

@app.post("/api/instagram/accounts/{account_id}/refresh")
def refresh_ig_account(account_id: str):
    import instagram_api
    if _official_call(instagram_api.refresh_token, account_id):
        return {"status": "success", "message": "Token renewed for another 60 days."}
    raise HTTPException(status_code=400, detail="Instagram would not renew the token yet. It must be at least 24 hours old and not expired. If it expired, paste a newly generated token.")

@app.post("/api/settings/instagram_api")
def save_official_settings(payload: InstagramApiSettings):
    import instagram_api
    if not (payload.token or "").strip() and not (payload.cloudinary_url or "").strip():
        raise HTTPException(status_code=400, detail="Nothing to save.")
    messages = []
    if (payload.cloudinary_url or "").strip():
        update_env_variable("CLOUDINARY_URL", payload.cloudinary_url.strip())
        messages.append("Cloudinary link saved.")
    if (payload.token or "").strip():
        added = _official_call(instagram_api.add_account, payload.token)
        messages.append(f"Connected @{added.get('username') or added['id']}.")
    return {"status": "success", "message": " ".join(messages)}

# --- Scheduler: runs queued jobs at their time while the server is running ---
_job_lock = threading.Lock()

def _run_due_jobs():
    """Run every pending job whose post_at has arrived, and one job without a time at each daily slot."""
    from batch import pending, execute
    with _job_lock:
        jobs = load_jobs()
        now = datetime.now()
        stamp = now.strftime("%Y-%m-%d %H:%M")
        due = [j for j in pending(jobs) if j.get("post_at") and j["post_at"] <= stamp]
        slots = (get_config().get("schedule") or {}).get("daily_times") or []
        if now.strftime("%H:%M") in slots and _scheduler_state.get("slot") != stamp:
            _scheduler_state["slot"] = stamp
            free = [j for j in pending(jobs) if not j.get("post_at")]
            if free:
                due.append(free[0])
        for job in due:
            job["status"] = "running"                  # saved first so no other runner picks it up
            save_jobs(jobs)
            print(f"[scheduler] running: {job['task']} - {str(job.get('prompt', ''))[:50]}")
            execute(job)
            save_jobs(jobs)

_scheduler_state = {"slot": None}

def _scheduler_loop():
    while True:
        time.sleep(30)
        try:
            if (get_config().get("schedule") or {}).get("run_in_server", True):
                _run_due_jobs()
        except Exception as e:
            print(f"[scheduler] error: {str(e)[:160]}")

@app.on_event("startup")
def start_scheduler():
    # a job left in "running" means the server stopped mid-post; don't guess whether it posted
    from batch import save_jobs as _save
    jobs = load_jobs()
    changed = False
    for j in jobs:
        if j.get("status") == "running":
            j.update(status="failed", error="The server stopped while this job was running. Check Instagram before retrying.")
            changed = True
    if changed:
        _save(jobs)
    threading.Thread(target=_scheduler_loop, daemon=True).start()

# --- Music: Instagram song search and your own audio files ---
@app.get("/api/music/search")
def music_search(q: str):
    if not q.strip():
        raise HTTPException(status_code=400, detail="Type a song or artist to search for.")
    if not _instagram_direct_ready():
        raise HTTPException(status_code=400, detail="Instagram songs need the direct Instagram login. Connect it in Settings first.")
    try:
        from instagram_direct import search_tracks
        return {"tracks": search_tracks(q.strip())}
    except Exception as e:
        if type(e).__name__ == "InstagramSessionExpired":
            raise HTTPException(status_code=401, detail=str(e))
        raise HTTPException(status_code=502, detail=f"Instagram song search failed: {e}")

@app.get("/api/music/local")
def list_local_music():
    files = [f for f in sorted(MUSIC_DIR.iterdir()) if f.is_file() and f.suffix.lower() in AUDIO_EXTS]
    return {"tracks": [{"name": f.name, "size_mb": round(f.stat().st_size / (1024 * 1024), 2), "url": f"/music/{f.name}"} for f in files]}

@app.post("/api/music/local")
async def upload_local_music(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in AUDIO_EXTS:
        raise HTTPException(status_code=400, detail="Upload an mp3, m4a, wav or aac file.")
    safe = re.sub(r"[^A-Za-z0-9._ -]", "_", Path(file.filename).stem)[:80] or "track"
    target = MUSIC_DIR / f"{safe}{suffix}"
    with open(target, "wb") as buf:
        shutil.copyfileobj(file.file, buf)
    return {"name": target.name, "size_mb": round(target.stat().st_size / (1024 * 1024), 2)}

@app.delete("/api/music/local/{name}")
def delete_local_music(name: str):
    target = MUSIC_DIR / Path(name).name
    if target.exists() and target.suffix.lower() in AUDIO_EXTS:
        target.unlink()
        return {"status": "success", "deleted": target.name}
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/queue")
def get_queue():
    jobs = load_jobs()
    for idx, j in enumerate(jobs):
        j["id"] = idx
        if "media" in j and j["media"]:
            j["media_url"] = out_url(j["media"])
        if j.get("account"):
            try:
                import instagram_api
                j["account_name"] = instagram_api.get_account(j["account"]).get("username")
            except Exception:
                j["account_name"] = None
        if j.get("media_paths"):
            j["media_urls"] = [out_url(p) for p in j["media_paths"]]
            j["media_url"] = j["media_urls"][0]
    return {"jobs": jobs, "total": len(jobs)}

@app.post("/api/queue")
def add_to_queue(job: QueueJobItem):
    jobs = load_jobs()
    new_job = {
        "task": job.task,
        "prompt": job.prompt,
        "status": "pending",
        "post_at": job.post_at or datetime.now().strftime("%Y-%m-%d %H:%M"),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    if job.media:
        new_job["media"] = job.media
    if job.media_paths and len(job.media_paths) > 1:
        if len(job.media_paths) > 10:
            raise HTTPException(status_code=400, detail="A carousel can hold at most 10 items.")
        new_job["media_paths"] = job.media_paths
        new_job["format"] = "carousel"
    if job.account:
        import instagram_api
        try:
            new_job["account"] = instagram_api.get_account(job.account)["id"]
        except instagram_api.InstagramApiError as e:
            raise HTTPException(status_code=400, detail=str(e))
    if job.caption:
        new_job["caption"] = job.caption
    if job.override:
        new_job["override"] = job.override

    jobs.append(new_job)
    save_jobs(jobs)
    return {"status": "success", "jobs": jobs}

@app.post("/api/queue/batch")
def add_batch_to_queue(payload: BatchAddRequest):
    jobs = load_jobs()
    added = 0
    now = datetime.now()
    for i, p in enumerate(payload.prompts):
        if not p.strip():
            continue
        post_time = None
        if payload.post_times and i < len(payload.post_times):
            post_time = payload.post_times[i]
        
        job = {
            "task": payload.task,
            "prompt": p.strip(),
            "status": "pending",
            "created_at": now.strftime("%Y-%m-%d %H:%M:%S")
        }
        if post_time:
            job["post_at"] = post_time
        jobs.append(job)
        added += 1

    save_jobs(jobs)
    return {"status": "success", "added_count": added}

@app.delete("/api/queue/{job_id}")
def delete_queue_job(job_id: int):
    jobs = load_jobs()
    if 0 <= job_id < len(jobs):
        deleted = jobs.pop(job_id)
        save_jobs(jobs)
        return {"status": "success", "deleted": deleted}
    raise HTTPException(status_code=404, detail="Job not found")

@app.post("/api/queue/run")
def run_queue_jobs(limit: Optional[int] = 1):
    jobs = load_jobs()
    pending_jobs = [j for j in jobs if j.get("status", "pending") == "pending"]
    todo = pending_jobs[:limit] if limit else pending_jobs
    executed = []

    for job in todo:
        try:
            execute(job)
            executed.append(job)
            save_jobs(jobs)
        except Exception as e:
            job["status"] = "failed"
            job["error"] = str(e)
            save_jobs(jobs)

    return {"status": "completed", "executed": len(executed), "jobs": jobs}

GALLERY_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov")

def _gallery_files(folder: Path):
    files = []
    if not folder.exists():
        return files
    for f in folder.iterdir():
        if f.is_file() and f.suffix.lower() in GALLERY_EXTS:
            stat = f.stat()
            rel = f.resolve().relative_to(OUTPUT_DIR.resolve()).as_posix()
            files.append({
                "filename": f.name,
                "path": rel,
                "url": "/output/" + rel,
                "folder": Path(rel).parent.as_posix() if "/" in rel else "",
                "size_bytes": stat.st_size,
                "size_mb": round(stat.st_size / (1024 * 1024), 2),
                "is_video": f.suffix.lower() in (".mp4", ".mov"),
                "created_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                "timestamp": stat.st_mtime,
            })
    files.sort(key=lambda x: x["timestamp"], reverse=True)
    return files

def _unlinked_folders():
    """Folders inside output/ that no account uses (for example ones made by hand), with their file counts."""
    owned = set()
    for a in instagram_api.accounts():
        try:
            owned.add(instagram_api.account_folder(a["id"]))
        except instagram_api.InstagramApiError:
            pass
    out = []
    if OUTPUT_DIR.exists():
        for d in sorted(OUTPUT_DIR.iterdir()):
            if d.is_dir() and d.name not in owned and not d.name.startswith("."):
                n = sum(1 for f in d.iterdir() if f.is_file() and f.suffix.lower() in GALLERY_EXTS)
                out.append({"name": d.name, "count": n})
    return out

@app.get("/api/gallery")
def get_gallery(scope: str = ""):
    """Generated files of ONE Instagram account (the active one unless `scope` names another), or the files that
    are not assigned to any account (`scope=unassigned`). With no account connected, every file is listed."""
    unassigned = _gallery_files(OUTPUT_DIR)
    if not instagram_api.accounts():
        return {"files": unassigned, "count": len(unassigned), "scope": "all", "account": None, "unassigned_count": 0}
    folders = _unlinked_folders()
    if scope == "unassigned":
        return {"files": unassigned, "count": len(unassigned), "scope": "unassigned", "account": None,
                "unassigned_count": len(unassigned), "folders": folders}
    if scope.startswith("folder:"):
        name = scope[len("folder:"):]
        target = _inside(OUTPUT_DIR, name)
        if not target or not target.is_dir() or target.resolve() == OUTPUT_DIR.resolve():
            raise HTTPException(status_code=400, detail="That folder does not exist.")
        files = _gallery_files(target)
        return {"files": files, "count": len(files), "scope": scope, "account": None, "folder": name,
                "unassigned_count": len(unassigned), "folders": folders}
    try:
        acc = instagram_api.get_account(scope or None)
    except instagram_api.InstagramApiError as e:
        raise HTTPException(status_code=400, detail=str(e))
    folder = instagram_api.account_folder(acc["id"])
    files = _gallery_files(OUTPUT_DIR / folder)
    return {"files": files, "count": len(files), "scope": str(acc["id"]), "account": acc.get("username"),
            "folder": folder, "unassigned_count": len(unassigned), "folders": folders}

class MoveRequest(BaseModel):
    paths: List[str]            # file paths as listed by /api/gallery ("redmedia.inn/x.png" or "x.png")
    to: str                     # an account id, or "unassigned"

@app.post("/api/gallery/move")
def move_gallery_files(payload: MoveRequest):
    """Move generated files into another account's folder (or back to unassigned). Queued jobs that point at a moved file
    are updated so they still find it."""
    if payload.to == "unassigned":
        dest = OUTPUT_DIR
    else:
        try:
            dest = OUTPUT_DIR / instagram_api.account_folder(payload.to)
        except instagram_api.InstagramApiError as e:
            raise HTTPException(status_code=400, detail=str(e))
    dest.mkdir(parents=True, exist_ok=True)
    moved, skipped = {}, 0
    for rel in payload.paths:
        src = _inside(OUTPUT_DIR, rel)
        if not src or not src.is_file() or src.suffix.lower() not in GALLERY_EXTS:
            skipped += 1
            continue
        if src.parent.resolve() == dest.resolve():
            continue
        target = dest / src.name
        n = 1
        while target.exists():
            target = dest / f"{src.stem}_{n}{src.suffix}"
            n += 1
        shutil.move(str(src), str(target))
        moved[str(src.resolve())] = str(target.resolve())
    if moved:                                         # keep scheduled jobs pointing at the right file
        with _job_lock:
            jobs = load_jobs()
            changed = False
            def fix(value):
                nonlocal changed
                if not value:
                    return value
                real = P._real_path(value)
                new = moved.get(str(Path(real).resolve())) if real else None
                if new:
                    changed = True
                    return out_url(new) if str(value).startswith("/output/") else new
                return value
            for j in jobs:
                if j.get("media"):
                    j["media"] = fix(j["media"])
                if j.get("media_paths"):
                    j["media_paths"] = [fix(x) for x in j["media_paths"]]
            if changed:
                save_jobs(jobs)
    return {"status": "success", "moved": len(moved), "skipped": skipped}

@app.delete("/api/gallery/{filename:path}")
def delete_gallery_item(filename: str):
    target = _inside(OUTPUT_DIR, filename)
    if target and target.exists() and target.is_file() and target.suffix.lower() in GALLERY_EXTS:
        target.unlink()
        return {"status": "success", "deleted": filename}
    raise HTTPException(status_code=404, detail="File not found")

# Serve output and input directories as static files
app.mount("/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")
app.mount("/input", StaticFiles(directory=str(INPUT_DIR)), name="input")
app.mount("/music", StaticFiles(directory=str(MUSIC_DIR)), name="music")

# React frontend (built with `npm run build` in frontend/)
# The built UI lives next to this folder (Studio/frontend/dist); APP_DIST_DIR can point somewhere else
DIST_DIR = Path(os.environ.get("APP_DIST_DIR") or BASE_DIR.parent / "frontend" / "dist")

if (DIST_DIR / "index.html").exists():
    if (DIST_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])   # HEAD too, so health checks and `curl -I` work
    def serve_spa(full_path: str):
        if full_path.startswith(("api/", "output/", "input/", "music/")):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (DIST_DIR / full_path).resolve()
        # Serve real files from dist (images, favicon); otherwise fall back to the SPA shell
        if full_path and candidate.is_file() and DIST_DIR.resolve() in candidate.parents:
            return FileResponse(candidate)
        # A missing file (has an extension) is a real 404, not a client-side route
        if "." in full_path.rsplit("/", 1)[-1]:
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(DIST_DIR / "index.html")
else:
    @app.api_route("/", methods=["GET", "HEAD"])
    def serve_index():
        return {"message": "InstaStudio AI backend running. Build the UI with `cd frontend && npm run build`."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web_server:app", host="127.0.0.1", port=8000, reload=True)
