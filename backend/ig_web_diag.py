"""
Test the website-style carousel poster one step at a time, using the session ID saved in Settings (.env).

  python ig_web_diag.py                  # read the page tokens, check the session, upload 2 pictures. Posts NOTHING.
  python ig_web_diag.py --publish        # same, then publish them as a carousel (a REAL post)
  python ig_web_diag.py a.png b.png      # choose the pictures (default: the two newest in output/)

It stops at the first problem and says which step failed.
"""
import glob
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
import os  # noqa: E402

import instagram_web as W  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith("--")]
publish = "--publish" in sys.argv
pics = [Path(a) for a in args] or [Path(p) for p in sorted(glob.glob("output/*.png") + glob.glob("output/*.jpg"),
                                                          key=lambda f: Path(f).stat().st_mtime)[-2:]]
if len(pics) < 2:
    sys.exit("Need two pictures.")

client = W.WebClient(os.environ.get("IG_SESSION_ID", ""))
print("1. reading the page tokens from instagram.com")
client.bootstrap()
print("2. checking the session")
try:
    client.check()
except W.WebSessionExpired as e:
    sys.exit(f"   FAILED: {e}\n   Reconnect in Settings (paste a fresh sessionid) and run this again.")

print(f"3. uploading {len(pics)} pictures (not posted yet)")
jpegs, temps = W.prepare_jpegs(pics)
ids = []
try:
    for jp in jpegs:
        ids.append(client.upload_photo(jp))
        time.sleep(0.4)
    print("   all uploads accepted")
    if not publish:
        print("\nSteps 1 to 3 worked. Nothing was posted. Run again with --publish to make the real carousel post.")
        sys.exit(0)
    print("4. publishing the carousel (a real post)")
    time.sleep(1.5)
    result = client.publish_carousel(ids, "carousel test")
    print("   PUBLISHED:", result.get("url") or result)
except (W.WebSessionExpired, W.WebPostError) as e:
    print(f"   FAILED: {e}")
finally:
    for t in temps:
        try:
            os.unlink(t)
        except OSError:
            pass
