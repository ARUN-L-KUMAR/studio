import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import Reveal from "./Reveal";
import { useCountUp } from "../../hooks/useCountUp";

export type Tone = "primary" | "secondary" | "success" | "danger" | "neutral";

const TONES: Record<Tone, string> = {
  primary: "bg-primary-600/15 text-primary-400",
  secondary: "bg-secondary-500/15 text-secondary-400",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  neutral: "bg-surface-3 text-muted",
};

interface Props {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: Tone;
  delay?: number;
  /** Small line under the number, for example "+3 today" */
  hint?: string;
  /** Recent history, oldest first. A tiny chart is drawn when any value is above zero */
  spark?: number[];
  /** Makes the whole card a link */
  to?: string;
}

function Sparkline({ values }: { values: number[] }) {
  const w = 72, h = 28, max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - 3 - (v / max) * (h - 8)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="hidden sm:block w-[72px] h-7 shrink-0 text-primary-400" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function KpiCard({ label, value, icon: Icon, tone = "primary", delay = 0, hint, spark, to }: Props) {
  const n = useCountUp(value);
  const body = (
    <>
      <div className={clsx("grid place-items-center w-12 h-12 rounded-md shrink-0 transition-transform duration-200 group-hover:scale-110", TONES[tone])}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-muted">{label}</span>
        <strong className="block text-[28px] leading-none mt-1 font-extrabold tabular-nums">{n}</strong>
        {hint && <span className="block text-[12.5px] text-muted mt-1.5 line-clamp-2">{hint}</span>}
      </div>
      {spark && spark.some((v) => v > 0) && <Sparkline values={spark} />}
    </>
  );
  const cls = "group flex items-center gap-4 bg-surface border border-line rounded-lg p-4 sm:p-5 shadow-1 transition duration-200 hover:-translate-y-1 hover:shadow-2";
  return (
    <Reveal delay={delay}>
      {to ? <Link to={to} className={clsx(cls, "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500")}>{body}</Link> : <div className={cls}>{body}</div>}
    </Reveal>
  );
}
