import { motion } from "framer-motion";
import clsx from "clsx";
import { useId, type ReactNode } from "react";

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}

/** Pill-style switch with a sliding highlight. */
export default function Segmented<T extends string>({ options, value, onChange, className, ariaLabel }: Props<T>) {
  const id = useId();
  return (
    <div role={ariaLabel ? "group" : undefined} aria-label={ariaLabel} className={clsx("inline-flex gap-1 p-1 rounded-md bg-surface-2 border border-line", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => !o.disabled && onChange(o.value)}
          disabled={o.disabled}
          title={o.title}
          aria-pressed={value === o.value}
          className={clsx(
            "relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm text-[13px] font-semibold transition-colors",
            value === o.value ? "text-neutral-950" : "text-muted hover:text-fg",
            o.disabled && "opacity-40 cursor-not-allowed hover:text-muted",
          )}
        >
          {value === o.value && (
            <motion.span layoutId={id} className="absolute inset-0 rounded-sm bg-brand shadow-glow" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
          )}
          <span className="relative z-10 flex items-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
