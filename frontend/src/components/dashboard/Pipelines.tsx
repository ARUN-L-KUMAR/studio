import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, Clock, History, Search, X } from "lucide-react";
import clsx from "clsx";
import { TaskArt } from "../art/Scenes";
import Reveal from "../ui/Reveal";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";
import { TASKS, type TaskMeta } from "../../data/tasks";
import { ago, duration } from "../../utils/media";

type Filter = "all" | "video" | "image" | "text" | "media" | "recent";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "video", label: "Video" },
  { key: "image", label: "Image" },
  { key: "text", label: "From text" },
  { key: "media", label: "From your media" },
  { key: "recent", label: "Recently used" },
];

const outputOf = (t: TaskMeta) => (t.key.endsWith("video") ? "video" : "image");
const needsMedia = (t: TaskMeta) => t.needsImage || t.needsVideo || t.needsFace;

type Avail = { tone: "ok" | "warn" | "bad"; text: string };

/** Can this pipeline run right now? Only says what the server really knows. */
function useAvailability() {
  const { health, config } = useApp();
  return (t: TaskMeta): Avail | null => {
    if (!health) return null;
    const hf = health.keys.huggingface;
    const space = config?.tasks?.[t.key]?.space ?? "";
    if (!hf.configured) return { tone: "bad", text: "Needs a Hugging Face token" };
    if (hf.valid_accounts === 0) return { tone: "bad", text: "Hugging Face rejected the token" };
    if (!space || space.startsWith("your-username/")) return { tone: "bad", text: "No model set yet" };
    const quota = hf.quota ?? [];
    if (quota.length && quota.every((q) => q.wait_seconds > 0)) {
      return { tone: "warn", text: `GPU quota back in ~${Math.max(1, Math.round(Math.min(...quota.map((q) => q.wait_seconds)) / 60))} min` };
    }
    return { tone: "ok", text: "Ready" };
  };
}

/** The six pipelines, with search, filters, last-used time and real typical durations. */
export default function Pipelines() {
  const navigate = useNavigate();
  const { health, gallery } = useApp();
  const { task: selected, setTask } = useStudio();
  const availability = useAvailability();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // when each pipeline last ran: the server's record, or (for older files) the newest vault file named after it
  const lastUsed = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, u] of Object.entries(health?.usage ?? {})) {
      const t = u.last_used ? new Date(u.last_used.replace(" ", "T")).getTime() : 0;
      if (t) out[k] = t;
    }
    for (const f of gallery) {
      const key = TASKS.find((t) => f.filename.toLowerCase().startsWith(t.key))?.key;
      if (key) out[key] = Math.max(out[key] ?? 0, f.timestamp * 1000);
    }
    return out;
  }, [health, gallery]);
  const recentKeys = useMemo(() => Object.entries(lastUsed).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k), [lastUsed]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = TASKS.filter((t) => {
      if (needle && !`${t.title} ${t.desc} ${t.tag} ${t.key}`.toLowerCase().includes(needle)) return false;
      switch (filter) {
        case "video": return outputOf(t) === "video";
        case "image": return outputOf(t) === "image";
        case "text": return !needsMedia(t);
        case "media": return needsMedia(t);
        case "recent": return !!lastUsed[t.key];
        default: return true;
      }
    });
    if (filter === "recent") list = [...list].sort((a, b) => (lastUsed[b.key] ?? 0) - (lastUsed[a.key] ?? 0));
    return list;
  }, [q, filter, lastUsed]);

  const open = (t: TaskMeta) => {
    setTask(t.key);
    navigate("/studio");
  };
  const clear = () => {
    setQ("");
    setFilter("all");
  };

  return (
    <section aria-labelledby="pipelines-title" className="grid-faint">
      <Reveal>
        <div className="section-head">
          <div>
            <h2 id="pipelines-title">AI Pipelines</h2>
            <p>Pick a pipeline to open it in the Studio with its model preset loaded.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => navigate("/studio")}>
            <span>Open Studio</span>
            <ArrowRight className="ic-sm w-4 h-4" />
          </button>
        </div>
      </Reveal>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <div className="relative lg:w-[300px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dim pointer-events-none" />
          <input className="input !pl-10 !pr-9 w-full" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pipelines" aria-label="Search pipelines" />
          {q && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-dim hover:text-fg" onClick={() => setQ("")} aria-label="Clear search"><X className="w-4 h-4" /></button>
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter pipelines">
          {FILTERS.map((f) => (
            <button
              key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className={clsx(
                "px-3.5 py-2 rounded-full text-[13.5px] font-semibold border transition",
                filter === f.key ? "bg-primary-600/20 border-primary-500 text-primary-300" : "border-line text-muted hover:text-fg hover:border-primary-500/50",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-dim lg:ml-auto" role="status" aria-live="polite">{shown.length} of {TASKS.length} pipelines</span>
      </div>

      {shown.length === 0 ? (
        <div className="card text-center py-12">
          <strong className="block text-[16px]">No pipeline matches</strong>
          <p className="text-[14px] text-muted mt-1 mb-4">{filter === "recent" && !q ? "Nothing has been generated yet, so there is no history." : "Try a different word or filter."}</p>
          <button className="btn btn-soft btn-sm" onClick={clear}>Clear search and filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {shown.map((t) => {
            const av = availability(t);
            const use = health?.usage?.[t.key];
            const last = lastUsed[t.key];
            const isSel = selected === t.key;
            return (
              <motion.button
                key={t.key}
                layout
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                onClick={() => open(t)}
                aria-pressed={isSel}
                aria-label={`${t.title}. ${t.desc}.`}
                className={clsx(
                  "neon-border group relative block w-full h-[260px] rounded-2xl overflow-hidden border text-left transition-shadow",
                  isSel ? "border-primary-400 ring-2 ring-primary-400/70 shadow-glow" : "border-line shadow-2 hover:shadow-3 hover:border-primary-500/50",
                )}
              >
                <TaskArt task={t.key} lift fill />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/92 via-neutral-950/35 to-transparent" />
                <div className="absolute top-3.5 right-3.5 flex gap-2">
                  {recentKeys.includes(t.key) && <span className="badge bg-secondary-500 text-neutral-950"><History className="w-3.5 h-3.5" />Recent</span>}
                  {isSel && <span className="badge bg-primary-400 text-neutral-950"><Check className="w-3.5 h-3.5" strokeWidth={3} />In Studio</span>}
                </div>
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="grid place-items-center w-9 h-9 rounded-md bg-brand text-neutral-950 shadow-glow"><t.icon className="ic" /></span>
                    <span className="badge bg-white/15 text-white backdrop-blur">{t.tag}</span>
                    {needsMedia(t) && <span className="badge bg-white/15 text-white backdrop-blur normal-case tracking-normal">Needs {t.needsVideo ? "a video" : t.needsFace ? "photos" : "a photo"}</span>}
                  </div>
                  <strong className="block text-[19px]">{t.title}</strong>
                  <span className="block text-[14px] text-white/80">{t.desc}</span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[13px] text-white/85">
                    {av && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={clsx("w-2 h-2 rounded-full", av.tone === "ok" ? "bg-success" : av.tone === "warn" ? "bg-warning" : "bg-danger")} aria-hidden />
                        {av.text}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {use ? `~${duration(use.median_seconds)} typical` : "No runs yet"}
                    </span>
                    {last ? <span>Used {ago(last)}</span> : null}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </section>
  );
}
