import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Image as ImageIcon, Sparkles, Video, Zap } from "lucide-react";
import clsx from "clsx";
import { HeroBackdrop, HeroScene } from "../art/Scenes";
import Spinner from "../ui/Spinner";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";
import { TASK_BY_KEY } from "../../data/tasks";
import { clock, fileToResult, pipelineLabel } from "../../utils/media";

type HeroTask = "text_to_video" | "text_to_image";
const CHOICES: { key: HeroTask; label: string; icon: typeof Video }[] = [
  { key: "text_to_video", label: "Reel", icon: Video },
  { key: "text_to_image", label: "Image", icon: ImageIcon },
];

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Phone-shaped window that cycles through the newest real creations. */
function LivePreview() {
  const navigate = useNavigate();
  const { gallery, galleryLoaded } = useApp();
  const { loadMedia } = useStudio();
  const items = useMemo(() => gallery.slice(0, 6), [gallery]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState<Record<string, number>>({});

  const newest = items[0]?.path;
  useEffect(() => setI(0), [newest]);                          // a fresh creation is shown first
  const cur = items[Math.min(i, Math.max(items.length - 1, 0))];

  useEffect(() => {
    if (paused || items.length < 2 || !cur || prefersReducedMotion()) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % items.length), cur.is_video ? 9000 : 4500);
    return () => window.clearTimeout(t);
  }, [i, paused, items.length, cur]);

  if (!galleryLoaded) {
    return <div className="w-[210px] lg:w-[240px] aspect-[9/17] rounded-[34px] border-[6px] border-neutral-800 bg-surface-2 animate-pulse" aria-hidden />;
  }
  if (!cur) return null;

  const open = () => {
    loadMedia(fileToResult(cur));
    navigate("/post");
  };

  return (
    <div className="flex flex-col items-center gap-4" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <button
        onClick={open}
        aria-label={`Open ${cur.filename} in Post`}
        className="relative block w-[210px] lg:w-[240px] aspect-[9/17] rounded-[34px] border-[6px] border-neutral-900 bg-neutral-950 shadow-glow overflow-hidden text-left"
      >
        <span aria-hidden className="absolute top-2 left-1/2 -translate-x-1/2 z-10 w-16 h-4 rounded-full bg-neutral-950" />
        <AnimatePresence initial={false}>
          <motion.div key={cur.path} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            {cur.is_video ? (
              <video
                src={cur.url} autoPlay muted loop playsInline
                className="w-full h-full object-cover"
                onLoadedMetadata={(e) => {
                  const sec = e.currentTarget.duration;       // read now: currentTarget is cleared once the handler returns
                  setSeconds((s) => ({ ...s, [cur.path]: sec }));
                }}
              />
            ) : (
              <img src={cur.url} alt="" className="w-full h-full object-cover" />
            )}
          </motion.div>
        </AnimatePresence>
        <span className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 px-3.5 pb-3.5 pt-12 bg-gradient-to-t from-neutral-950/90 to-transparent text-white text-[13px] font-semibold">
          <span className="inline-flex items-center gap-1.5 truncate">
            {cur.is_video ? <Video className="w-4 h-4 shrink-0" /> : <ImageIcon className="w-4 h-4 shrink-0" />}
            <span className="truncate">{pipelineLabel(cur.filename, cur.is_video)}</span>
          </span>
          {cur.is_video && seconds[cur.path] ? <span className="tabular-nums shrink-0">{clock(seconds[cur.path])}</span> : null}
        </span>
      </button>
      {items.length > 1 && (
        <div className="flex gap-2" role="group" aria-label="Choose a creation to show">
          {items.map((f, n) => (
            <button
              key={f.path}
              onClick={() => setI(n)}
              aria-label={`Show creation ${n + 1} of ${items.length}`}
              aria-current={n === i}
              className={clsx("h-2 rounded-full transition-all", n === i ? "w-7 bg-secondary-400" : "w-2 bg-white/45 hover:bg-white/70")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Top of the dashboard: describe something and generate it right here, next to your latest creations. */
export default function Hero() {
  const { health, gallery, galleryLoaded } = useApp();
  const { generate, generating, progress, step } = useStudio();
  const [task, setTask] = useState<HeroTask>("text_to_video");
  const [text, setText] = useState("");
  const noTokens = !!health && !health.keys.huggingface.configured;
  const hasMedia = gallery.length > 0 || !galleryLoaded;
  const ideas = TASK_BY_KEY[task].presets.slice(0, 2);
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (generating) return;
    generate({ task, prompt: text });
  };

  return (
    <div className="sweep-border rounded-[28px] shadow-3">
      <div className="relative rounded-[28px] overflow-hidden border border-line">
        <HeroBackdrop />
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
          <span className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary-400/80 rounded-tl-lg" />
          <span className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-secondary-400/80 rounded-tr-lg" />
          <span className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary-400/80 rounded-bl-lg" />
          <span className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-secondary-400/80 rounded-br-lg" />
        </div>

        <div className="relative grid md:grid-cols-[1.15fr_.85fr] items-center gap-8 px-6 sm:px-12 lg:px-16 py-12 min-h-[470px] lg:min-h-[500px] text-white">
          <div className="flex flex-col gap-5 max-w-[640px]">
            <span className="eyebrow w-fit"><Sparkles className="ic-sm w-4 h-4" />AI Content Engine</span>
            <h1 className="text-[32px] sm:text-[42px] lg:text-[52px] leading-[1.05] font-bold tracking-tight [text-shadow:0_2px_30px_rgb(0_0_0/.5)]">
              Turn one line into a Reel
            </h1>
            <p className="text-[15px] sm:text-[16px] text-white/80 max-w-[540px]">
              Describe a scene, pick Reel or Image, and it is generated, captioned and ready to post.
            </p>

            <form onSubmit={submit} className="mt-1" aria-label="Create with a prompt">
              <div className="flex gap-2 mb-3" role="group" aria-label="What to create">
                {CHOICES.map((c) => (
                  <button
                    key={c.key} type="button" onClick={() => setTask(c.key)} aria-pressed={task === c.key}
                    className={clsx(
                      "inline-flex items-center gap-2 px-4 py-2 rounded-full text-[14px] font-semibold border transition",
                      task === c.key ? "bg-white text-neutral-950 border-white" : "bg-white/10 border-white/25 text-white hover:bg-white/20",
                    )}
                  >
                    <c.icon className="w-4 h-4" />{c.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="hero-prompt"
                  className="input !h-14 !text-[16px] flex-1 !bg-white/10 !border-white/25 !text-white placeholder:!text-white/60"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={task === "text_to_video" ? "A stylish girl walking in a rainy neon city…" : "A cozy Nordic coffee shop on a snowy evening…"}
                  aria-label="Describe what to create"
                  disabled={generating}
                  maxLength={600}
                />
                <button type="submit" className="btn btn-primary btn-lg shrink-0" disabled={generating || noTokens}>
                  {generating ? <Spinner /> : <Zap className="ic" />}<span>{generating ? "Creating…" : "Create"}</span>
                </button>
              </div>

              {generating ? (
                <div className="mt-4" role="status" aria-live="polite">
                  <div className="flex justify-between text-[13px] text-white/80 mb-1.5"><span className="truncate pr-3">{step || "Working"}</span><span className="tabular-nums">{progress}%</span></div>
                  <div className="h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(6, progress)}%` }} /></div>
                </div>
              ) : noTokens ? (
                <p className="text-[13.5px] text-secondary-300 mt-3">
                  Add a Hugging Face token in <button type="button" className="underline font-semibold" onClick={() => navigate("/settings")}>Settings</button> to start creating.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 mt-3 text-[13px]">
                  <span className="text-white/65">Try:</span>
                  {ideas.map((idea) => (
                    <button key={idea} type="button" onClick={() => setText(idea)} className="max-w-[260px] truncate px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/90 hover:bg-white/20 transition" title={idea}>
                      {idea}
                    </button>
                  ))}
                  <button type="button" className="underline text-white/75 hover:text-white ml-1" onClick={() => document.getElementById("quick-create")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                    More options
                  </button>
                </div>
              )}
            </form>
          </div>

          <div className="hidden md:flex justify-center">
            {hasMedia ? <LivePreview /> : <div className="relative w-full h-[420px] pointer-events-none"><HeroScene index={0} /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
