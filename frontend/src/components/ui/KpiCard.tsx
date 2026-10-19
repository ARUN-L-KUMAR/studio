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
}

export default function KpiCard({ label, value, icon: Icon, tone = "primary", delay = 0 }: Props) {
  const n = useCountUp(value);
  return (
    <Reveal delay={delay}>
      <div className="group flex items-center gap-4 bg-surface border border-line rounded-lg p-5 shadow-1 transition duration-200 hover:-translate-y-1 hover:shadow-2">
        <div className={clsx("grid place-items-center w-12 h-12 rounded-md transition-transform duration-200 group-hover:scale-110", TONES[tone])}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <span className="block text-[12px] font-semibold text-muted">{label}</span>
          <strong className="block text-[28px] leading-none mt-1 font-extrabold tabular-nums">{n}</strong>
        </div>
      </div>
    </Reveal>
  );
}
