import { Link, useLocation } from "react-router-dom";
import { LogOut, Moon, Play, Settings, Sun } from "lucide-react";
import clsx from "clsx";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import AccountSwitch from "./AccountSwitch";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/studio": "Studio",
  "/post": "Post to Instagram",
  "/queue": "Automation Queue",
  "/gallery": "Media Vault",
  "/settings": "Settings",
};

export default function Topbar() {
  const { pathname } = useLocation();
  const { config, toggleDryRun, online } = useApp();
  const { theme, toggle } = useTheme();
  const { status: auth, logout } = useAuth();
  const dry = config?.instagram.dry_run ?? true;

  return (
    <header className="sticky top-0 z-40 bg-bg/70 backdrop-blur-xl">
      <div className="max-w-[1360px] mx-auto flex items-center gap-3 sm:gap-5 px-4 sm:px-8 py-3 sm:py-4">
        <Link to="/" className="flex items-center gap-3 group" aria-label="InstaStudio home">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand shadow-glow text-neutral-950 transition group-hover:rotate-6 group-hover:scale-105">
            <Play className="w-[18px] h-[18px] fill-current ml-0.5" />
          </span>
          <span className="hidden sm:block leading-tight">
            <span className="block font-display text-[17px] font-bold tracking-tight">InstaStudio</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[.22em] text-dim">AI Content Engine</span>
          </span>
        </Link>

        <div className="flex-1 min-w-0 flex items-center justify-center">
          <span className="glass border border-line rounded-full px-4 py-1.5 text-[12px] font-semibold tracking-wide text-muted truncate">
            <span className="text-primary-400">/</span> {TITLES[pathname] ?? "InstaStudio"}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <AccountSwitch />
          <span
            title={online ? "Server online" : "Server unreachable. Start it with: python run_web.py"}
            className="glass hidden md:flex items-center gap-2 px-3 py-2 rounded-full border border-line text-[12px] font-semibold text-muted"
          >
            <span className={clsx("relative w-2 h-2 rounded-full", online ? "bg-success" : "bg-danger")}>
              {online && <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />}
            </span>
            {online ? "Online" : "Offline"}
          </span>

          <button
            onClick={toggleDryRun}
            title="Switch between safe dry-run and live publishing"
            className={clsx(
              "glass flex items-center gap-2 px-3.5 py-2 rounded-full text-[12px] font-bold border transition",
              dry
                ? "border-secondary-500/40 text-secondary-400 hover:border-secondary-400"
                : "border-danger/50 text-danger hover:border-danger shadow-[0_0_18px_-4px_rgb(var(--danger)/.7)]",
            )}
          >
            <span className={clsx("w-2 h-2 rounded-full", dry ? "bg-secondary-400" : "bg-danger animate-pulse")} />
            <span className="hidden sm:inline">{dry ? "Dry Run" : "Live Publishing"}</span>
            <span className="sm:hidden">{dry ? "Dry" : "Live"}</span>
          </button>

          <Link
            to="/settings"
            aria-label="Settings"
            title="Settings"
            className={clsx(
              "glass p-2.5 rounded-full border transition",
              pathname === "/settings" ? "border-primary-500/70 text-primary-400" : "border-line text-muted hover:text-fg hover:border-primary-500/60",
            )}
          >
            <Settings className="w-[18px] h-[18px]" />
          </Link>

          <button
            onClick={toggle}
            aria-label="Toggle color theme"
            title="Toggle theme"
            className="glass p-2.5 rounded-full border border-line text-muted hover:text-fg hover:border-primary-500/60 transition"
          >
            {theme === "dark" ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>

          {auth?.required && (
            <button
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="glass p-2.5 rounded-full border border-line text-muted hover:text-danger hover:border-danger/50 transition"
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
