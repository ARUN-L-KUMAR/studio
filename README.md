# Studio (InstaStudio AI)

Create images and Reels with AI, write the caption, and post to one or more Instagram accounts. It has a web studio (React) on top of a Python (FastAPI) backend.

- **Generate:** text to image/video, image to video, face swap, video/image restyle, through Hugging Face Spaces (several tokens, automatic failover).
- **Caption:** Gemini, Groq, OpenRouter, OpenAI or Hugging Face, with automatic fallback.
- **Post:** single photo, Reel, carousel or slideshow, with a song and a clip of it, through the official Instagram API. Post now or schedule.
- **Several Instagram accounts:** switch the active account in the top bar. Each account has its own output folder and Vault.
- **Vault:** browse, select several, move between account folders, full-screen view, delete.
- **Login:** password protected, so it is safe to run on a server.

## Project layout

```
Studio/
├── backend/                  Python (FastAPI) server and everything it saves
│   ├── web_server.py         API + serves the built frontend
│   ├── pipeline.py           generation, music, slideshow, publishing
│   ├── captioner.py          caption AI providers
│   ├── instagram_api.py      official Instagram API, multi-account
│   ├── instagram_direct.py   phone-style login (songs)
│   ├── instagram_web.py      browser-session carousel route
│   ├── auth.py               password login, sessions, rate limit
│   ├── batch.py              command-line queue / scheduler
│   ├── run_web.py            start the server
│   ├── set_password.py       set the login password
│   ├── app.py, ig_web_diag.py   old Streamlit screen and a diagnostic script
│   ├── config.yaml           models, caption, schedule settings
│   ├── requirements.txt      Python packages
│   ├── .env.example          copy to .env and fill in
│   └── output/ input/ music/ your files, one output sub-folder per Instagram account (not in git)
├── frontend/                 React + TypeScript + Vite app
└── .gitignore
```

Files that hold secrets or your data (`.env`, `auth.json`, `ig_*.json`, `jobs.yaml`, `hf_quota.json`, `output/`, `input/`, `music/`) are listed in `.gitignore` and are never committed.

## Set up

You need Python 3.11+, Node.js 18+ and [ffmpeg](https://ffmpeg.org).

```bash
# 1. Python packages (from the project root)
python -m venv .venv
.venv/Scripts/activate            # Windows.   macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt

# 2. Settings
cp backend/.env.example backend/.env      # then add your keys (or use the Settings page later)

# 3. Build the web app once
cd frontend
npm install
npm run build
cd ..
```

## Run

```bash
python backend/run_web.py
```

Open <http://localhost:8000>. For development with hot reload run `npm run dev` inside `frontend/` and open <http://localhost:5173> (it proxies `/api` to the backend).

`dry_run: true` in `backend/config.yaml` generates everything but does not publish. Turn it off in the app (top bar) when you are ready to post for real.

## Instagram

1. The Instagram account must be a **Business or Creator** account.
2. In Settings, add each account with its access token (Instagram API with Instagram Login) and add your Cloudinary URL, which hosts the media for the official API.
3. Tokens last 60 days and are renewed automatically while the server runs.

Songs on posts use a phone-style login (username and password, or a session ID) in addition to the official API.

## Deploying to your own server

1. Copy the project to the server and do the **Set up** steps above (or copy `frontend/dist` from your PC and skip Node).
2. Put these in `backend/.env`: `APP_HOST=0.0.0.0`, `APP_PORT=8000`, `APP_RELOAD=0`, `APP_OPEN_BROWSER=0`.
3. Set the login password **before** anyone else can reach it: `python backend/set_password.py`. Until a password exists, the app only opens on the server itself.
4. Start it with `python backend/run_web.py` and keep it running (a service, `tmux`, or similar). Scheduled posts run inside this process, so the server must stay on.
5. Use HTTPS (a Cloudflare Tunnel or Caddy in front). Without it the password travels unencrypted. If the site uses its own domain, add it to `APP_ALLOWED_ORIGINS`.
6. Back up `backend/output`, `backend/input`, `backend/music`, `backend/.env`, `backend/auth.json`, `backend/ig_*.json` and `backend/jobs.yaml`.

## Notes

- Free Hugging Face Spaces can queue, sleep or run out of GPU quota. Adding more tokens gives the app more to fall back on.
- Instagram allows 100 API posts per account per 24 hours. Reels need 9:16 video, 3 to 90 seconds.
- Run commands from anywhere: the server finds its own files. Command-line tools such as `python backend/batch.py list` work the same way when run from `backend/`.
