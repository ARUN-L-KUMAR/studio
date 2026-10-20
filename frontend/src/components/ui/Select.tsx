import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import clsx from "clsx";

export interface SelectOption {
  value: string;
  label: string;
  /** Small grey line under the label */
  hint?: string;
  disabled?: boolean;
  /** Shown before the label (for example an avatar) */
  leading?: ReactNode;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  /** "field" matches the text inputs, "pill" is the rounded glass style used in the top bar */
  /** "box" looks like the Segmented switch: a bordered box with the chosen value as the highlighted segment */
  variant?: "field" | "pill" | "box";
  className?: string;
  /** Open the list aligned to the right edge of the button instead of the left */
  alignRight?: boolean;
  /** Minimum width of the open list in px (it is never narrower than the button) */
  menuMinWidth?: number;
  /** Replaces the text shown on the button */
  renderValue?: (selected: SelectOption | undefined) => ReactNode;
}

interface Pos {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
}

/**
 * Dropdown list styled for this app. The list is drawn in a portal, so it is never cut off by a card or a modal,
 * and it flips upward when there is no room below (for example above the bottom dock).
 * Keyboard: Arrow keys, Home/End, Enter or Space to choose, Esc to close, type a letter to jump.
 */
export default function Select({
  value, onChange, options, placeholder = "Choose", ariaLabel, disabled, variant = "field",
  className, alignRight, menuMinWidth = 0, renderValue,
}: Props) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);
  const typed = useRef({ text: "", at: 0 });

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const enabled = useMemo(() => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0), [options]);

  const place = useCallback(() => {
    const el = button.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, menuMinWidth);
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const wanted = Math.min(320, options.length * 52 + 12);
    const up = below < Math.min(wanted, 220) && above > below;
    const left = alignRight ? Math.max(8, r.right - width) : Math.min(r.left, window.innerWidth - width - 8);
    setPos({
      left: Math.max(8, left),
      width,
      maxHeight: Math.max(120, Math.min(320, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }, [alignRight, menuMinWidth, options.length]);

  const openMenu = () => {
    if (disabled) return;
    const idx = options.findIndex((o) => o.value === value && !o.disabled);
    setActive(idx >= 0 ? idx : enabled[0] ?? 0);
    place();
    setOpen(true);
  };
  const close = () => setOpen(false);

  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    close();
    button.current?.focus();
    if (o.value !== value) onChange(o.value);
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("mousedown", outside);
    };
  }, [open, place]);

  // keep the highlighted item in view
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const move = (dir: 1 | -1) => {
    if (!enabled.length) return;
    const at = enabled.indexOf(active);
    setActive(enabled[(at + dir + enabled.length) % enabled.length]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation();          // do not also close a modal this list sits in
        close();
        break;
      case "ArrowDown": e.preventDefault(); move(1); break;
      case "ArrowUp": e.preventDefault(); move(-1); break;
      case "Home": e.preventDefault(); setActive(enabled[0] ?? 0); break;
      case "End": e.preventDefault(); setActive(enabled[enabled.length - 1] ?? 0); break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Tab":
        close();
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const now = Date.now();
          typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
          const hit = options.findIndex((o) => !o.disabled && o.label.toLowerCase().replace(/^@/, "").startsWith(typed.current.text.replace(/^@/, "")));
          if (hit >= 0) setActive(hit);
        }
    }
  };

  const listId = `${id}-list`;

  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${id}-o${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={clsx(
          "group flex items-center gap-2 text-left transition duration-150 disabled:opacity-60 disabled:cursor-not-allowed",
          variant === "field"
            ? "input w-full !py-2.5 pr-3 cursor-pointer"
            : variant === "box"
            ? "rounded-md bg-surface-2 border border-line p-1 text-[13px] font-semibold hover:border-primary-500/60"
            : "glass rounded-full border border-line pl-2 pr-3 py-1.5 text-[12px] font-semibold hover:border-primary-500/60",
          open && (variant === "field" ? "!border-primary-500 !shadow-[0_0_0_3px_rgb(var(--primary-500)/.18)]" : "!border-primary-500/70"),
          className,
        )}
      >
        {variant === "box" ? (
          <span className="flex items-center gap-2 px-3.5 py-1.5 rounded-sm bg-brand text-neutral-950 shadow-glow">
            {selected?.leading}
            <span className="min-w-0 flex-1 truncate">{renderValue ? renderValue(selected) : selected?.label ?? placeholder}</span>
            <ChevronDown className={clsx("w-4 h-4 shrink-0 transition-transform duration-200", open && "rotate-180")} />
          </span>
        ) : (
          <>
            {selected?.leading}
            <span className={clsx("min-w-0 flex-1 truncate", !selected && "text-dim")}>
              {renderValue ? renderValue(selected) : selected?.label ?? placeholder}
            </span>
            <ChevronDown className={clsx("w-4 h-4 shrink-0 text-muted transition-transform duration-200", open && "rotate-180 text-primary-400")} />
          </>
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={menu}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              initial={{ opacity: 0, y: pos.top != null ? -6 : 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight }}
              className="z-[120] overflow-y-auto rounded-xl border border-line bg-surface-2/95 backdrop-blur-xl p-1.5 shadow-3 ring-1 ring-black/10"
            >
              {options.length === 0 && <div className="px-3 py-3 text-[13px] text-dim">Nothing to choose</div>}
              {options.map((o, i) => {
                const isSel = o.value === value;
                return (
                  <div
                    key={o.value}
                    id={`${id}-o${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={isSel}
                    aria-disabled={o.disabled}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}      // keep focus on the button
                    onClick={() => choose(i)}
                    className={clsx(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] select-none",
                      o.disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer",
                      active === i && !o.disabled && "bg-primary-600/15",
                      isSel ? "text-primary-300 font-semibold" : "text-fg",
                    )}
                  >
                    {o.leading}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.hint && <span className="block truncate text-[11px] font-normal text-dim">{o.hint}</span>}
                    </span>
                    {isSel && <Check className="w-4 h-4 shrink-0 text-primary-400" />}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
