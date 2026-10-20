import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronUp, Loader2, UploadCloud, X } from "lucide-react";
import clsx from "clsx";
import { useUploads } from "../../context/UploadContext";

const mb = (b: number) => (b / (1024 * 1024)).toFixed(b < 1024 * 1024 ? 2 : 1);

/** The corner panel for Vault uploads: shows "3 of 12" while files are sent in the background, then a completed summary. */
export default function UploadTray() {
  const { items, active, cancelAll, dismiss } = useUploads();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error").length;
  const stopped = items.filter((i) => i.status === "cancelled").length;
  const settled = done + failed + stopped;
  const bytesAll = items.reduce((n, i) => n + i.size, 0) || 1;
  const bytesSent = items.reduce((n, i) => n + (i.status === "done" ? i.size : Math.min(i.loaded, i.size)), 0);
  const pct = active ? Math.min(99, Math.round((100 * bytesSent) / bytesAll)) : 100;
  const dest = [...new Set(items.map((i) => i.dest))].join(", ");

  // a new batch starts folded away; a finished one with problems opens so they can be read
  const was = useRef(false);
  useEffect(() => {
    if (active && !was.current) setOpen(false);
    if (!active && was.current && failed > 0) setOpen(true);
    was.current = active;
  }, [active, failed]);

  if (!total) return null;

  const problem = !active && (failed > 0 || stopped > 0);
  const title = active ? `Uploading ${Math.min(settled + 1, total)} of ${total}` : stopped ? "Upload stopped" : failed ? (done ? "Upload finished with problems" : "Upload failed") : "Upload complete";
  const sub = active
    ? `${pct}% · to ${dest}`
    : `${done} file${done === 1 ? "" : "s"} added${dest && done ? ` to ${dest}` : ""}${failed ? `, ${failed} not added` : ""}${stopped ? `, ${stopped} stopped` : ""}`;

  return (
    <section
      aria-label="Upload progress"
      className="fixed z-[70] right-4 left-4 sm:left-auto sm:w-[380px] bottom-28 rounded-xl border border-line glass shadow-2 overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={clsx("grid place-items-center w-9 h-9 rounded-full shrink-0", active ? "bg-primary-600/15 text-primary-400" : problem ? "bg-warning/20 text-warning" : "bg-success/20 text-success")}>
          {active ? <Loader2 className="w-5 h-5 animate-spin" /> : problem ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
        </span>
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <strong className="block text-[14px] leading-tight">{title}</strong>
          <span className="block text-[12.5px] text-muted truncate">{sub}</span>
        </div>
        {active && <button className="btn btn-sm btn-ghost" onClick={cancelAll}>Stop</button>}
        <button
          className="p-1.5 rounded-md text-muted hover:text-fg hover:bg-surface-2"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Hide the file list" : "Show the file list"}
        >
          <ChevronUp className={clsx("w-4 h-4 transition-transform", !open && "rotate-180")} />
        </button>
        {!active && (
          <button className="p-1.5 rounded-md text-muted hover:text-fg hover:bg-surface-2" onClick={dismiss} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="h-1.5 bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Upload progress">
        <div className={clsx("h-full transition-[width] duration-300", active ? "bg-brand" : problem ? "bg-warning" : "bg-success")} style={{ width: `${pct}%` }} />
      </div>

      {open && (
        <ul className="max-h-60 overflow-y-auto divide-y divide-line" aria-label="Files">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2.5 px-4 py-2">
              <div className="min-w-0 flex-1">
                <span className="block text-[13px] truncate" title={i.name}>{i.name}</span>
                <span className={clsx("block text-[12px] truncate", i.status === "error" ? "text-danger" : "text-dim")}>
                  {i.status === "error" || (i.status === "done" && i.message) || i.status === "cancelled"
                    ? i.message
                    : i.status === "uploading"
                    ? `${Math.min(100, Math.round((100 * i.loaded) / (i.size || 1)))}% of ${mb(i.size)} MB`
                    : i.status === "done"
                    ? `${mb(i.size)} MB`
                    : "Waiting"}
                </span>
              </div>
              {i.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-primary-400 shrink-0" aria-label="Uploading" />}
              {i.status === "done" && <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-label="Uploaded" />}
              {i.status === "error" && <AlertTriangle className="w-4 h-4 text-danger shrink-0" aria-label="Not uploaded" />}
            </li>
          ))}
        </ul>
      )}

      {!active && done > 0 && pathname !== "/gallery" && (
        <div className="px-4 py-3 border-t border-line">
          <button className="btn btn-sm btn-soft w-full" onClick={() => navigate("/gallery")}>
            <UploadCloud className="ic-sm w-4 h-4" /><span>View in the Vault</span>
          </button>
        </div>
      )}
    </section>
  );
}
