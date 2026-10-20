import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Clock, Eye, Loader2, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";
import { useToast } from "../../context/ToastContext";
import { TASK_BY_KEY } from "../../data/tasks";
import { jobForPost } from "../../utils/media";
import type { QueueJob } from "../../api/types";

type Status = "running" | "pending" | "done" | "failed";
const ORDER: Record<Status, number> = { running: 0, failed: 1, pending: 2, done: 3 };

const META: Record<Status, { label: string; badge: string }> = {
  running: { label: "Processing", badge: "badge-primary" },
  pending: { label: "Queued", badge: "badge-pending" },
  done: { label: "Completed", badge: "badge-done" },
  failed: { label: "Failed", badge: "badge-failed" },
};

const statusOf = (j: QueueJob): Status => {
  const s = j.status ?? "pending";
  return s === "running" || s === "done" || s === "failed" ? s : "pending";
};

/** Everything that is generating, waiting, finished or broken, with retry and error details. */
export default function LiveQueue() {
  const navigate = useNavigate();
  const toast = useToast();
  const { queue, refreshQueue } = useApp();
  const { generating, progress, step, loadMedia, setPostOpts } = useStudio();
  const [open, setOpen] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);

  const count = (s: Status) => queue.filter((j) => statusOf(j) === s).length;
  const rows = [...queue]
    .sort((a, b) => ORDER[statusOf(a)] - ORDER[statusOf(b)] || (statusOf(a) === "done" ? b.id - a.id : a.id - b.id))
    .slice(0, 6);

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

  const view = (j: QueueJob) => {
    const p = jobForPost(j);                          // every picture of a carousel, not only the first
    if (!p) return;
    loadMedia(p.result);
    setPostOpts(p.carousel ? { files: p.files, format: "carousel", audio: "none" } : { files: p.files });
    navigate("/post");
  };

  const when = (j: QueueJob) => {
    const s = statusOf(j);
    if (s === "done") return j.posted ? `Posted ${j.finished_at ?? ""}` : `Prepared ${j.finished_at ?? ""} (dry run)`;
    if (s === "failed") return j.finished_at ? `Failed ${j.finished_at}` : "Failed";
    if (s === "running") return "Working on it now";
    return j.post_at ? `Runs ${j.post_at}` : "Next daily slot";
  };

  return (
    <div className="card h-full flex flex-col">
      <div className="card-head">
        <div>
          <h3 className="card-title"><Loader2 className={clsx("ic", (generating || count("running") > 0) && "animate-spin")} />Live Queue</h3>
          <p className="card-sub">Updates every few seconds.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/queue")}>
          <span>Open queue</span><ArrowRight className="ic-sm w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" aria-label="Queue totals">
        {(["running", "pending", "done", "failed"] as Status[]).map((s) => (
          <span key={s} className={clsx("badge", META[s].badge)}>{count(s)} {META[s].label}</span>
        ))}
      </div>

      {generating && (
        <div className="mb-3 rounded-md border border-primary-500/40 bg-primary-600/10 p-3.5" role="status">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <strong className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-primary-400" />Generating now</strong>
            <span className="tabular-nums text-muted">{progress}%</span>
          </div>
          <p className="text-[13px] text-muted mt-1 truncate">{step || "Working"}</p>
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-2">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(6, progress)}%` }} />
          </div>
        </div>
      )}

      {rows.length === 0 && !generating ? (
        <p className="text-[14px] text-muted py-8 text-center">Nothing queued. Use Quick Create, or schedule a post from the Studio.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((j) => {
            const s = statusOf(j);
            const expanded = open === j.id;
            return (
              <li key={j.id} className="py-3 first:pt-0">
                <div className="flex items-start gap-3">
                  <span className={clsx("mt-0.5 grid place-items-center w-8 h-8 rounded-md shrink-0", s === "failed" ? "bg-danger/15 text-danger" : s === "done" ? "bg-success/15 text-success" : s === "running" ? "bg-primary-600/15 text-primary-400" : "bg-surface-3 text-muted")}>
                    {s === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : s === "failed" ? <AlertTriangle className="w-4 h-4" /> : s === "done" ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <strong className="text-[14px]">{TASK_BY_KEY[j.task as keyof typeof TASK_BY_KEY]?.title ?? j.task}</strong>
                      <span className={clsx("badge", META[s].badge)}>{META[s].label}</span>
                    </div>
                    <p className="text-[13px] text-muted truncate" title={j.prompt}>{j.prompt}</p>
                    <p className="text-[12.5px] text-dim mt-0.5">{when(j)}</p>
                    {s === "running" && <div className="h-1 rounded-full bg-surface-3 overflow-hidden mt-2"><div className="h-full w-1/3 rounded-full bg-brand animate-pulse" /></div>}
                    {s === "failed" && j.error && !expanded && <p className="text-[13px] text-danger mt-1 line-clamp-1">{j.error}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {s === "failed" && (
                      <button className="btn btn-sm btn-soft" onClick={() => retry(j)} disabled={retrying === j.id}>
                        <RotateCcw className={clsx("ic-sm w-4 h-4", retrying === j.id && "animate-spin")} /><span>Retry</span>
                      </button>
                    )}
                    {s === "done" && j.media_url && (
                      <button className="btn btn-sm btn-ghost" onClick={() => view(j)}><Eye className="ic-sm w-4 h-4" /><span>View</span></button>
                    )}
                    {j.error && (
                      <button className="p-2 rounded-md text-muted hover:text-fg hover:bg-surface-2" onClick={() => setOpen(expanded ? null : j.id)} aria-expanded={expanded} aria-label="Error details">
                        <ChevronDown className={clsx("w-4 h-4 transition-transform", expanded && "rotate-180")} />
                      </button>
                    )}
                  </div>
                </div>
                {expanded && j.error && (
                  <pre className="mt-2 ml-11 whitespace-pre-wrap break-words rounded-md bg-surface-2 border border-line p-3 text-[12.5px] text-danger font-mono">{j.error}</pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
