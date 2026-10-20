"""
Multi-provider caption writer.

API providers (Gemini, Groq, OpenRouter, OpenAI, Hugging Face hosted models) all expose an
OpenAI-compatible /chat/completions API, so one small requests-based client covers them.
Hugging Face Spaces are called through gradio_client with the same Hugging Face token pool
that image/video generation uses.

Image input is sent as a base64 data URL; videos are reduced to one frame. If the chosen
model fails (rate limit, quota, no vision support) the next configured provider is tried.

Models marked tested=True were verified with a real photo; the rest are listed by the
provider but untested.
"""
import base64
import io
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

import requests

TIMEOUT = 75
SPACE_TIMEOUT = 100  # Spaces can queue; give up after this many seconds
MAX_TOKENS = 3000    # "thinking" models spend tokens before answering; small limits return empty text

MINICPM = "openbmb/MiniCPM-V-4.7-Demo"
IMAGE_TO_PROMPT = "ovi054/image-to-prompt"

PROVIDERS = {
    "gemini": {
        "label": "Google Gemini",
        "kind": "api", "key_source": "env",
        "env": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
        "key_prefix": "AIza",
        "base": "https://generativelanguage.googleapis.com/v1beta/openai",
        "default": "gemini-3.5-flash-lite",
        "models": [
            {"id": "gemini-3.5-flash-lite", "label": "Gemini 3.5 Flash Lite", "vision": True, "tested": True, "note": "Fastest vision model tested (about 3s)"},
            {"id": "gemini-3.1-flash-lite", "label": "Gemini 3.1 Flash Lite", "vision": True, "tested": True, "note": "Fast (about 4s)"},
            {"id": "gemini-flash-lite-latest", "label": "Gemini Flash Lite (latest)", "vision": True, "tested": True, "note": "Fast, auto-updating alias"},
            {"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash", "vision": True, "tested": True, "note": "Balanced quality (about 8s)"},
            {"id": "gemini-3.5-flash", "label": "Gemini 3.5 Flash", "vision": True, "tested": True, "note": "Higher quality (about 7s)"},
            {"id": "gemini-flash-latest", "label": "Gemini Flash (latest)", "vision": True, "tested": True, "note": "Auto-updating alias (about 8s)"},
            {"id": "gemini-3-flash-preview", "label": "Gemini 3 Flash Preview", "vision": True, "tested": True, "note": "Slowest tested (about 10s)"},
        ],
    },
    "groq": {
        "label": "Groq",
        "kind": "api", "key_source": "env",
        "env": ["GROQ_API_KEY"],
        "key_prefix": "gsk_",
        "base": "https://api.groq.com/openai/v1",
        "default": "qwen/qwen3.8-27b",
        "models": [
            {"id": "qwen/qwen3.8-27b", "label": "Qwen 3.8 27B", "vision": True, "tested": True, "note": "Sees images, very fast (about 1.5s)"},
            {"id": "openai/gpt-oss-120b", "label": "GPT-OSS 120B", "vision": False, "tested": True, "note": "Text only, uses your prompt not the picture"},
            {"id": "openai/gpt-oss-20b", "label": "GPT-OSS 20B", "vision": False, "tested": True, "note": "Text only, fastest"},
        ],
    },
    "openrouter": {
        "label": "OpenRouter",
        "kind": "api", "key_source": "env",
        "env": ["OPENROUTER_API_KEY"],
        "key_prefix": "sk-or-",
        "base": "https://openrouter.ai/api/v1",
        "default": "openrouter/free",
        "models": [
            {"id": "openrouter/free", "label": "Free models router", "vision": True, "tested": True, "note": "Worked with images (about 20s). OpenRouter picks an available free model"},
            {"id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "label": "Nemotron 3 Nano Omni (free)", "vision": True, "tested": True, "note": "Worked with images (about 18s), occasionally flaky"},
            {"id": "nvidia/nemotron-3.5-super-vl:free", "label": "Nemotron 3.5 Super VL (free)", "vision": True, "tested": True, "note": "Worked with images but slow (about 45s)"},
            {"id": "google/gemma-4-26b-a4b-it:free", "label": "Gemma 4 26B (free)", "vision": True, "tested": False, "note": "Rate-limited upstream when tested, may work later"},
            {"id": "google/gemma-4-31b-it:free", "label": "Gemma 4 31B (free)", "vision": True, "tested": False, "note": "Rate-limited upstream when tested, may work later"},
            {"id": "nvidia/nemotron-3-super-120b-a12b:free", "label": "Nemotron 3 Super (free)", "vision": False, "tested": False, "note": "Text only"},
        ],
    },
    "huggingface": {
        "label": "Hugging Face",
        "kind": "api", "key_source": "hf_pool",
        "env": [],
        "key_prefix": "hf_",
        "base": "https://router.huggingface.co/v1",
        "default": "Qwen/Qwen3-VL-30B-A3B-Instruct",
        "models": [
            {"id": "Qwen/Qwen3-VL-30B-A3B-Instruct", "label": "Qwen3-VL 30B", "vision": True, "tested": False, "note": "Hosted by Hugging Face. Needs inference credits (a free account has none left)"},
            {"id": "google/gemma-4-26B-A4B-it", "label": "Gemma 4 26B", "vision": True, "tested": False, "note": "Hosted by Hugging Face. Needs inference credits (a free account has none left)"},
            {"id": "Qwen/Qwen3.8-27B", "label": "Qwen 3.8 27B", "vision": True, "tested": False, "note": "Hosted by Hugging Face. Needs inference credits (a free account has none left)"},
            {"id": "meta-llama/Llama-4-Scout-17B-16E-Instruct", "label": "Llama 4 Scout 17B", "vision": True, "tested": False, "note": "Hosted by Hugging Face. Needs inference credits (a free account has none left)"},
            {"id": "google/gemma-3-27b-it", "label": "Gemma 3 27B", "vision": True, "tested": False, "note": "Hosted by Hugging Face. Needs inference credits (a free account has none left)"},
        ],
    },
    "hfspaces": {
        "label": "Hugging Face Spaces",
        "kind": "space", "key_source": "hf_pool",
        "env": [],
        "key_prefix": "hf_",
        "base": "",
        "default": MINICPM,
        "models": [
            {"id": MINICPM, "label": "MiniCPM-V 4.7 (chat Space)", "vision": True, "tested": True, "note": "Free Space, worked with images (about 16s). May queue or sleep"},
            {"id": IMAGE_TO_PROMPT, "label": "Image-to-Prompt + text AI", "vision": True, "tested": True, "note": "Free CPU Space describes the picture, then a text AI writes the caption (about 18s)"},
        ],
    },
    "openai": {
        "label": "OpenAI",
        "kind": "api", "key_source": "env",
        "env": ["OPENAI_API_KEY"],
        "key_prefix": "sk-",
        "base": "https://api.openai.com/v1",
        "default": "gpt-4o-mini",
        "models": [
            {"id": "gpt-4o-mini", "label": "GPT-4o mini", "vision": True, "tested": False, "note": "Paid"},
        ],
    },
}

ORDER = ["gemini", "groq", "openrouter", "huggingface", "hfspaces", "openai"]  # fallback order


class CaptionError(RuntimeError):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


# ------------------------------------------------------------------ keys / catalog
def hf_tokens():
    """Hugging Face tokens from the shared pool (see pipeline.get_hf_tokens), known-dead ones dropped."""
    try:
        import pipeline as P
        return P.get_hf_tokens()
    except Exception:
        return []


def _uses_hf_pool(provider):
    return PROVIDERS[provider].get("key_source") == "hf_pool"


def get_key(provider):
    """Key lookup that ignores case, so 'Groq_API_KEY' in .env still works.
    For the Hugging Face providers this is the first token in the account pool."""
    if _uses_hf_pool(provider):
        t = hf_tokens()
        return t[0] if t else None
    wanted = {n.upper() for n in PROVIDERS[provider]["env"]}
    for k, v in os.environ.items():
        if k.strip().upper() in wanted and v and v.strip():
            return v.strip().strip("'\"")
    return None


_NO_CREDITS = {}   # provider -> time of the last HTTP 402 (out of credit)


def key_problem(provider):
    """Returns a short message if the saved key clearly belongs to another service."""
    if provider == "huggingface" and time.time() - _NO_CREDITS.get(provider, 0) < 3600:
        return "This Hugging Face account has no inference credits left. Add credits or use the free Spaces option."
    if _uses_hf_pool(provider):
        try:
            import pipeline as P
            status = P._HF_STATUS["valid"]
            tokens = P.get_hf_tokens(valid_first=False)
            if tokens and status and not any(status.get(t, True) for t in tokens):
                return "Every Hugging Face token was rejected. Create a new token at huggingface.co/settings/tokens."
        except Exception:
            pass
        return None
    key = get_key(provider)
    if not key:
        return None
    if not key.startswith(PROVIDERS[provider]["key_prefix"]):
        for other, p in PROVIDERS.items():
            if other != provider and p["key_prefix"] != "sk-" and key.startswith(p["key_prefix"]):
                return f"This looks like a {p['label']} key, not a {PROVIDERS[provider]['label']} key."
        return f"Keys for {PROVIDERS[provider]['label']} normally start with '{PROVIDERS[provider]['key_prefix']}'."
    return None


def mask(key):
    return "Not configured" if not key else (f"{key[:4]}...{key[-4:]}" if len(key) >= 12 else "********")


def catalog():
    out = []
    for pid in ORDER:
        p = PROVIDERS[pid]
        key = get_key(pid)
        if _uses_hf_pool(pid):
            n = len(hf_tokens())
            preview = f"{n} account(s)" if n else "Not configured"
        else:
            preview = mask(key)
        out.append({
            "id": pid,
            "label": p["label"],
            "kind": p.get("kind", "api"),
            "key_source": p.get("key_source", "env"),
            "configured": bool(key),
            "preview": preview,
            "problem": key_problem(pid),
            "default_model": p["default"],
            "models": p["models"],
        })
    return out


def _model_info(provider, model):
    for m in PROVIDERS[provider]["models"]:
        if m["id"] == model:
            return m
    return {"id": model, "vision": True, "tested": False}  # custom model id: assume it can see


# ------------------------------------------------------------------ media -> image
def _frame_from_video(path):
    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        exe = "ffmpeg"
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "frame.jpg"
        for ts in ("00:00:01.000", "00:00:00.200"):
            try:
                subprocess.run([exe, "-y", "-ss", ts, "-i", str(path), "-frames:v", "1", "-q:v", "3", str(out)],
                               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40)
                if out.exists() and out.stat().st_size > 0:
                    return out.read_bytes()
            except Exception:
                continue
    return None


def image_b64(media_path):
    """Base64 JPEG (max 1024px) of an image, or of one frame from a video. None if unavailable."""
    if not media_path:
        return None
    path = Path(media_path)
    if not path.exists():
        return None
    raw = _frame_from_video(path) if path.suffix.lower() in (".mp4", ".mov", ".webm", ".m4v") else path.read_bytes()
    if not raw:
        return None
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((1024, 1024))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=85)
        raw = buf.getvalue()
    except Exception:
        pass  # send the original bytes
    return base64.b64encode(raw).decode()


def _tiny_image_b64():
    """Small generated gradient used by the Settings test for image-only Spaces."""
    from PIL import Image
    img = Image.new("RGB", (256, 256))
    img.putdata([(x, 120, 255 - x) for y in range(256) for x in range(256)])
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode()


# ------------------------------------------------------------------ one API request
def _post_chat(provider, key, model, system, user_text, img_b64):
    images = img_b64 if isinstance(img_b64, list) else ([img_b64] if img_b64 else [])
    content = user_text
    if images:
        content = [{"type": "text", "text": user_text}] + [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b}"}} for b in images
        ]
    body = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "temperature": 0.85,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}],
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if provider == "openrouter":
        headers["X-Title"] = "InstaStudio AI"
    r = requests.post(PROVIDERS[provider]["base"] + "/chat/completions", json=body, headers=headers, timeout=TIMEOUT)
    if r.status_code != 200:
        detail = r.text[:200].replace(key, "<key>")
        raise CaptionError(f"{PROVIDERS[provider]['label']} HTTP {r.status_code}: {detail}", status=r.status_code)
    payload = r.json()
    if not payload.get("choices"):
        err = payload.get("error") or payload
        raise CaptionError(f"{PROVIDERS[provider]['label']} sent no answer: {str(err)[:160]}")
    msg = payload["choices"][0].get("message") or {}
    text = (msg.get("content") or "").strip()
    if not text:
        raise CaptionError(f"{model} returned an empty reply")
    return text


def _call(provider, model, system, user_text, img_b64):
    """One chat request. For the Hugging Face provider each token in the pool is tried in turn."""
    keys = hf_tokens() if _uses_hf_pool(provider) else [get_key(provider)]
    keys = [k for k in keys if k]
    if not keys:
        raise CaptionError(f"{PROVIDERS[provider]['label']} key is not set")
    last = None
    for key in keys:
        try:
            text = _post_chat(provider, key, model, system, user_text, img_b64)
            _NO_CREDITS.pop(provider, None)
            return text
        except CaptionError as e:
            last = e
            if e.status == 402:
                _NO_CREDITS[provider] = time.time()
            if e.status in (401, 402, 403, 429) and len(keys) > 1:
                continue  # this account is rejected or out of credit, try the next one
            raise
        except requests.RequestException as e:
            raise CaptionError(f"{PROVIDERS[provider]['label']} network error: {type(e).__name__}")
    raise last


# ------------------------------------------------------------------ Hugging Face Spaces
def _first_text(result):
    """Spaces return text in different shapes (str, list, tuple, dict). Pull out the first string."""
    if isinstance(result, str):
        return result.strip()
    if isinstance(result, dict):
        for k in ("text", "value", "content", "response"):
            if k in result:
                t = _first_text(result[k])
                if t:
                    return t
        return ""
    if isinstance(result, (list, tuple)):
        for item in reversed(result):
            t = _first_text(item)
            if t:
                return t
    return ""


def _call_space(model, system, user_text, img_b64):
    from gradio_client import Client, handle_file
    if isinstance(img_b64, list):          # Spaces take a single picture: use the first one
        img_b64 = img_b64[0] if img_b64 else None
    tmp_path = None
    if img_b64:
        fd, tmp_path = tempfile.mkstemp(suffix=".jpg")
        with os.fdopen(fd, "wb") as f:
            f.write(base64.b64decode(img_b64))
    try:
        if model == IMAGE_TO_PROMPT and not tmp_path:
            raise CaptionError("This Space needs a picture")
        last = None
        for token in (hf_tokens() or [None]):
            try:
                client = Client(model, token=token, verbose=False)
                if model == IMAGE_TO_PROMPT:
                    job = client.submit(image=handle_file(tmp_path), api_name="/predict")
                else:
                    job = client.submit(
                        message=f"{system}\n\n{user_text}",
                        history=[],
                        files=[handle_file(tmp_path)] if tmp_path else None,
                        thinking_mode=False,
                        max_new_tokens=700,
                        temperature=0.8,
                        api_name="/predict",
                    )
                text = _first_text(job.result(timeout=SPACE_TIMEOUT))
                if not text:
                    raise CaptionError(f"{model} returned an empty reply")
                return text
            except Exception as e:  # quota, sleeping Space, timeout: try the next account
                last = e
        raise CaptionError(f"{model} Space failed: {str(last)[:160]}")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def _parse_json(text):
    """Extract the JSON object from a reply. Some free models ignore the JSON instruction and
    answer in plain text; in that case the whole reply is used as the caption."""
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            data = json.loads(text[start:end + 1])
            if isinstance(data, dict):
                return data
        except ValueError:
            pass
    plain = text.strip().strip("`").strip()
    if not plain:
        raise CaptionError("Empty reply")
    return {"caption": plain}


def _write_from_description(system, media_kind, description):
    """Two-step helper: turn a plain picture description into a caption using any configured text API."""
    text = (f"Content type: {media_kind}. An image-description tool saw this picture: {description}\n"
            "Write the Instagram caption for this picture.")
    errors = []
    for pid in ORDER:
        if PROVIDERS[pid].get("kind", "api") != "api" or not get_key(pid):
            continue
        try:
            return _parse_json(_call(pid, PROVIDERS[pid]["default"], system, text, None))
        except Exception as e:
            errors.append(f"{pid}: {str(e)[:80]}")
    raise CaptionError("No text AI could write from the description. " + " | ".join(errors))


# ------------------------------------------------------------------ public API
def _attempts(provider, model, has_image, default_provider):
    """Ordered (provider, model) tries: the chosen one first, then every other configured provider."""
    first = provider or default_provider or "gemini"
    seq = []
    if first in PROVIDERS and get_key(first):
        m = model or PROVIDERS[first]["default"]
        seq.append((first, m))
    for pid in ORDER:
        if pid == first or not get_key(pid):
            continue
        seq.append((pid, PROVIDERS[pid]["default"]))
    if has_image:
        # a text-only model can't see the picture, so try vision models first
        seq.sort(key=lambda pm: 0 if _model_info(*pm)["vision"] else 1)
    return seq[:5]


_MEDIA_NAME = re.compile(r"\.(png|jpe?g|webp|gif|mp4|mov|m4v|webm)$", re.IGNORECASE)


def caption_json(cfg, prompt, media_kind, media_path=None, provider=None, model=None, media_paths=None):
    """
    Returns (data, provider_used, model_used) where data = {caption, hashtags, song_suggestion}.
    cfg is the `caption` section of config.yaml. media_paths = several pictures of one carousel
    (up to 4 are shown to the AI so the caption fits the whole set).
    """
    system = (
        "You write Instagram captions that sound like a real person, not an AI. "
        f"Tone: {cfg.get('tone', 'natural')}. Language: {cfg.get('language', 'English')}. "
        "FIRST look carefully at the picture(s). The caption must be about what is actually visible: "
        "work in at least one concrete detail (who or what is in it, an animal, an object, clothing, a colour, "
        "the place, the light or mood) in a natural way. Never write something that could fit any photo. "
        "The tone changes the style of the writing, never the subject. "
        "Do not say 'the image shows' or describe it like a report. "
        "Reply ONLY with JSON: "
        '{"caption": str, "hashtags": [str], "song_suggestion": str}. '
        f"Use at most {cfg.get('max_hashtags', 12)} hashtags, each a separate single word in the list, "
        "relevant to what is visible plus the mood (a mix of trending, niche and broad). "
        "song_suggestion = one currently popular song that fits the mood, written as 'Artist - Title'."
    )
    paths = [p for p in (media_paths or [media_path]) if p][:4]
    imgs = [b for b in (image_b64(p) for p in paths) if b]
    saved_models = cfg.get("models") or {}
    default_provider = cfg.get("provider")
    if provider and not model:
        model = saved_models.get(provider)

    attempts = _attempts(provider, model, bool(imgs), default_provider)
    if not attempts:
        raise CaptionError("No caption AI is configured. Add a Gemini, Groq, OpenRouter or Hugging Face key in Settings.")

    idea = (prompt or "").strip()
    if _MEDIA_NAME.search(idea):
        idea = ""          # a vault file name tells the AI nothing about the picture

    errors = []
    for pid, mid in attempts:
        is_space = PROVIDERS[pid].get("kind") == "space"
        use_img = imgs if (imgs and _model_info(pid, mid)["vision"]) else None
        if use_img:
            if len(use_img) > 1:
                text = (f"Content type: {media_kind}. These {len(use_img)} pictures are ONE carousel post. "
                        "Write a single caption that fits the whole set.")
            else:
                text = f"Content type: {media_kind}. Write the caption for the attached picture."
            if idea:
                text += f" Background idea (use only if helpful): {idea}"
        else:
            text = f"Content type: {media_kind}. Content idea: {idea or 'a lifestyle photo'}"
        try:
            if is_space and mid == IMAGE_TO_PROMPT:
                if not use_img:
                    raise CaptionError("needs a picture")
                data = _write_from_description(system, media_kind, _call_space(mid, system, text, use_img))
            elif is_space:
                data = _parse_json(_call_space(mid, system, text, use_img))
            else:
                data = _parse_json(_call(pid, mid, system, text, use_img))
            if not str(data.get("caption", "")).strip():
                raise CaptionError("empty caption")
            return data, pid, mid
        except Exception as e:  # try the next provider
            errors.append(f"{pid}/{mid}: {str(e)[:160]}")
            time.sleep(0.4)
    raise CaptionError("All caption providers failed. " + " | ".join(errors))


def generate_prompt_idea(cfg, theme, purpose, avoid=None, provider=None):
    """One fresh prompt for an image / video generator, written from a theme (used by the daily automations).
    purpose = what the prompt is for, e.g. "a vertical Reel video" or "motion to animate a given photo".
    avoid = recent prompts, so the new one is different. Tries the chosen provider, then every other configured one."""
    system = (
        "You write prompts for an AI image and video generator that makes Instagram content. "
        'Reply ONLY with JSON: {"prompt": str}. '
        "The prompt is ONE vivid sentence of at most 40 words describing a single scene: subject, setting, light, mood"
        " and, for video, the camera or motion. No hashtags, no quotation marks, no brand names, no real people's names."
    )
    text = f"Theme: {theme}. The prompt is for {purpose}."
    recent = [a for a in (avoid or []) if a][-10:]
    if recent:
        text += " Do NOT repeat or closely resemble these earlier prompts: " + " | ".join(r[:120] for r in recent)
    attempts = _attempts(provider, None, False, cfg.get("provider"))
    if not attempts:
        raise CaptionError("No caption AI is configured. Add a Gemini, Groq, OpenRouter or Hugging Face key in Settings.")
    errors = []
    for pid, mid in attempts:
        try:
            if PROVIDERS[pid].get("kind") == "space":
                if mid == IMAGE_TO_PROMPT:
                    raise CaptionError("needs a picture")
                raw = _call_space(mid, system, text, None)
            else:
                raw = _call(pid, mid, system, text, None)
            idea = str(_parse_json(raw).get("prompt", "")).strip().strip("\"'")
            if len(idea) < 8:
                raise CaptionError("empty idea")
            return idea[:400]
        except Exception as e:
            errors.append(f"{pid}/{mid}: {str(e)[:120]}")
            time.sleep(0.4)
    raise CaptionError("All caption providers failed. " + " | ".join(errors))


def quick_test(provider, model):
    """Tiny round trip used by the Settings 'Test' button. Returns (ms, sample)."""
    system = 'Reply ONLY with JSON: {"caption": str}'
    t = time.time()
    if PROVIDERS[provider].get("kind") == "space":
        if model == IMAGE_TO_PROMPT:
            text = _call_space(model, system, "", _tiny_image_b64())
        else:
            text = _call_space(model, system, "Write a 6 word caption about a sunny morning coffee.", None)
        return int((time.time() - t) * 1000), _parse_json(text).get("caption", "")[:120]
    data = _parse_json(_call(provider, model, system, "Write a 6 word caption about a sunny morning coffee.", None))
    return int((time.time() - t) * 1000), str(data.get("caption", ""))[:120]
