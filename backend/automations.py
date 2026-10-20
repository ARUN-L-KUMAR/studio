"""
Daily automations: "every day at 09:00, make a <pipeline> and post it".

An automation is a saved rule: at which times (and weekdays / dates) and to which account, and what to post. Two kinds:
  - "generate" (the default): make something NEW with an AI pipeline, then post it. The prompt comes from a rotating
    list or from the caption AI (a fresh idea from a theme each time). Pipelines that start from a photo or video need
    input files, and EACH input (for Face Swap: the target photo and the reference face) is either one fixed uploaded
    file, or a Vault folder whose files are used one after the other.
  - "own": post photos / videos you chose, exactly as they are, with no AI generation. They are taken from a Vault
    folder one after the other, each only once (or starting over, if you ask for that). The caption AI still writes
    the caption from the picture.

How it runs: the server's scheduler calls tick() every 30 seconds. When a time has come, tick() adds an ordinary job
to the queue (post time = now). From there the normal flow takes over: generate, caption, post (or only prepare it in
dry-run mode), retry on failure. So an automation never posts by a different route than a job you queued yourself.

- A time that was missed (the server was off) is still run if it is less than 2 hours late, otherwise it is skipped.
- A new or edited automation starts from that moment: times earlier today are not back-filled.
- Rules live in automations.json next to this file (private, in .gitignore).
"""
import json
import os
import re
import threading
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import captioner
import folders
import instagram_api
import vault_meta
from batch import load_jobs, save_jobs

BASE = Path(__file__).resolve().parent
FILE = Path(os.environ.get("APP_AUTOMATIONS_FILE") or BASE / "automations.json")

CATCH_UP = timedelta(minutes=120)       # a missed time is still run if it is less than this late
RETRY_AFTER = timedelta(minutes=5)      # after a problem (AI down, empty folder) wait this long before trying again
FILE_TASKS = {"image_to_video": "image", "image_to_image": "image", "face_swap": "image", "video_to_video": "video"}
# the inputs (roles) each pipeline needs, and what kind of file each one is
FILE_ROLES = {"image_to_video": ["image"], "image_to_image": ["image"], "face_swap": ["image", "face"], "video_to_video": ["video"]}
ROLE_KIND = {"image": "image", "face": "image", "video": "video"}
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")
VIDEO_EXTS = (".mp4", ".mov")
TIME_RE = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
MAX_RULES, MAX_TIMES, MAX_PROMPTS = 20, 8, 200

router = APIRouter(prefix="/api/automations", tags=["automations"])
_file_lock = threading.Lock()
_hooks = {"job_lock": threading.Lock(), "output_dir": BASE / "output", "resolve_media": lambda u: None, "get_config": lambda: {}}


def configure(job_lock, output_dir, resolve_media, get_config):
    """web_server.py gives us its job lock, output folder, upload resolver and config reader."""
    _hooks.update(job_lock=job_lock, output_dir=Path(output_dir), resolve_media=resolve_media, get_config=get_config)
    vault_meta.configure(output_dir)


class _Skip(Exception):
    """This run cannot be made right now (explained in the message); it is tried again a little later."""
    status = "error"
    retry = RETRY_AFTER


class _Wait(_Skip):
    """Nothing to do until something changes (for example every photo has been posted). Not an error."""
    status = "waiting"
    retry = timedelta(minutes=30)


# ====================================================================== storage
def _load() -> dict:
    try:
        d = json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:
        d = {}
    d.setdefault("rules", [])
    return d


def _save(d: dict):
    FILE.write_text(json.dumps(d, indent=1), encoding="utf-8")


def _get(rule_id: str) -> Optional[dict]:
    with _file_lock:
        return next((r for r in _load()["rules"] if r["id"] == rule_id), None)


def _update_state(rule_id: str, fn):
    with _file_lock:
        d = _load()
        for r in d["rules"]:
            if r["id"] == rule_id:
                fn(r["state"])
                _save(d)
                return


# ====================================================================== when a rule runs
def _parse(s: Optional[str]) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(s) if s else None
    except ValueError:
        return None


def _day_ok(rule: dict, d: date) -> bool:
    if rule["days"] and d.weekday() not in rule["days"]:
        return False
    if rule.get("start_date") and d.isoformat() < rule["start_date"]:
        return False
    if rule.get("end_date") and d.isoformat() > rule["end_date"]:
        return False
    return True


def _slots_on(rule: dict, d: date):
    for t in rule["times"]:
        h, m = map(int, t.split(":"))
        yield datetime(d.year, d.month, d.day, h, m)


def _due_slots(rule: dict, now: datetime):
    """[(key, slot_time)] that should be made now: a pending "run now", then times that arrived and are not too late."""
    st = rule["state"]
    out = []
    if st.get("run_now"):
        out.append(("manual", now))
    if not rule["enabled"]:
        return out
    since = _parse(rule.get("since")) or datetime.min
    fired = set(st.get("fired", []))
    for d in (now.date() - timedelta(days=1), now.date()):          # yesterday too, for a time just before midnight
        if not _day_ok(rule, d):
            continue
        for slot in _slots_on(rule, d):
            key = slot.strftime("%Y-%m-%d %H:%M")
            if slot > since and slot <= now and now - slot <= CATCH_UP and key not in fired:
                out.append((key, slot))
    return out


def next_runs(rule: dict, now: Optional[datetime] = None, days: int = 7, limit: int = 12) -> List[str]:
    """The next times this automation will run (empty when it is switched off)."""
    if not rule["enabled"]:
        return []
    now = now or datetime.now()
    since = _parse(rule.get("since")) or datetime.min
    out = []
    for i in range(days + 1):
        d = now.date() + timedelta(days=i)
        if not _day_ok(rule, d):
            continue
        for slot in _slots_on(rule, d):
            if slot > now and slot > since:
                out.append(slot.strftime("%Y-%m-%d %H:%M"))
    return out[:limit]


# ====================================================================== making a job
def _files_in(folder: str, kind: str) -> List[Path]:
    """Photos ("image"), videos ("video") or both ("any") in a folder of the Vault, in name order."""
    name = folders.resolve_folder(folder or "")
    if not name:
        return []
    exts = VIDEO_EXTS if kind == "video" else IMAGE_EXTS + VIDEO_EXTS if kind == "any" else IMAGE_EXTS
    d = _hooks["output_dir"] / name
    return sorted((f for f in d.iterdir() if f.is_file() and f.suffix.lower() in exts), key=lambda f: f.name.casefold())


def _folder_files(rule: dict) -> List[Path]:
    """The files of an "own files" automation's folder."""
    return _files_in(rule.get("input_folder") or "", "any")


def _role_label(pipeline: str, role: str) -> str:
    if role == "face":
        return "reference face photo"
    if role == "video":
        return "video"
    return "target photo" if pipeline == "face_swap" else "photo"


def _roles(rule: dict) -> dict:
    """Where each input of the rule's pipeline comes from: {role: {"mode": "file" | "folder", "folder": str, "path": str}}.
    Automations saved before this choice existed used a folder for the photo / video and one uploaded face."""
    need = FILE_ROLES.get(rule.get("pipeline"), [])
    inputs = rule.get("inputs")
    if inputs is None:
        inputs = {}
        for role in need:
            if role == "face":
                inputs[role] = {"mode": "file", "folder": "", "path": rule.get("face_path", "")}
            else:
                inputs[role] = {"mode": "folder", "folder": rule.get("input_folder", ""), "path": ""}
    return {r: inputs[r] for r in need if r in inputs}


def _build_job(rule: dict, now: datetime):
    """(job dict, state changes) for one run. Raises _Skip when it can't be made right now."""
    st = rule["state"]
    pipeline = rule["pipeline"]
    adv = {}

    if rule.get("source") == "own":
        return _build_own_job(rule, now)

    if rule["prompt_mode"] == "list":
        prompts = rule["prompts"]
        if not prompts:
            raise _Skip("The prompt list is empty.")
        i = st.get("next_prompt", 0) % len(prompts)
        prompt = prompts[i]
        adv["next_prompt"] = (i + 1) % len(prompts)
    else:
        kind = FILE_TASKS.get(pipeline)
        purpose = ("a vertical Reel video" if pipeline.endswith("video") else "a photo") if not kind else (
            "the new look of a given video clip" if kind == "video" else
            "the new scene around a given person" if pipeline == "face_swap" else
            "the motion that animates a given photo" if pipeline == "image_to_video" else "an edit of a given photo")
        try:
            prompt = captioner.generate_prompt_idea(_hooks["get_config"]().get("caption") or {}, rule["theme"], purpose, avoid=st.get("recent"))
        except Exception as e:
            raise _Skip(f"The AI could not write an idea: {str(e)[:200]}")
        adv["recent"] = (st.get("recent", []) + [prompt])[-20:]

    job = {"task": pipeline, "prompt": prompt, "status": "pending", "post_at": now.strftime("%Y-%m-%d %H:%M"),
           "created_at": now.strftime("%Y-%m-%d %H:%M:%S"), "automation": rule["id"], "automation_name": rule["name"]}

    roles = FILE_ROLES.get(pipeline, [])
    if roles:
        spec = _roles(rule)
        idx = dict(st.get("next_idx", {}))
        for role in roles:
            sp = spec.get(role) or {}
            label = _role_label(pipeline, role)
            if sp.get("mode") == "file":                      # one fixed uploaded file
                fixed = sp.get("path")
                if not fixed or not Path(fixed).is_file():
                    raise _Skip(f"The uploaded {label} is missing. Upload it again in the automation.")
                job[role] = fixed
            else:                                             # the next file of a Vault folder
                kind = ROLE_KIND[role]
                files = _files_in(sp.get("folder", ""), kind)
                if not files:
                    raise _Skip(f"The folder “{sp.get('folder')}” has no {'videos' if kind == 'video' else 'photos'} for the {label}.")
                first = st.get("next_file", 0) if role != "face" else 0       # counters of rules saved before per-input counters
                i = idx.get(role, first) % len(files)
                job[role] = str(files[i].resolve())
                idx[role] = (i + 1) % len(files)
        adv["next_idx"] = idx

    if rule.get("account"):
        try:
            job["account"] = instagram_api.get_account(rule["account"])["id"]
        except instagram_api.InstagramApiError as e:
            raise _Skip(str(e))
    return job, adv


def _build_own_job(rule: dict, now: datetime):
    """A job that posts one of the user's own files as it is: it carries `media`, so the queue skips generation."""
    st = rule["state"]
    files = _folder_files(rule)
    if not files:
        raise _Skip(f"The folder “{rule.get('input_folder')}” has no photos or videos to post.")
    used = [u for u in st.get("used", []) if any(f.name == u for f in files)]      # forget files that are gone
    meta = vault_meta.snapshot()
    left = [f for f in files if f.name not in used and not vault_meta.info(f, meta)["posted"]]   # never repost a "Posted" file
    if not left:
        if not rule.get("loop"):
            raise _Wait(f"All {len(files)} file{'s' if len(files) != 1 else ''} in “{rule['input_folder']}” have been posted. It continues when you add new ones.")
        used, left = [], files                      # start over from the first file
    pick = left[0]
    is_video = pick.suffix.lower() in VIDEO_EXTS
    job = {"task": "text_to_video" if is_video else "text_to_image",   # only tells the queue whether it is a video
           "prompt": pick.name, "status": "pending", "post_at": now.strftime("%Y-%m-%d %H:%M"),
           "created_at": now.strftime("%Y-%m-%d %H:%M:%S"), "automation": rule["id"], "automation_name": rule["name"],
           "media": str(pick.resolve())}
    if rule.get("account"):
        try:
            job["account"] = instagram_api.get_account(rule["account"])["id"]
        except instagram_api.InstagramApiError as e:
            raise _Skip(str(e))
    return job, {"used": used + [pick.name]}


def tick(now: Optional[datetime] = None) -> int:
    """Called by the server's scheduler every 30 seconds. Adds a queue job for every automation time that has come.
    Returns how many jobs were added."""
    now = now or datetime.now()
    made = 0
    for rid in [r["id"] for r in _load()["rules"]]:
        while True:
            rule = _get(rid)
            if not rule:
                break
            due = _due_slots(rule, now)
            if not due:
                break
            key, slot = due[0]
            retry_at = _parse(rule["state"].get("next_try"))
            if key != "manual" and retry_at and now < retry_at:
                break
            try:
                job, adv = _build_job(rule, now)
            except _Skip as e:
                print(f"[automation] {rule['name']}: {e}")
                _update_state(rid, lambda s, m=str(e), e=e: s.update(last_status=e.status, last_error=m, next_try=(now + e.retry).isoformat(timespec="seconds")))
                break
            with _hooks["job_lock"]:                       # same lock the scheduler and "Run Next Job" use
                jobs = load_jobs()
                jobs.append(job)
                save_jobs(jobs)

            def done(s, key=key):
                if key == "manual":
                    s["run_now"] = False
                else:
                    s["fired"] = (s.get("fired", []) + [key])[-60:]
                s.update(adv)
                s.update(runs=s.get("runs", 0) + 1, last_run_at=now.strftime("%Y-%m-%d %H:%M"), last_status="queued", last_error=None, next_try=None)
            _update_state(rid, done)
            made += 1
            print(f"[automation] {rule['name']}: queued {job['task']} - {job['prompt'][:60]}")
    return made


# ====================================================================== API
class InputSpec(BaseModel):
    """Where one input of a pipeline comes from."""
    mode: Literal["file", "folder"] = "folder"
    folder: str = ""                         # mode "folder": a folder of output/; its files are used one after the other
    file: str = ""                           # mode "file": /input/... address of the uploaded file (empty keeps the saved one)


class RuleIn(BaseModel):
    name: str
    enabled: bool = True
    pipeline: str
    account: str = ""                        # "" = whichever account is active when it posts
    times: List[str]
    days: List[int] = []                     # 0 = Monday ... 6 = Sunday; empty = every day
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    prompt_mode: Literal["list", "ai"] = "list"
    prompts: List[str] = []
    theme: str = ""
    inputs: Dict[str, InputSpec] = {}        # per input ("image", "video", "face"): a fixed uploaded file or a Vault folder
    input_folder: str = ""                   # "own" mode: the folder to post from. Older form: the photo / video folder
    face: str = ""                           # older form: /input/... address of the uploaded reference face
    source: Literal["generate", "own"] = "generate"   # "own": post the files of the folder as they are, no AI generation
    loop: bool = False                       # "own" only: start over when every file has been posted


def _bad(msg: str):
    raise HTTPException(status_code=400, detail=msg)


def _clean(p: RuleIn, old: Optional[dict]) -> dict:
    name = p.name.strip()
    if not 1 <= len(name) <= 60:
        _bad("Give the automation a name (up to 60 characters).")
    own = p.source == "own"
    if not own and p.pipeline not in (_hooks["get_config"]().get("tasks") or {}):
        _bad(f"Unknown pipeline: {p.pipeline}")
    account = ""
    if p.account:
        try:
            account = instagram_api.get_account(p.account)["id"]
        except instagram_api.InstagramApiError as e:
            _bad(str(e))
    times = sorted({t.strip() for t in p.times})
    if not times or len(times) > MAX_TIMES or not all(TIME_RE.fullmatch(t) for t in times):
        _bad(f"Add 1 to {MAX_TIMES} times of day, written like 09:30.")
    days = sorted(set(p.days))
    if any(d not in range(7) for d in days):
        _bad("Days must be Monday to Sunday.")
    for label, v in (("start", p.start_date), ("end", p.end_date)):
        if v:
            try:
                date.fromisoformat(v)
            except ValueError:
                _bad(f"The {label} date is not a valid date.")
    if p.start_date and p.end_date and p.end_date < p.start_date:
        _bad("The end date is before the start date.")

    if own:
        folder = folders.resolve_folder(p.input_folder) or ""
        if not folder:
            _bad("Choose the Vault folder with the photos or videos to post.")
        if not _folder_files({"source": "own", "input_folder": folder}):
            _bad(f"The folder “{folder}” has no photos or videos yet.")
        return {"name": name, "enabled": p.enabled, "pipeline": "own", "account": account, "times": times, "days": days,
                "start_date": p.start_date or None, "end_date": p.end_date or None, "prompt_mode": "list", "prompts": [],
                "theme": "", "inputs": {}, "input_folder": folder, "face_path": "", "source": "own", "loop": bool(p.loop)}

    prompts, theme = [], p.theme.strip()
    if p.prompt_mode == "list":
        prompts = [x.strip() for x in p.prompts if x.strip()]
        if not prompts:
            _bad("Write at least one prompt in the list.")
        if len(prompts) > MAX_PROMPTS or any(len(x) > 500 for x in prompts):
            _bad(f"Use at most {MAX_PROMPTS} prompts of up to 500 characters each.")
    else:
        if not 3 <= len(theme) <= 200:
            _bad("Describe the theme for the AI in 3 to 200 characters, for example “cozy rainy-day aesthetics”.")
        if not any(c.get("configured") for c in captioner.catalog()):
            _bad("The AI needs a caption provider key (Gemini, Groq, OpenRouter or Hugging Face). Add one in Settings.")

    inputs_out = {}
    roles = FILE_ROLES.get(p.pipeline, [])
    if roles:
        specs = dict(p.inputs or {})
        for role in roles:                                    # the older form sent a folder and a face
            if role not in specs:
                specs[role] = InputSpec(mode="file", file=p.face) if role == "face" else InputSpec(mode="folder", folder=p.input_folder)
        before = _roles(old) if old and old.get("pipeline") == p.pipeline else {}
        for role in roles:
            sp = specs[role]
            label = _role_label(p.pipeline, role)
            kind = ROLE_KIND[role]
            if sp.mode == "folder":
                folder = folders.resolve_folder(sp.folder) or ""
                if not folder:
                    _bad(f"Choose the Vault folder for the {label}.")
                if not _files_in(folder, kind):
                    _bad(f"The folder “{folder}” has no {'videos' if kind == 'video' else 'photos'} yet, for the {label}.")
                inputs_out[role] = {"mode": "folder", "folder": folder, "path": ""}
            else:
                fixed = ""
                if sp.file:
                    found = _hooks["resolve_media"](sp.file)
                    if not found or not Path(found).is_file():
                        _bad(f"The {label} could not be found. Upload it again.")
                    fixed = str(Path(found).resolve())
                elif before.get(role, {}).get("mode") == "file":
                    fixed = before[role].get("path", "")            # keep the file saved earlier
                if not fixed or not Path(fixed).is_file():
                    _bad(f"Upload the {label}, or choose a Vault folder for it.")
                inputs_out[role] = {"mode": "file", "folder": "", "path": fixed}

    return {"name": name, "enabled": p.enabled, "pipeline": p.pipeline, "account": account, "times": times, "days": days,
            "start_date": p.start_date or None, "end_date": p.end_date or None, "prompt_mode": p.prompt_mode,
            "prompts": prompts, "theme": theme if p.prompt_mode == "ai" else "", "inputs": inputs_out, "input_folder": "", "face_path": "",
            "source": "generate", "loop": False}


def _public(r: dict) -> dict:
    st = r["state"]
    out = {k: r[k] for k in ("id", "name", "enabled", "pipeline", "account", "times", "days", "start_date", "end_date",
                             "prompt_mode", "prompts", "theme", "input_folder")}
    out["source"] = r.get("source", "generate")
    out["loop"] = bool(r.get("loop"))
    if out["source"] == "own":
        meta, used = vault_meta.snapshot(), set(st.get("used", []))
        out["unused_count"] = sum(1 for f in _folder_files(r) if f.name not in used and not vault_meta.info(f, meta)["posted"])
    out["next_runs"] = next_runs(r)
    out["file_count"] = len(_folder_files(r)) if r.get("source") == "own" else None
    out["inputs"] = {}
    if r.get("source") != "own":
        for role, sp in _roles(r).items():
            if sp.get("mode") == "file":
                fixed = sp.get("path") or ""
                out["inputs"][role] = {"mode": "file", "folder": "", "file_name": Path(fixed).name if fixed else "", "file_ok": bool(fixed and Path(fixed).is_file()), "count": None}
            else:
                out["inputs"][role] = {"mode": "folder", "folder": sp.get("folder", ""), "file_name": "", "file_ok": True,
                                       "count": len(_files_in(sp.get("folder", ""), ROLE_KIND[role]))}
    out["state"] = {"runs": st.get("runs", 0), "last_run_at": st.get("last_run_at"), "last_status": st.get("last_status"),
                    "last_error": st.get("last_error"), "next_prompt": st.get("next_prompt", 0), "run_now": bool(st.get("run_now"))}
    return out


@router.get("")
def list_rules():
    return {"rules": [_public(r) for r in _load()["rules"]]}


@router.get("/folders")
def list_folders():
    """Folders of the Vault that can feed an automation, with how many photos and videos each holds."""
    out = []
    out_dir = _hooks["output_dir"]
    if out_dir.exists():
        for d in sorted(out_dir.iterdir(), key=lambda x: x.name.casefold()):
            if not d.is_dir() or d.name.startswith("."):
                continue
            files = [f for f in d.iterdir() if f.is_file()]
            owner = instagram_api.folder_owner(d.name)
            out.append({"name": d.name, "account": (owner or {}).get("username") if owner else None, "locked": folders.is_locked(d.name),
                        "images": sum(f.suffix.lower() in IMAGE_EXTS for f in files), "videos": sum(f.suffix.lower() in VIDEO_EXTS for f in files)})
    return {"folders": out}


def _new_rule(fields: dict) -> dict:
    now = datetime.now().isoformat(timespec="seconds")
    return {"id": uuid.uuid4().hex[:10], "created_at": now, "since": now, "state": {"runs": 0, **{}}, **fields}


@router.post("")
def create_rule(payload: RuleIn):
    fields = _clean(payload, None)
    with _file_lock:
        d = _load()
        if len(d["rules"]) >= MAX_RULES:
            _bad(f"You can have up to {MAX_RULES} automations.")
        rule = _new_rule(fields)
        d["rules"].append(rule)
        _save(d)
    return {"status": "success", "rule": _public(rule)}


@router.put("/{rule_id}")
def update_rule(rule_id: str, payload: RuleIn):
    with _file_lock:
        d = _load()
        old = next((r for r in d["rules"] if r["id"] == rule_id), None)
        if not old:
            raise HTTPException(status_code=404, detail="Automation not found")
        fields = _clean(payload, old)
        old.update(fields)
        old["since"] = datetime.now().isoformat(timespec="seconds")      # changes apply from now on, no back-filling
        _save(d)
        return {"status": "success", "rule": _public(old)}


class EnabledIn(BaseModel):
    enabled: bool


@router.post("/{rule_id}/enabled")
def set_enabled(rule_id: str, payload: EnabledIn):
    with _file_lock:
        d = _load()
        rule = next((r for r in d["rules"] if r["id"] == rule_id), None)
        if not rule:
            raise HTTPException(status_code=404, detail="Automation not found")
        if payload.enabled and not rule["enabled"]:
            rule["since"] = datetime.now().isoformat(timespec="seconds")  # switching on starts from now
        rule["enabled"] = payload.enabled
        _save(d)
        return {"status": "success", "rule": _public(rule)}


@router.post("/{rule_id}/run-now")
def run_now(rule_id: str):
    """Make one post now (it joins the queue within about 30 seconds). Uses the next prompt / file in the rotation."""
    with _file_lock:
        d = _load()
        rule = next((r for r in d["rules"] if r["id"] == rule_id), None)
        if not rule:
            raise HTTPException(status_code=404, detail="Automation not found")
        rule["state"]["run_now"] = True
        rule["state"]["next_try"] = None
        _save(d)
    return {"status": "success"}


@router.delete("/{rule_id}")
def delete_rule(rule_id: str):
    with _file_lock:
        d = _load()
        n = len(d["rules"])
        d["rules"] = [r for r in d["rules"] if r["id"] != rule_id]
        if len(d["rules"]) == n:
            raise HTTPException(status_code=404, detail="Automation not found")
        _save(d)
    return {"status": "success"}
