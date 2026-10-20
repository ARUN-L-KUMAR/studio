import clsx from "clsx";
import type { VaultLabel } from "../../api/types";

/** The colors a label can have. Plain hex values, because they must look right on both the dark and the light theme. */
export const LABEL_COLORS: Record<string, string> = {
  emerald: "#10b981",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  pink: "#ec4899",
  amber: "#f59e0b",
  rose: "#f43f5e",
  teal: "#14b8a6",
  slate: "#64748b",
};
export const colorHex = (color?: string) => LABEL_COLORS[color ?? ""] ?? LABEL_COLORS.emerald;

/** A small colored dot, for lists. */
export function LabelDot({ color, className }: { color?: string; className?: string }) {
  return <span aria-hidden className={clsx("inline-block w-2.5 h-2.5 rounded-full shrink-0", className)} style={{ backgroundColor: colorHex(color) }} />;
}

export function LabelChip({ name, color, className }: { name: string; color?: string; className?: string }) {
  const hex = colorHex(color);
  return (
    <span
      className={clsx("inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded-full border text-[11px] font-semibold text-fg leading-tight", className)}
      style={{ backgroundColor: `${hex}26`, borderColor: `${hex}80` }}
      title={name}
    >
      <LabelDot color={color} className="!w-2 !h-2" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** A file's labels as chips: the first few, then "+2". */
export function LabelChips({ names, registry, max = 3, className }: { names: string[]; registry: VaultLabel[]; max?: number; className?: string }) {
  if (!names.length) return null;
  const color = (n: string) => registry.find((l) => l.name === n)?.color;
  const shown = names.slice(0, max);
  return (
    <div className={clsx("flex flex-wrap gap-1.5", className)} aria-label="Labels">
      {shown.map((n) => <LabelChip key={n} name={n} color={color(n)} />)}
      {names.length > max && <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-2 text-[11px] font-semibold text-muted" title={names.slice(max).join(", ")}>+{names.length - max}</span>}
    </div>
  );
}
