import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, KeyRound, Repeat, RotateCcw, Users } from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { TASK_BY_KEY } from "../../data/tasks";
import type { Automation, QueueJob } from "../../api/types";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parse = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
};
const until = (d: Date) => {
  const min = Math.round((d.getTime() - Date.now()) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `in ${min} min`;
  if (min < 48 * 60) return `in ${Math.round(min / 60)} h`;
  return `in ${Math.round(min / 1440)} d`;
};
const taskTitle = (k: string) => TASK_BY_KEY[k as keyof typeof TASK_BY_KEY]?.title ?? k;

type Kind = "scheduled" | "running" | "overdue" | "slot" | "open" | "posted" | "auto";
interface Entry {
  key: string;
  at: Date;
  kind: Kind;
  title: string;
  sub: string;
}

const CHIP: Record<Kind, string> = {
  scheduled: "bg-primary-600/15 border-primary-500/40 text-fg",
  running: "bg-primary-600/25 border-primary-400 text-fg",
  overdue: "bg-warning/15 border-warning/60 text-fg",
  slot: "bg-surface-2 border-dashed border-primary-500/50 text-fg",
  open: "bg-transparent border-dashed border-line text-dim",
  posted: "bg-success/15 border-success/40 text-fg",
  auto: "bg-secondary-500/10 border-secondary-500/40 text-fg",
};
const KIND_LABEL: Record<Kind, string> = { scheduled: "Scheduled", running: "Running", overdue: "Overdue", slot: "Daily slot", open: "Open slot", posted: "Posted", auto: "Automation" };

/** Scheduled posts, daily slots, failures and accounts for the next week, in one place. */
export default function PublishingCalendar() {
  const navigate = useNavigate();
  const toast = useToast();
  const { queue, health, config, refreshQueue } = useApp();
  const [retrying, setRetrying] = useState<number | null>(null);
  const [autos, setAutos] = useState<Automation[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => api.automations().then((r) => live && setAutos(r.rules)).catch(() => {});
    load();
    const id = window.setInterval(() => !document.hidden && load(), 30000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const accounts = health?.keys.instagram.official_accounts ?? [];
  const activeName = (accounts.find((a) => a.default) ?? accounts[0])?.username ?? null;
  const target = (j: QueueJob) => (j.account_name ? `@${j.account_name}` : activeName ? `@${activeName}` : "Active account");
  const schedulerOff = config?.schedule?.run_in_server === false;

  const model = useMemo(() => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
    const byDay: Record<string, Entry[]> = Object.fromEntries(days.map((d) => [dayKey(d), []]));
    const todayKey = dayKey(now);
    const put = (e: Entry) => (byDay[dayKey(e.at)] ?? (e.at < today ? byDay[todayKey] : undefined))?.push(e);

    const overdue: QueueJob[] = [];
    const free: QueueJob[] = [];
    for (const j of queue) {
      const st = j.status ?? "pending";
      if (st !== "pending" && st !== "running") continue;
      const at = parse(j.post_at);
      if (!at) {
        if (st === "pending") free.push(j);
        continue;
      }
      const late = st === "pending" && at.getTime() < now.getTime() - 60_000;
      if (late) overdue.push(j);
      put({ key: `j${j.id}`, at: late ? now : at, kind: late ? "overdue" : st === "running" ? "running" : "scheduled", title: taskTitle(j.task), sub: `${target(j)} · ${j.prompt}` });
    }

    // a job without a time goes out at the next daily slot, one job per slot
    const slots = [...(config?.schedule?.daily_times ?? [])].sort();
    let next = 0;
    for (const d of days) {
      for (const s of slots) {
        const [h, m] = s.split(":").map(Number);
        const at = new Date(d);
        at.setHours(h, m, 0, 0);
        if (at.getTime() < now.getTime()) continue;
        const job = free[next++];
        put({ key: `s${dayKey(d)}${s}`, at, kind: job ? "slot" : "open", title: job ? taskTitle(job.task) : "Open slot", sub: job ? `${target(job)} · ${job.prompt}` : "Nothing queued for this time" });
      }
    }

    for (const r of autos) {                           // times that daily automations will run (each makes one post)
      for (const run of r.next_runs) {
        const at = parse(run);
        const who = r.account ? `@${accounts.find((a) => a.id === r.account)?.username ?? r.account}` : activeName ? `@${activeName}` : "Active account";
        if (at) put({ key: `a${r.id}${run}`, at, kind: "auto", title: r.name, sub: `${r.source === "own" ? "Your own files" : taskTitle(r.pipeline)} · ${who}` });
      }
    }
    for (const p of health?.published?.recent ?? []) {
      const at = parse(p.at);
      if (at && dayKey(at) === todayKey) put({ key: `p${p.at}`, at, kind: "posted", title: p.kind || "Post", sub: p.account ? `@${p.account}` : "Instagram" });
    }
    for (const list of Object.values(byDay)) list.sort((a, b) => a.at.getTime() - b.at.getTime());

    const upcoming = Object.values(byDay).flat().filter((e) => ["scheduled", "running", "slot", "auto"].includes(e.kind) && e.at.getTime() >= now.getTime() - 60_000).sort((a, b) => a.at.getTime() - b.at.getTime());
    return { days, byDay, overdue, upcoming, failed: queue.filter((j) => j.status === "failed"), todayKey };
  }, [queue, config, health, activeName, autos]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduledFor = (a: { username: string | null; default: boolean }) =>
    queue.filter((j) => ["pending", "running"].includes(j.status ?? "pending") && (j.account_name ? j.account_name === a.username : a.default)).length;
  const tokenProblems = accounts.filter((a) => a.days_left === 0 || (a.days_left != null && a.days_left <= 7));
  const attention = model.failed.length + model.overdue.length + tokenProblems.length + (schedulerOff ? 1 : 0);

  const retry = async (j: QueueJob) => {
    setRetrying(j.id);
    try {
      await api.retryJob(j.id);
      toast("Back in the queue. It will run within a minute.", "success");
      await refreshQueue();
    } catch (e) {
      toast("Could not retry: " + (e as Error).message, "error");
    } finally {
      setRetrying(null);
    }
  };

  const dayLabel = (d: Date, i: number) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }));

  return (
    <section aria-labelledby="calendar-title">
      <div className="section-head">
        <div>
          <h2 id="calendar-title">Publishing Calendar</h2>
          <p>The next 7 days: scheduled posts, daily slots and what went out today.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button className="btn btn-ghost" onClick={() => navigate("/automations")}><Repeat className="ic-sm w-4 h-4" /><span>Automations</span></button>
          <button className="btn btn-ghost" onClick={() => navigate("/queue")}><span>Open queue</span><ArrowRight className="ic-sm w-4 h-4" /></button>
          <button className="btn btn-soft" onClick={() => navigate("/post")}><CalendarClock className="ic-sm w-4 h-4" /><span>Schedule a post</span></button>
        </div>
      </div>

      {schedulerOff && (
        <div className="mb-4 rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-[14px]">
          <strong>The scheduler is off.</strong> <span className="text-muted">Jobs only run when you start <code>python batch.py daemon</code> or turn <code>run_in_server</code> back on in config.yaml.</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7" role="list" aria-label="Next 7 days">
        {model.days.map((d, i) => {
          const list = model.byDay[dayKey(d)] ?? [];
          const shown = list.slice(0, 4);
          return (
            <div key={dayKey(d)} role="listitem" className={clsx("rounded-lg border p-3 min-h-[132px] bg-surface/60", i === 0 ? "border-primary-500/60" : "border-line")}>
              <div className="flex items-baseline justify-between mb-2">
                <strong className={clsx("text-[14px]", i === 0 && "text-primary-300")}>{dayLabel(d, i)}</strong>
                {list.length > 0 && <span className="text-[12px] text-dim tabular-nums">{list.length}</span>}
              </div>
              {list.length === 0 ? (
                <p className="text-[13px] text-dim">Nothing planned</p>
              ) : (
                <ul className="space-y-1.5">
                  {shown.map((e) => (
                    <li key={e.key} className={clsx("rounded-md border px-2 py-1.5", CHIP[e.kind])} title={`${KIND_LABEL[e.kind]}: ${e.title}. ${e.sub}`}>
                      <span className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                        <span className="tabular-nums">{hhmm(e.at)}</span>
                        <span className="text-[11.5px] font-bold uppercase tracking-wide opacity-80">{KIND_LABEL[e.kind]}</span>
                      </span>
                      <span className="block text-[13px] truncate">{e.title}</span>
                    </li>
                  ))}
                  {list.length > shown.length && <li className="text-[13px] text-muted px-1">+{list.length - shown.length} more</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-3 mt-5">
        {/* Next up */}
        <div className="card">
          <div className="card-head"><h3 className="card-title"><Clock className="ic" />Next up</h3></div>
          {model.upcoming.length === 0 ? (
            <p className="text-[14px] text-muted">Nothing is scheduled. Pick a time on the Post page, add prompts in the Queue, or set up a daily automation.</p>
          ) : (
            <ul className="divide-y divide-line">
              {model.upcoming.slice(0, 5).map((e) => (
                <li key={e.key} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <strong className="text-[14px] truncate">{e.title}</strong>
                    <span className="text-[13px] font-semibold text-primary-300 shrink-0">{until(e.at)}</span>
                  </div>
                  <p className="text-[13px] text-muted truncate">{e.sub}</p>
                  <p className="text-[12.5px] text-dim">{e.at.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}{e.kind === "slot" ? " · daily slot" : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Needs attention */}
        <div className="card">
          <div className="card-head">
            <h3 className="card-title"><AlertTriangle className="ic" />Needs attention</h3>
            {attention > 0 && <span className="badge badge-failed">{attention}</span>}
          </div>
          {attention === 0 ? (
            <p className="flex items-center gap-2 text-[14px] text-muted"><CheckCircle2 className="w-4 h-4 text-success" />No failed posts, overdue jobs or expiring tokens.</p>
          ) : (
            <ul className="space-y-3">
              {model.failed.map((j) => (
                <li key={`f${j.id}`} className="rounded-md border border-danger/40 bg-danger/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block text-[14px]">{taskTitle(j.task)} failed</strong>
                      <p className="text-[13px] text-muted line-clamp-2" title={j.error}>{j.error || "No details were recorded."}</p>
                    </div>
                    <button className="btn btn-sm btn-soft shrink-0" onClick={() => retry(j)} disabled={retrying === j.id}>
                      <RotateCcw className={clsx("ic-sm w-4 h-4", retrying === j.id && "animate-spin")} /><span>Retry</span>
                    </button>
                  </div>
                </li>
              ))}
              {model.overdue.map((j) => (
                <li key={`o${j.id}`} className="rounded-md border border-warning/50 bg-warning/10 p-3">
                  <strong className="block text-[14px]">{taskTitle(j.task)} is overdue</strong>
                  <p className="text-[13px] text-muted">Was due {j.post_at}. {schedulerOff ? "The scheduler is off." : "It should start within a minute."}</p>
                </li>
              ))}
              {tokenProblems.map((a) => (
                <li key={`t${a.id}`} className="rounded-md border border-warning/50 bg-warning/10 p-3 flex items-start justify-between gap-3">
                  <div>
                    <strong className="flex items-center gap-1.5 text-[14px]"><KeyRound className="w-4 h-4" />@{a.username ?? a.id}</strong>
                    <p className="text-[13px] text-muted">{a.days_left === 0 ? "The token has expired. Posts to this account will fail." : `The token expires in ${a.days_left} day${a.days_left === 1 ? "" : "s"}.`}</p>
                  </div>
                  <button className="btn btn-sm btn-ghost shrink-0" onClick={() => navigate("/settings")}>Fix</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Accounts */}
        <div className="card">
          <div className="card-head">
            <h3 className="card-title"><Users className="ic" />Accounts</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate("/settings")}>Manage</button>
          </div>
          {accounts.length === 0 ? (
            <p className="text-[14px] text-muted">No Instagram account is connected yet. Add one in Settings to publish.</p>
          ) : (
            <ul className="divide-y divide-line">
              {accounts.map((a) => {
                const left = a.days_left;
                const tone = left === 0 ? "badge-failed" : left != null && left <= 7 ? "badge-warning" : "badge-done";
                const n = scheduledFor(a);
                return (
                  <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="grid place-items-center w-9 h-9 rounded-full bg-brand text-neutral-950 text-[13px] font-bold uppercase shrink-0">{(a.username ?? a.id).charAt(0)}</span>
                    <div className="min-w-0 flex-1">
                      <strong className="block text-[14px] truncate">@{a.username ?? a.id}{a.default && <span className="ml-2 text-[12px] font-semibold text-primary-300">Active</span>}</strong>
                      <span className="block text-[13px] text-muted">{n ? `${n} scheduled` : "Nothing scheduled"}</span>
                    </div>
                    <span className={clsx("badge shrink-0", tone)}>{left == null ? "Token ok" : left === 0 ? "Expired" : `${left} d left`}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
