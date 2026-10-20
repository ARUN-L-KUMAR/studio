import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarClock, FolderOpen, LayoutDashboard, Send, Zap, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";
import { TASK_BY_KEY } from "../../data/tasks";
import type { TaskKey } from "../../api/types";

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: boolean;
}

const LEFT: Item[] = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/queue", label: "Queue", icon: CalendarClock, badge: true },
];
const RIGHT: Item[] = [
  { to: "/post", label: "Post", icon: Send },
  { to: "/gallery", label: "Vault", icon: FolderOpen },
];

const QUICK: { key: TaskKey; hint: string }[] = [
  { key: "text_to_video", hint: "A Reel from a sentence" },
  { key: "image_to_video", hint: "Animate a photo" },
  { key: "text_to_image", hint: "A picture from a sentence" },
];

const R = 31;
const CIRC = 2 * Math.PI * R;

function DockLink({ item, active, failed }: { item: Item; active: number; failed: number }) {
  return (
    <NavLink to={item.to} end={item.end} className="relative block min-w-0" aria-label={item.label}>
      {({ isActive }) => (
        <span
          className={clsx(
            "relative flex flex-col items-center gap-1 w-[58px] sm:w-[72px] py-2 rounded-2xl transition-colors",
            isActive ? "text-fg" : "text-dim hover:text-fg",
          )}
        >
          {isActive && (
            <motion.span
              layoutId="dock-active"
              className="absolute inset-0 rounded-2xl bg-fg/[.07] border border-line"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative">
            <item.icon className={clsx("w-[22px] h-[22px] transition-colors", isActive && "text-primary-400")} />
            {item.badge && active > 0 && (
              <span className="absolute -top-2 -right-3 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full text-[11px] font-bold bg-secondary-500 text-neutral-950" aria-label={`${active} job${active === 1 ? "" : "s"} waiting or running`}>
                {active}
              </span>
            )}
            {item.badge && failed > 0 && (
              <span className="absolute -bottom-1.5 -right-3 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full text-[11px] font-bold bg-danger text-white ring-2 ring-bg" aria-label={`${failed} failed job${failed === 1 ? "" : "s"}`}>
                {failed}
              </span>
            )}
          </span>
          <span className="relative text-[12px] font-semibold tracking-wide">{item.label}</span>
        </span>
      )}
    </NavLink>
  );
}

/** Round Create button that opens a menu of the quickest ways to start. */
function CreateButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { generating, progress, setTask } = useStudio();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const onStudio = pathname === "/studio";

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const outside = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const start = (key: TaskKey | null) => {
    if (key) setTask(key);
    setOpen(false);
    navigate("/studio");
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };

  return (
    <div ref={wrap} className="relative mx-0.5 sm:mx-3 -mt-7 sm:-mt-10">
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-[272px] max-w-[calc(100vw-1.5rem)]">
      <AnimatePresence>
        {open && (
          <motion.div
            key="menu"
            ref={menu}
            role="menu"
            aria-label="Quick create"
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="rounded-xl border border-line bg-surface-2 p-1.5 shadow-3 ring-1 ring-black/10"
          >
            <p className="px-3 pt-2 pb-1.5 text-[12px] font-bold uppercase tracking-wider text-dim">Quick create</p>
            {QUICK.map(({ key, hint }) => {
              const t = TASK_BY_KEY[key];
              return (
                <button key={key} role="menuitem" onClick={() => start(key)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-primary-600/15 focus-visible:bg-primary-600/15 transition">
                  <span className="grid place-items-center w-9 h-9 rounded-md bg-primary-600/15 text-primary-400 shrink-0"><t.icon className="w-[18px] h-[18px]" /></span>
                  <span className="min-w-0">
                    <strong className="block text-[14px]">{t.title}</strong>
                    <span className="block text-[13px] text-muted">{hint}</span>
                  </span>
                </button>
              );
            })}
            <button role="menuitem" onClick={() => start(null)} className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-[13.5px] font-semibold text-muted hover:text-fg hover:bg-fg/[.06] border-t border-line transition">
              <span>All pipelines in the Studio</span><ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      <button
        ref={button}
        onClick={() => setOpen((o) => !o)}
        aria-label="Create"
        aria-haspopup="menu"
        aria-expanded={open}
        className="group relative block"
      >
        <span className="relative flex flex-col items-center gap-1 pb-1">
          <span className="relative grid place-items-center w-[62px] h-[62px] sm:w-[74px] sm:h-[74px]">
            <span className="absolute inset-0 rounded-full bg-brand animate-ring-out" />
            <span className="absolute inset-1 rounded-full bg-brand blur-lg opacity-60 group-hover:opacity-90 transition" />
            <span
              className={clsx(
                "relative grid place-items-center w-[54px] h-[54px] sm:w-[66px] sm:h-[66px] rounded-full bg-brand text-neutral-950 shadow-glow",
                "ring-[5px] ring-bg transition duration-200 group-hover:scale-110 group-active:scale-95",
                (onStudio || open) && "scale-105",
              )}
            >
              <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/35 to-transparent" />
              <Zap className={clsx("relative w-6 h-6 sm:w-7 sm:h-7 fill-current transition-transform", generating && "animate-pulse", open && "rotate-12")} />
            </span>
            {generating && (
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 74 74" aria-hidden>
                <circle cx="37" cy="37" r={R} fill="none" stroke="rgb(9 6 11)" strokeOpacity=".25" strokeWidth="3" />
                <circle
                  cx="37" cy="37" r={R} fill="none" stroke="rgb(9 6 11)" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - Math.max(4, progress) / 100)}
                  className="transition-[stroke-dashoffset] duration-700"
                />
              </svg>
            )}
          </span>
          <span className={clsx("text-[12px] font-bold tracking-widest uppercase", onStudio || open ? "text-primary-300" : "text-muted group-hover:text-fg")}>
            {generating ? `${progress}%` : "Create"}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * Main navigation. Wide screens: a floating pill. Phones: a normal bottom tab bar across the screen
 * (the page adds matching space at the bottom, so it never covers content).
 */
export default function Dock() {
  const { queue } = useApp();
  const state = (s?: string) => s ?? "pending";
  const active = queue.filter((j) => ["pending", "running"].includes(state(j.status))).length;
  const failed = queue.filter((j) => state(j.status) === "failed").length;

  return (
    <nav aria-label="Main navigation" className="fixed bottom-0 sm:bottom-5 inset-x-0 z-50 flex justify-center sm:px-3 pointer-events-none">
      <div className="pointer-events-auto glass relative flex items-end justify-around sm:justify-start gap-0 sm:gap-1.5 w-full sm:w-auto px-1 sm:px-4 pt-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] sm:pb-1.5 rounded-none sm:rounded-[30px] border-t sm:border border-line shadow-3 max-w-full">
        <span className="hidden sm:block absolute -inset-px rounded-[30px] pointer-events-none opacity-35" style={{ boxShadow: "0 0 36px -10px rgb(var(--primary-600) / .5)" }} />

        {LEFT.map((i) => <DockLink key={i.to} item={i} active={active} failed={failed} />)}
        <CreateButton />
        {RIGHT.map((i) => <DockLink key={i.to} item={i} active={active} failed={failed} />)}
      </div>
    </nav>
  );
}
