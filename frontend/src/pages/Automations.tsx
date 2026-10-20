import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, FolderOpen, Hourglass, Image as ImageIcon, ListChecks, Pencil, Play, Plus, Repeat, Sparkles, Trash2, User } from "lucide-react";
import clsx from "clsx";
import { api } from "../api/client";
import AutomationModal from "../components/automations/AutomationModal";
import EmptyState from "../components/ui/EmptyState";
import Reveal from "../components/ui/Reveal";
import { useApp } from "../context/AppContext";
import { useConfirm } from "../context/ConfirmContext";
import { useToast } from "../context/ToastContext";
import { TASK_BY_KEY } from "../data/tasks";
import type { Automation } from "../api/types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const daysLabel = (d: number[]) => (d.length === 0 || d.length === 7 ? "Every day" : d.map((x) => DAY_NAMES[x]).join(", "));
const when = (s: string) => new Date(s.replace(" ", "T")).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dateRange = (a: Automation) =>
  a.start_date && a.end_date ? `${a.start_date} to ${a.end_date}` : a.start_date ? `From ${a.start_date}` : a.end_date ? `Until ${a.end_date}` : "";

/** Daily automations: pick a pipeline, times and days, and the server makes and posts it on its own. */
export default function Automations() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { health, config } = useApp();
  const [rules, setRules] = useState<Automation[] | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const accounts = health?.keys.instagram.official_accounts ?? [];
  const dry = config?.instagram.dry_run ?? true;
  const schedulerOff = config?.schedule?.run_in_server === false;

  const load = useCallback(async () => {
    try {
      setRules((await api.automations()).rules);
    } catch {
      setRules((r) => r ?? []);
    }
  }, []);
  useEffect(() => {
    load();
    const id = window.setInterval(() => !document.hidden && load(), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const accountName = (id: string) => (id ? `@${accounts.find((a) => a.id === id)?.username ?? id}` : "the active account");

  const toggle = async (r: Automation) => {
    setBusyId(r.id);
    try {
      await api.setAutomationEnabled(r.id, !r.enabled);
      toast(r.enabled ? "Automation switched off." : "Automation switched on. It starts from now.", "info");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (r: Automation) => {
    const ok = await confirm({
      title: "Run this automation now?",
      text: dry ? "It makes one post now using the next item in its rotation. Dry run is on, so nothing is really posted." : `It makes one post now using the next item in its rotation and posts it to ${accountName(r.account)}. Live Publishing is on, so this is a real post.`,
      confirmLabel: "Run now",
    });
    if (!ok) return;
    setBusyId(r.id);
    try {
      await api.runAutomationNow(r.id);
      toast("Queued. It joins the queue within about 30 seconds.", "success");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: Automation) => {
    if (!(await confirm({ title: "Delete this automation?", text: `“${r.name}” stops running. Posts it already queued are not affected.`, confirmLabel: "Delete" }))) return;
    try {
      await api.deleteAutomation(r.id);
      toast("Automation deleted", "info");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const edit = (r: Automation | null) => {
    setEditing(r);
    setFormOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="section-head !mb-0">
        <div>
          <h2>Daily Automations</h2>
          <p>Choose the pipeline, the days and times, and where the content comes from. The server makes and posts it on its own.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button className="btn btn-ghost" onClick={() => navigate("/queue")}><ListChecks className="ic-sm w-4 h-4" /><span>Queue</span></button>
          <button className="btn btn-primary" onClick={() => edit(null)}><Plus className="ic" /><span>New automation</span></button>
        </div>
      </div>

      <div className={clsx("rounded-md border px-4 py-3 text-[14px]", dry ? "border-line bg-surface-2/60 text-muted" : "border-warning/50 bg-warning/10")}>
        {dry ? (
          <><strong className="text-fg">Dry run is on.</strong> Automations make everything but nothing is really posted. Turn it off in the top bar when you are happy with the results.</>
        ) : (
          <><strong>Live Publishing is on.</strong> <span className="text-muted">Automations will really post to Instagram at their times.</span></>
        )}
      </div>
      {schedulerOff && (
        <div className="rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-[14px]">
          <strong>The server scheduler is off.</strong> <span className="text-muted">Automations only run while it is on. Turn <code>run_in_server</code> back on in config.yaml.</span>
        </div>
      )}

      {rules === null ? (
        <div className="grid md:grid-cols-2 gap-5">{[0, 1].map((i) => <div key={i} className="card h-[260px] animate-pulse" aria-hidden />)}</div>
      ) : rules.length === 0 ? (
        <div className="card">
          <EmptyState
            image="empty-queue.svg"
            title="No automations yet"
            text="Set one up once, for example “every day at 9:00 make a Text to Video Reel from my prompt list”, and it keeps posting on its own."
            action={<button className="btn btn-primary btn-sm" onClick={() => edit(null)}><Plus className="ic-sm w-4 h-4" /><span>Create your first automation</span></button>}
          />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          {rules.map((r, i) => {
            const t = TASK_BY_KEY[r.pipeline as keyof typeof TASK_BY_KEY];
            const next = r.prompt_mode === "list" && r.prompts.length ? r.prompts[r.state.next_prompt % r.prompts.length] : "";
            return (
              <Reveal key={r.id} delay={(i % 2) * 0.06}>
                <article className={clsx("card h-full flex flex-col", !r.enabled && "opacity-80")} aria-label={r.name}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[17px] truncate">{r.name}</h3>
                      <p className="flex items-center gap-2 text-[14px] text-muted mt-0.5">
                        {r.source === "own" ? <ImageIcon className="w-4 h-4 text-primary-400" /> : t && <t.icon className="w-4 h-4 text-primary-400" />}
                        {r.source === "own" ? "Posts your own files" : t?.title ?? r.pipeline} · {accountName(r.account)}
                      </p>
                    </div>
                    <button
                      role="switch" aria-checked={r.enabled} aria-label={r.enabled ? "Switch off" : "Switch on"} disabled={busyId === r.id} onClick={() => toggle(r)}
                      className={clsx("relative shrink-0 w-12 h-7 rounded-full border transition-colors", r.enabled ? "bg-primary-500 border-primary-400" : "bg-surface-3 border-line")}
                    >
                      <span className={clsx("absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform", r.enabled && "translate-x-5")} />
                    </button>
                  </div>

                  <dl className="mt-4 space-y-2.5 text-[14px]">
                    <div className="flex gap-2.5"><Clock className="w-4 h-4 mt-0.5 text-dim shrink-0" /><dd>{r.times.join(" · ")} <span className="text-muted">· {daysLabel(r.days)}{dateRange(r) ? ` · ${dateRange(r)}` : ""}</span></dd></div>
                    {r.source === "own" ? (
                      <div className="flex gap-2.5">
                        <FolderOpen className="w-4 h-4 mt-0.5 text-dim shrink-0" />
                        <dd>
                          Posts files from {r.input_folder} as they are
                          <span className="block text-[13px] text-muted">
                            {r.loop ? `${r.file_count ?? 0} files, starts over at the end` : `${r.unused_count ?? 0} of ${r.file_count ?? 0} not posted yet`} · no AI generation
                          </span>
                        </dd>
                      </div>
                    ) : (
                      <div className="flex gap-2.5">
                        {r.prompt_mode === "ai" ? <Sparkles className="w-4 h-4 mt-0.5 text-dim shrink-0" /> : <Repeat className="w-4 h-4 mt-0.5 text-dim shrink-0" />}
                        <dd>
                          {r.prompt_mode === "ai" ? <>AI writes ideas about <em className="not-italic text-fg">“{r.theme}”</em></> : <>Rotating list of {r.prompts.length} prompt{r.prompts.length === 1 ? "" : "s"}</>}
                          {next && <span className="block text-[13px] text-muted truncate" title={next}>Next: {next}</span>}
                        </dd>
                      </div>
                    )}
                    {r.source !== "own" && Object.entries(r.inputs).map(([role, v]) => {
                      const label = role === "face" ? "Reference face" : role === "video" ? "Video" : r.pipeline === "face_swap" ? "Target photo" : "Photo";
                      return (
                        <div key={role} className="flex gap-2.5">
                          {role === "face" ? <User className="w-4 h-4 mt-0.5 text-dim shrink-0" /> : <FolderOpen className="w-4 h-4 mt-0.5 text-dim shrink-0" />}
                          <dd>
                            {v.mode === "folder" ? (
                              <>{label}s from {v.folder} <span className="text-muted">· {v.count ?? 0} in rotation</span></>
                            ) : v.file_ok ? (
                              <>{label}: <span className="text-muted">fixed upload ({v.file_name.replace(/^\d+_/, "")})</span></>
                            ) : (
                              <>{label}: <span className="text-danger">uploaded file is missing</span></>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>

                  <div className="mt-4 rounded-md bg-surface-2/60 border border-line p-3.5 text-[13.5px]">
                    {r.enabled ? (
                      r.next_runs.length ? (
                        <p className="flex gap-2"><CalendarClock className="w-4 h-4 mt-0.5 text-primary-400 shrink-0" /><span><strong>Next:</strong> {r.next_runs.slice(0, 3).map(when).join(" · ")}</span></p>
                      ) : (
                        <p className="text-muted">No upcoming runs in the next 7 days (check the days and dates).</p>
                      )
                    ) : (
                      <p className="text-muted">Switched off. Nothing will run.</p>
                    )}
                    {r.state.last_status === "waiting" && r.state.last_error ? (
                      <p className="flex gap-2 mt-2 text-muted"><Hourglass className="w-4 h-4 mt-0.5 shrink-0" /><span>{r.state.last_error}</span></p>
                    ) : r.state.last_status === "error" && r.state.last_error ? (
                      <p className="flex gap-2 mt-2 text-danger"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>Last attempt failed: {r.state.last_error} It tries again in a few minutes.</span></p>
                    ) : r.state.last_run_at ? (
                      <p className="flex gap-2 mt-2 text-muted"><CheckCircle2 className="w-4 h-4 mt-0.5 text-success shrink-0" /><span>Last run queued {r.state.last_run_at} · {r.state.runs} in total</span></p>
                    ) : (
                      <p className="mt-2 text-dim">Has not run yet.</p>
                    )}
                    {r.state.run_now && <p className="mt-2 text-primary-300">A run was requested and joins the queue within 30 seconds.</p>}
                  </div>

                  <div className="mt-auto pt-4 flex flex-wrap gap-2">
                    <button className="btn btn-sm btn-soft" onClick={() => runNow(r)} disabled={busyId === r.id || r.state.run_now}><Play className="ic-sm w-4 h-4" /><span>Run now</span></button>
                    <button className="btn btn-sm btn-ghost" onClick={() => edit(r)}><Pencil className="ic-sm w-4 h-4" /><span>Edit</span></button>
                    <button className="btn btn-sm btn-ghost !text-danger hover:!bg-danger/10 ml-auto" onClick={() => remove(r)} aria-label={`Delete ${r.name}`}><Trash2 className="ic-sm w-4 h-4" /></button>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      )}

      <AutomationModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />
    </div>
  );
}
