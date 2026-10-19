"""
InstaStudio AI Launcher
Runs the FastAPI server and opens your browser.

Settings from the environment (so the same file works on a server):
  APP_HOST          address to listen on (default 127.0.0.1; use 0.0.0.0 to accept other machines)
  APP_PORT          port (default 8000)
  APP_RELOAD=0      turn off auto-reload (use this on a server)
  APP_OPEN_BROWSER=0  do not open a browser window
"""
import os
import sys
import webbrowser
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.chdir(HERE)   # config.yaml, output/, input/ and music/ are found relative to this folder, wherever you start it from

# Auto-switch to the project's virtual environment (Studio/.venv or Studio/backend/.venv) if there is one
for venv_python in (HERE.parent / ".venv" / "Scripts" / "python.exe", HERE.parent / ".venv" / "bin" / "python",
                    HERE / ".venv" / "Scripts" / "python.exe", HERE / ".venv" / "bin" / "python"):
    if venv_python.exists():
        if Path(sys.executable).resolve() != venv_python.resolve():
            import subprocess
            sys.exit(subprocess.call([str(venv_python), str(Path(__file__).resolve())] + sys.argv[1:]))
        break

import uvicorn

HOST = os.environ.get("APP_HOST", "127.0.0.1")
PORT = int(os.environ.get("APP_PORT", "8000"))


def open_browser():
    time.sleep(1.2)
    webbrowser.open(f"http://127.0.0.1:{PORT}")


if __name__ == "__main__":
    print("=" * 60)
    print("Starting InstaStudio AI Web Studio...")
    print(f"URL: http://{'127.0.0.1' if HOST in ('0.0.0.0', '::') else HOST}:{PORT}")
    if not (HERE / "auth.json").exists() and not os.environ.get("APP_PASSWORD"):
        print("No password is set. The app is open on this computer only.")
        print("Set one before putting it online:  python set_password.py")
    print("=" * 60)

    # Open browser automatically in background
    if os.environ.get("APP_OPEN_BROWSER", "1") != "0":
        threading.Thread(target=open_browser, daemon=True).start()

    # One worker only: the scheduler and the job state live in this process
    uvicorn.run("web_server:app", host=HOST, port=PORT, reload=os.environ.get("APP_RELOAD", "1") != "0")
