"""
Web UI:  streamlit run app.py
Pick the model, generate, preview, edit the caption, then post now or add to the queue.
"""
import json
from datetime import datetime, time as dtime
from pathlib import Path

import streamlit as st

import pipeline as P
from batch import load_jobs, save_jobs

st.set_page_config(page_title="Insta AI Studio", page_icon="🎬", layout="wide")
st.title("🎬 Insta AI Studio")

TASKS = list(P.CFG["tasks"].keys())
ss = st.session_state
for k in ("media", "caption", "song", "job"):
    ss.setdefault(k, None)

with st.sidebar:
    st.header("Settings")
    dry = st.toggle("Dry run (don't post)", value=P.CFG["instagram"]["dry_run"])
    st.caption("Tokens are read from your .env file.")

tab_create, tab_queue = st.tabs(["Create", "Queue"])

# ------------------------------------------------------------------ CREATE
with tab_create:
    left, right = st.columns([1, 1])

    with left:
        task = st.selectbox("What do you want to make?", TASKS)
        needs_img = task in ("image_to_video", "image_to_image", "face_swap")
        needs_vid = task == "video_to_video"
        needs_face = task == "face_swap"

        base = P.CFG["tasks"][task]
        with st.expander("Model (Hugging Face Space)", expanded=True):
            space = st.text_input("Space ID", base["space"])
            api_name = st.text_input("api_name", base["api_name"])
            params = st.text_area("params (JSON)", json.dumps(base["params"], indent=2), height=140)

        prompt = st.text_area("Prompt / idea", height=100,
                              placeholder="a girl walking in a rainy neon city, cinematic")

        def save_upload(up):
            Path("input").mkdir(exist_ok=True)
            path = str(Path("input") / up.name)
            Path(path).write_bytes(up.getbuffer())
            return path

        IMG_TYPES = ["png", "jpg", "jpeg", "webp"]
        up_path = face_path = None
        if needs_face:
            st.caption("Only use photos of people who have given consent.")
            up = st.file_uploader("Reference face", type=IMG_TYPES, key="face_up")
            if up:
                face_path = save_upload(up)
        if needs_img or needs_vid:
            label = "Target image (body/scene)" if needs_face else "Input " + ("image" if needs_img else "video")
            up = st.file_uploader(label, type=IMG_TYPES if needs_img else ["mp4", "mov"], key="main_up")
            if up:
                up_path = save_upload(up)

        missing_input = (needs_img or needs_vid) and not up_path or needs_face and not face_path
        if st.button("⚡ Generate", type="primary", disabled=not prompt or missing_input):
            try:
                override = {"space": space, "api_name": api_name, "params": json.loads(params)}
                job = {"task": task, "prompt": prompt, "override": override,
                       "image": up_path if needs_img else None,
                       "video": up_path if needs_vid else None,
                       "face": face_path if needs_face else None}
                with st.spinner("Generating on Hugging Face... this can take a few minutes"):
                    media = P.generate(task, prompt, job["image"], job["video"], override, job["face"])
                    if task.endswith("video"):
                        media = P.add_music(media)
                with st.spinner("Writing caption..."):
                    cap, song = P.make_caption(prompt, "Reel video" if task.endswith("video") else "photo")
                ss.media, ss.caption, ss.song, ss.job = media, cap, song, job
            except Exception as e:
                st.error(f"Failed: {e}")

    with right:
        st.subheader("Preview")
        if ss.media:
            (st.video if ss.media.endswith(".mp4") else st.image)(ss.media)
            ss.caption = st.text_area("Caption (edit freely)", ss.caption, height=220)
            if ss.song:
                st.info(f"🎵 Suggested trending song (add in the Instagram app): **{ss.song}**")

            c1, c2 = st.columns(2)
            if c1.button("🚀 Post now"):
                try:
                    job = {**ss.job, "media": ss.media, "caption": ss.caption}
                    with st.spinner("Uploading & posting..."):
                        res = P.run_job(job, dry_run=dry)
                    st.success("Posted! 🎉" if res["posted"] else "Dry run: nothing was posted.")
                except Exception as e:
                    st.error(f"Post failed: {e}")

            with c2:
                d = st.date_input("Schedule date", datetime.now().date())
                t = st.time_input("Schedule time", dtime(18, 30))
                if st.button("📅 Add to queue at this time"):
                    jobs = load_jobs()
                    jobs.append({**ss.job, "media": ss.media, "caption": ss.caption,
                                 "post_at": f"{d} {t.strftime('%H:%M')}", "status": "pending"})
                    save_jobs(jobs)
                    st.success("Queued. Keep `python batch.py daemon` running.")
        else:
            st.caption("Generated media and caption will appear here.")

# ------------------------------------------------------------------ QUEUE
with tab_queue:
    st.subheader("Batch / schedule queue")
    jobs = load_jobs()
    if jobs:
        st.dataframe([{"status": j.get("status", "pending"), "task": j["task"],
                       "post_at": j.get("post_at", "(next daily slot)"),
                       "prompt": j["prompt"][:70], "error": j.get("error", "")}
                      for j in jobs], use_container_width=True)
    else:
        st.caption("Queue is empty.")

    with st.expander("➕ Add many prompts at once (batch)"):
        btask = st.selectbox("Task for all", TASKS, key="bt")
        lines = st.text_area("One prompt per line", height=150)
        if st.button("Add all to queue") and lines.strip():
            jobs = load_jobs()
            for ln in lines.strip().splitlines():
                if ln.strip():
                    jobs.append({"task": btask, "prompt": ln.strip(), "status": "pending"})
            save_jobs(jobs)
            st.success("Added. They post at your daily slots when the daemon runs.")
            st.rerun()
