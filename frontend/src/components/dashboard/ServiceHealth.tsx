import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, KeyRound, RefreshCw, ShieldCheck, XCircle, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { useApp } from "../../context/AppContext";
import type { ServiceState } from "../../api/types";

// Each state has its own colour AND its own icon and wording, so it never relies on colour alone.
const STATE: Record<ServiceState, { label: string; icon: LucideIcon; tile: string; pill: string }> = {
  connected: { label: "Connected", icon: CheckCircle2, tile: "bg-success/15 text-success", pill: "bg-success/15 text-success" },
  degraded: { label: "Degraded", icon: AlertTriangle, tile: "bg-warning/15 text-warning", pill: "bg-warning/15 text-warning" },
  auth_required: { label: "Sign-in needed", icon: KeyRound, tile: "bg-secondary-500/15 text-secondary-400", pill: "bg-secondary-500/15 text-secondary-400" },
  disconnected: { label: "Disconnected", icon: XCircle, tile: "bg-danger/15 text-danger", pill: "bg-danger/15 text-danger" },
};

/** Real status of each service, as worked out by the server. */
export default function ServiceHealth() {
  const navigate = useNavigate();
  const { health, online, refreshAll } = useApp();
  const services = health?.services ?? [];
  const bad = services.filter((s) => s.state !== "connected").length;

  return (
    <div className="card h-full">
      <div className="card-head">
        <div>
          <h3 className="card-title"><ShieldCheck className="ic" />Service Health</h3>
          <p className="card-sub" role="status">
            {!online ? "Can't reach the server." : !health ? "Checking…" : bad === 0 ? "Everything is connected." : `${bad} service${bad === 1 ? "" : "s"} need${bad === 1 ? "s" : ""} attention.`}
          </p>
        </div>
        <button className="p-2 -m-2 rounded-md text-muted hover:text-fg hover:bg-surface-2" onClick={() => refreshAll()} aria-label="Refresh status">
          <RefreshCw className="ic-sm w-4 h-4" />
        </button>
      </div>

      {!online && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-[14px] text-danger">The backend isn't answering, so the statuses below may be out of date.</div>
      )}

      <ul className="divide-y divide-line">
        {services.length === 0 &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 py-3.5 first:pt-0 animate-pulse" aria-hidden>
              <span className="w-10 h-10 rounded-md bg-surface-3" /><span className="flex-1 space-y-2"><span className="block h-3 w-1/3 rounded bg-surface-3" /><span className="block h-3 w-2/3 rounded bg-surface-3" /></span>
            </li>
          ))}
        {services.map((s) => {
          const st = STATE[s.state];
          return (
            <li key={s.id} className="flex items-center gap-3.5 py-3.5 first:pt-0 last:pb-0">
              <span className={clsx("grid place-items-center w-10 h-10 rounded-md shrink-0", st.tile)}><st.icon className="w-5 h-5" /></span>
              <div className="flex-1 min-w-0">
                <strong className="block text-[15px]">{s.label}</strong>
                <span className="block text-[13px] text-muted">{s.detail}</span>
                {s.action && (
                  <button className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-primary-400 hover:text-primary-300" onClick={() => navigate(s.action as string)}>
                    Fix in Settings<ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <span className={clsx("badge shrink-0", st.pill)}>{st.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
