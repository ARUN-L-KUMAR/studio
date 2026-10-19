import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarClock, FolderOpen, LayoutDashboard, Send, Zap, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";

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

const R = 31;
const CIRC = 2 * Math.PI * R;

function DockLink({ item, pending }: { item: Item; pending: number }) {
  return (
    <NavLink to={item.to} end={item.end} className="relative block" aria-label={item.label}>
      {({ isActive }) => (
        <span
          className={clsx(
            "relative flex flex-col items-center gap-1 w-[62px] sm:w-[72px] py-2 rounded-2xl transition-colors",
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
            <item.icon className={clsx("w-[22px] h-[22px] transition", isActive && "text-primary-400 drop-shadow-[0_0_8px_rgb(var(--primary-500))]")} />
            {item.badge && pending > 0 && (
              <span className="absolute -top-2 -right-3 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full text-[10px] font-bold bg-secondary-500 text-neutral-950 shadow-[0_0_10px_rgb(var(--secondary-500)/.8)]">
                {pending}
              </span>
            )}
          </span>
          <span className="relative text-[11px] font-semibold tracking-wide">{item.label}</span>
        </span>
      )}
    </NavLink>
  );
}

export default function Dock() {
  const { queue } = useApp();
  const { generating, progress } = useStudio();
  const pending = queue.filter((j) => (j.status ?? "pending") === "pending").length;

  return (
    <nav aria-label="Main navigation" className="fixed bottom-3 sm:bottom-5 inset-x-0 z-50 flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto glass relative flex items-end gap-0.5 sm:gap-1.5 px-2.5 sm:px-4 pt-2 pb-1.5 rounded-[30px] border border-line shadow-3 max-w-full">
        {/* neon underglow */}
        <span className="absolute -inset-px rounded-[30px] pointer-events-none opacity-60" style={{ boxShadow: "0 0 40px -8px rgb(var(--primary-600) / .6), 0 0 60px -20px rgb(var(--secondary-500) / .5)" }} />

        {LEFT.map((i) => <DockLink key={i.to} item={i} pending={pending} />)}

        {/* Prominent central action */}
        <NavLink to="/studio" aria-label="Create" className="group relative block mx-1 sm:mx-3 -mt-10">
          {({ isActive }) => (
            <span className="relative flex flex-col items-center gap-1 pb-1">
              <span className="relative grid place-items-center w-[74px] h-[74px]">
                <span className="absolute inset-0 rounded-full bg-brand animate-ring-out" />
                <span className="absolute inset-0 rounded-full bg-brand animate-ring-out [animation-delay:1.3s]" />
                <span className="absolute inset-1 rounded-full bg-brand blur-lg opacity-70 group-hover:opacity-100 transition" />
                <span
                  className={clsx(
                    "relative grid place-items-center w-[66px] h-[66px] rounded-full bg-brand text-neutral-950 shadow-glow",
                    "ring-[5px] ring-bg transition duration-200 group-hover:scale-110 group-active:scale-95",
                    isActive && "scale-105",
                  )}
                >
                  <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/35 to-transparent" />
                  <Zap className={clsx("relative w-7 h-7 fill-current", generating && "animate-pulse")} />
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
              <span className={clsx("text-[11px] font-bold tracking-widest uppercase", isActive ? "text-primary-300" : "text-muted group-hover:text-fg")}>
                {generating ? `${progress}%` : "Create"}
              </span>
            </span>
          )}
        </NavLink>

        {RIGHT.map((i) => <DockLink key={i.to} item={i} pending={pending} />)}
      </div>
    </nav>
  );
}
