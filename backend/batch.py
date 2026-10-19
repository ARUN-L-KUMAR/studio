"""
Batch + scheduler for the Instagram pipeline.

  python batch.py list                 show the queue
  python batch.py run                  run ALL pending jobs now, one after another
  python batch.py run --limit 3        run only the next 3
  python batch.py daemon               keep running; post at the times in config.yaml
                                       (schedule.daily_times) and at each job's post_at

Jobs live in jobs.yaml. Statuses: pending -> done / failed.
A job with `post_at: "2026-10-20 18:30"` runs at that time.
A job without post_at is picked up at the next daily slot.
"""
import argparse, time, traceback
from datetime import datetime

import yaml

from pipeline import CFG, run_job

JOBS_FILE = "jobs.yaml"


def load_jobs():
    try:
        return yaml.safe_load(open(JOBS_FILE, encoding="utf-8")) or []
    except FileNotFoundError:
        return []


def save_jobs(jobs):
    with open(JOBS_FILE, "w", encoding="utf-8") as f:
        yaml.safe_dump(jobs, f, sort_keys=False, allow_unicode=True)


def execute(job):
    print(f"\n=== {job['task']}: {job['prompt'][:60]}")
    try:
        res = run_job(job)
        job.update(status="done", media=res["media"], caption=res["caption"],
                   song=res["song"], posted=res["posted"],
                   finished_at=datetime.now().strftime("%Y-%m-%d %H:%M"))
    except Exception as e:
        traceback.print_exc()
        job.update(status="failed", error=str(e)[:300])


def pending(jobs):
    return [j for j in jobs if j.get("status", "pending") == "pending"]


def cmd_list():
    for i, j in enumerate(load_jobs()):
        print(f"{i:>2}  {j.get('status','pending'):8} {j['task']:15} "
              f"{j.get('post_at','(next slot)'):17} {j['prompt'][:50]}")


def cmd_run(limit=None):
    jobs = load_jobs()
    todo = pending(jobs)[:limit] if limit else pending(jobs)
    for job in todo:
        execute(job)
        save_jobs(jobs)          # save after every job so progress isn't lost
        time.sleep(5)


def cmd_daemon():
    slots = CFG.get("schedule", {}).get("daily_times", [])
    print(f"[daemon] daily slots: {slots}. Ctrl+C to stop.")
    fired = set()
    while True:
        now = datetime.now()
        stamp = now.strftime("%Y-%m-%d %H:%M")
        jobs = load_jobs()
        todo = pending(jobs)

        # 1) jobs with an explicit time that has arrived
        for job in todo:
            if job.get("post_at") and job["post_at"] <= stamp:
                execute(job)
                save_jobs(jobs)

        # 2) daily slot: take the next job that has no post_at
        if now.strftime("%H:%M") in slots and stamp not in fired:
            fired.add(stamp)
            free = [j for j in pending(jobs) if not j.get("post_at")]
            if free:
                execute(free[0])
                save_jobs(jobs)
            else:
                print(f"[daemon] {stamp}: slot reached but queue is empty")

        time.sleep(30)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["list", "run", "daemon"])
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    {"list": cmd_list, "run": lambda: cmd_run(a.limit), "daemon": cmd_daemon}[a.cmd]()
