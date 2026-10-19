import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Check, Image as ImageIcon, Play, Send, Video, Zap } from "lucide-react";
import clsx from "clsx";
import type { TaskKey } from "../../api/types";
import { TASKS } from "../../data/tasks";

/* Everything here is drawn in code (SVG, CSS, framer-motion): no image files. */

const GRID = {
  backgroundImage:
    "linear-gradient(rgb(var(--fg) / .06) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--fg) / .06) 1px, transparent 1px)",
  backgroundSize: "28px 28px",
} as const;

/* ------------------------------------------------------------------ small helpers */
function Typewriter({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    const full = lines[i];
    if (n < full.length) {
      const t = setTimeout(() => setN(n + 1), 55);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setI((i + 1) % lines.length);
      setN(0);
    }, 1800);
    return () => clearTimeout(t);
  }, [i, n, lines]);
  return (
    <span>
      {lines[i].slice(0, n)}
      <span className="inline-block w-[2px] h-[1em] bg-primary-400 ml-0.5 align-[-2px] animate-pulse" />
    </span>
  );
}

function Float({ children, className, delay = 0, y = 8 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -y, 0] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {children}
    </motion.div>
  );
}

const glass = "rounded-2xl border border-white/15 bg-white/[.07] backdrop-blur-md shadow-2";

/* ------------------------------------------------------------------ hero backdrop (behind the text) */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-gradient-to-br from-primary-950 via-neutral-950 to-neutral-950">
      <div className="absolute inset-0 opacity-60" style={GRID} />
      <motion.div
        className="absolute -top-1/3 right-[-10%] w-[60%] aspect-square rounded-full blur-[90px] bg-primary-600/40"
        animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-1/2 left-[20%] w-[50%] aspect-square rounded-full blur-[100px] bg-secondary-600/25"
        animate={{ x: [0, 50, 0], y: [0, -30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <motion.span
          key={i}
          className="absolute w-1 h-1 rounded-full bg-primary-300"
          style={{ left: `${(i * 13 + 8) % 96}%`, top: `${(i * 29 + 12) % 90}%` }}
          animate={{ opacity: [0, 0.9, 0], y: [0, -26, -52] }}
          transition={{ duration: 5 + (i % 3), repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ hero scenes (right half) */
function SceneTextToVideo() {
  return (
    <div className="relative w-full h-full">
      <motion.div
        className="absolute left-1/2 top-1/2 w-[330px] h-[330px] -ml-[165px] -mt-[165px] rounded-full border border-dashed border-primary-400/30"
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      />
      {/* phone with a "rendering" Reel */}
      <Float className="absolute left-1/2 top-1/2 -ml-[85px] -mt-[150px]" y={10}>
        <div className="relative w-[170px] h-[300px] rounded-[28px] border border-white/20 bg-neutral-950/80 p-2 shadow-3">
          <div className="relative w-full h-full rounded-[22px] overflow-hidden bg-gradient-to-b from-primary-600/50 via-primary-900/60 to-neutral-950">
            <motion.div className="absolute w-28 h-28 rounded-full bg-primary-400/50 blur-2xl" animate={{ x: [-10, 70, -10], y: [20, 110, 20] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
            <motion.div className="absolute right-0 w-24 h-24 rounded-full bg-secondary-300/40 blur-2xl" animate={{ x: [0, -60, 0], y: [160, 70, 160] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
            <div className="absolute inset-x-0 top-3 flex justify-center"><span className="w-12 h-1.5 rounded-full bg-black/60" /></div>
            <div className="absolute inset-0 grid place-items-center">
              <span className="relative grid place-items-center w-14 h-14 rounded-full bg-white/90 text-neutral-950">
                <span className="absolute inset-0 rounded-full border border-white/70 animate-ring-out" />
                <Play className="w-6 h-6 fill-current ml-0.5" />
              </span>
            </div>
            <div className="absolute inset-x-3 bottom-3 h-1 rounded-full bg-white/25 overflow-hidden">
              <motion.div className="h-full bg-primary-300" animate={{ width: ["0%", "100%"] }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} />
            </div>
          </div>
        </div>
      </Float>
      <Float className={clsx(glass, "absolute left-[2%] top-[16%] px-4 py-3 w-[230px] text-white")} delay={0.6}>
        <span className="block text-[10px] font-bold uppercase tracking-widest text-primary-300 mb-1">Prompt</span>
        <span className="block text-[13px] leading-snug min-h-[36px]">
          <Typewriter lines={["A girl walking in a rainy neon city", "Golden hour over the coastline", "Coffee pouring, cozy morning"]} />
        </span>
      </Float>
      <Float className={clsx(glass, "absolute right-[2%] bottom-[14%] px-4 py-3 flex items-center gap-3 text-white")} delay={1.2}>
        <span className="grid place-items-center w-8 h-8 rounded-full bg-primary-500 text-neutral-950"><Check className="w-4 h-4" /></span>
        <span className="text-[13px] font-semibold leading-tight">Reel ready<span className="block text-[11px] font-normal text-white/60">9:16 · caption written</span></span>
      </Float>
    </div>
  );
}

function SceneOrbit() {
  const radius = 128;
  return (
    <div className="relative w-full h-full grid place-items-center">
      {[150, 215].map((s, i) => (
        <motion.div
          key={s}
          className="absolute rounded-full border border-dashed border-primary-400/25"
          style={{ width: s * 2 - 40, height: s * 2 - 40 }}
          animate={{ rotate: i ? -360 : 360 }}
          transition={{ duration: 60 + i * 20, repeat: Infinity, ease: "linear" }}
        />
      ))}
      <span className="absolute w-24 h-24 rounded-full bg-primary-500/40 blur-2xl" />
      <div className="relative grid place-items-center w-[84px] h-[84px] rounded-full bg-brand text-neutral-950 shadow-glow">
        <span className="absolute inset-0 rounded-full bg-brand animate-ring-out" />
        <Zap className="w-9 h-9 fill-current" />
      </div>
      <motion.div className="absolute w-0 h-0" animate={{ rotate: 360 }} transition={{ duration: 36, repeat: Infinity, ease: "linear" }}>
        {TASKS.map((t, i) => {
          const a = (i / TASKS.length) * 2 * Math.PI;
          return (
            <motion.div
              key={t.key}
              className={clsx(glass, "absolute grid place-items-center w-14 h-14 -ml-7 -mt-7 text-primary-200")}
              style={{ left: Math.cos(a) * radius, top: Math.sin(a) * radius }}
              animate={{ rotate: -360 }}
              transition={{ duration: 36, repeat: Infinity, ease: "linear" }}
            >
              <t.icon className="w-6 h-6" />
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function SceneScheduler() {
  const posts = [1, 4, 9, 12, 16, 19];
  return (
    <div className="relative w-full h-full grid place-items-center">
      <Float y={6} className={clsx(glass, "w-[320px] p-4 text-white")}>
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold"><CalendarClock className="w-4 h-4 text-primary-300" />This week</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary-300">Auto-post</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="text-center text-[10px] text-white/45 font-semibold">{d}</span>
          ))}
          {Array.from({ length: 21 }, (_, i) => {
            const k = posts.indexOf(i);
            return (
              <div key={i} className="relative aspect-square rounded-md bg-white/[.06] overflow-hidden">
                {k > -1 && (
                  <motion.span
                    className="absolute inset-0.5 rounded-[5px] bg-brand grid place-items-center text-neutral-950"
                    animate={{ scale: [0, 1, 1, 1, 0], opacity: [0, 1, 1, 1, 0] }}
                    transition={{ duration: 7, repeat: Infinity, times: [0, 0.08, 0.8, 0.94, 1], delay: k * 0.7 }}
                  >
                    <Send className="w-3 h-3" />
                  </motion.span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <motion.div className="h-full bg-primary-400" animate={{ width: ["0%", "100%"] }} transition={{ duration: 7, repeat: Infinity, ease: "linear" }} />
        </div>
      </Float>
      <Float className={clsx(glass, "absolute right-[4%] bottom-[12%] px-4 py-3 flex items-center gap-3 text-white")} delay={0.9}>
        <span className="grid place-items-center w-8 h-8 rounded-full bg-primary-500 text-neutral-950"><Check className="w-4 h-4" /></span>
        <span className="text-[13px] font-semibold leading-tight">Posted<span className="block text-[11px] font-normal text-white/60">19:00 · on schedule</span></span>
      </Float>
    </div>
  );
}

export function HeroScene({ index }: { index: number }) {
  return <>{[<SceneTextToVideo key="a" />, <SceneOrbit key="b" />, <SceneScheduler key="c" />][index % 3]}</>;
}

/* ------------------------------------------------------------------ pipeline illustrations */
const SP = { style: { transformBox: "fill-box" as const, transformOrigin: "center" as const } };
const loop = (duration: number, delay = 0) => ({ duration, repeat: Infinity, ease: "easeInOut" as const, delay });

function ArtTextToVideo() {
  return (
    <>
      <rect x="62" y="26" width="76" height="52" rx="8" />
      <motion.path d="M92 42 L92 62 L110 52Z" fill="currentColor" stroke="none" {...SP} animate={{ scale: [1, 1.18, 1] }} transition={loop(1.6)} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <motion.rect
          key={i}
          x={62 + i * 12}
          y="90"
          width="6"
          height="18"
          rx="2"
          fill="currentColor"
          stroke="none"
          style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
          animate={{ scaleY: [0.3, 1, 0.5, 0.9, 0.3] }}
          transition={loop(1.8, i * 0.15)}
        />
      ))}
    </>
  );
}

function ArtImageToVideo() {
  return (
    <>
      <rect x="64" y="22" width="72" height="56" rx="8" />
      <motion.circle cx="84" cy="42" r="6" fill="currentColor" stroke="none" animate={{ x: [0, 34, 0], y: [0, 6, 0] }} transition={loop(3.2)} />
      <path d="M64 78 L88 54 L104 68 L116 58 L136 78Z" fill="currentColor" fillOpacity=".25" />
      {[0, 1, 2].map((i) => (
        <motion.line key={i} x1="40" x2="54" y1={42 + i * 12} y2={42 + i * 12} strokeLinecap="round" animate={{ x: [0, -10, 0], opacity: [0.2, 1, 0.2] }} transition={loop(1.4, i * 0.2)} />
      ))}
      <motion.path d="M148 46 L160 52 L148 58Z" fill="currentColor" stroke="none" animate={{ x: [0, 8, 0] }} transition={loop(1.4)} />
    </>
  );
}

function ArtTextToImage() {
  const star = "M0 -9 L2.4 -2.4 L9 0 L2.4 2.4 L0 9 L-2.4 2.4 L-9 0 L-2.4 -2.4Z";
  return (
    <>
      <motion.rect x="62" y="22" width="76" height="62" rx="8" animate={{ pathLength: [0, 1, 1, 0] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.4, 0.85, 1] }} />
      <motion.rect x="70" y="30" width="60" height="46" rx="5" fill="currentColor" stroke="none" animate={{ opacity: [0, 0.35, 0.35, 0] }} transition={{ duration: 4, repeat: Infinity, times: [0.3, 0.5, 0.85, 1] }} />
      <rect x="62" y="96" width="46" height="4" rx="2" fill="currentColor" stroke="none" opacity=".55" />
      <motion.rect x="112" y="93" width="3" height="10" fill="currentColor" stroke="none" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
      {[[142, 30, 0], [52, 62, 0.6], [128, 78, 1.2]].map(([x, y, d], i) => (
        <motion.path key={i} d={star} transform={`translate(${x} ${y})`} fill="currentColor" stroke="none" {...SP} animate={{ scale: [0, 1, 0], rotate: [0, 90, 180] }} transition={loop(2.4, d as number)} />
      ))}
    </>
  );
}

function ArtFaceSwap() {
  const Face = ({ x }: { x: number }) => (
    <g transform={`translate(${x} 52)`}>
      <circle r="20" />
      <circle cx="-7" cy="-3" r="2" fill="currentColor" stroke="none" />
      <circle cx="7" cy="-3" r="2" fill="currentColor" stroke="none" />
      <path d="M-7 8 Q0 14 7 8" strokeLinecap="round" />
    </g>
  );
  return (
    <>
      <motion.g animate={{ x: [0, 56, 0] }} transition={loop(3.6)}><Face x={72} /></motion.g>
      <motion.g animate={{ x: [0, -56, 0] }} transition={loop(3.6)} opacity=".6"><Face x={128} /></motion.g>
      <motion.path d="M86 88 Q100 100 114 88" strokeLinecap="round" animate={{ opacity: [0.2, 1, 0.2] }} transition={loop(1.8)} />
      <motion.path d="M110 90 L114 88 L111 84" strokeLinecap="round" strokeLinejoin="round" animate={{ opacity: [0.2, 1, 0.2] }} transition={loop(1.8)} />
    </>
  );
}

function ArtVideoToVideo() {
  return (
    <>
      <rect x="40" y="30" width="52" height="44" rx="6" />
      <rect x="108" y="30" width="52" height="44" rx="6" />
      <motion.rect x="108" y="30" width="52" height="44" rx="6" fill="currentColor" stroke="none" animate={{ opacity: [0.05, 0.4, 0.05] }} transition={loop(2.6)} />
      <motion.line x1="108" x2="108" y1="32" y2="72" strokeLinecap="round" animate={{ x: [0, 52, 0] }} transition={loop(2.6)} />
      <motion.path d="M96 52 L104 52 M100 48 L104 52 L100 56" strokeLinecap="round" strokeLinejoin="round" animate={{ x: [0, 3, 0] }} transition={loop(1.2)} />
      {[0, 1, 2, 3].map((i) => (
        <motion.circle key={i} cx={52 + i * 36} cy="90" r="3" fill="currentColor" stroke="none" animate={{ opacity: [0.2, 1, 0.2] }} transition={loop(1.6, i * 0.25)} />
      ))}
    </>
  );
}

function ArtImageToImage() {
  return (
    <>
      <rect x="62" y="24" width="76" height="60" rx="8" />
      <path d="M62 84 L88 56 L106 74 L118 62 L138 84Z" fill="currentColor" fillOpacity=".22" />
      <circle cx="116" cy="40" r="6" fill="currentColor" fillOpacity=".5" stroke="none" />
      <motion.g animate={{ x: [-30, 30, -30] }} transition={loop(4)}>
        <line x1="100" x2="100" y1="20" y2="88" strokeLinecap="round" />
        <circle cx="100" cy="54" r="7" fill="currentColor" stroke="none" />
      </motion.g>
      <motion.path d="M70 100 Q100 90 130 100" strokeLinecap="round" animate={{ pathLength: [0, 1, 1, 0] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.4, 0.85, 1] }} />
    </>
  );
}

const ART: Record<TaskKey, () => JSX.Element> = {
  text_to_video: ArtTextToVideo,
  image_to_video: ArtImageToVideo,
  text_to_image: ArtTextToImage,
  face_swap: ArtFaceSwap,
  video_to_video: ArtVideoToVideo,
  image_to_image: ArtImageToImage,
};

/**
 * `fill` makes the art cover its (relatively positioned) parent; otherwise it is a normal block
 * you size with className. `lift` raises the drawing so it clears a text overlay at the bottom.
 */
export function TaskArt({ task, className, lift, fill }: { task: TaskKey; className?: string; lift?: boolean; fill?: boolean }) {
  const Art = ART[task];
  return (
    <div className={clsx("overflow-hidden bg-gradient-to-br from-primary-900/70 via-surface-2 to-surface text-primary-300", fill ? "absolute inset-0" : "relative", className)}>
      <div className="absolute inset-0 opacity-50" style={GRID} />
      <motion.span
        className="absolute -top-10 -right-6 w-40 h-40 rounded-full bg-primary-500/25 blur-3xl"
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg
        viewBox="0 0 200 120"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
        style={lift ? { transform: "translateY(-22%) scale(.78)" } : undefined}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      >
        <Art />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ banners, phone idle screen, loading tiles */
export function BannerArt() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-gradient-to-r from-primary-950 via-neutral-950 to-neutral-950">
      <div className="absolute inset-0 opacity-60" style={GRID} />
      <motion.div className="absolute -right-10 -top-24 w-[420px] h-[420px] rounded-full bg-primary-600/35 blur-[80px]" animate={{ x: [0, -50, 0], y: [0, 20, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute right-[30%] -bottom-32 w-[320px] h-[320px] rounded-full bg-secondary-600/20 blur-[80px]" animate={{ x: [0, 40, 0] }} transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="absolute w-1 h-1 rounded-full bg-primary-300"
          style={{ left: `${40 + i * 12}%`, top: `${20 + ((i * 23) % 60)}%` }}
          animate={{ opacity: [0, 1, 0], y: [0, -20, -40] }}
          transition={{ duration: 4 + i, repeat: Infinity, delay: i * 0.7 }}
        />
      ))}
    </div>
  );
}

export function PhoneIdle() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-gradient-to-b from-primary-900/70 via-neutral-950 to-neutral-950">
      <div className="absolute inset-0 opacity-50" style={GRID} />
      <motion.div className="absolute left-1/2 top-[28%] w-40 h-40 -ml-20 -mt-20 rounded-full bg-primary-500/30 blur-3xl" animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
      <div className="absolute left-1/2 top-[28%] -ml-8 -mt-8 w-16 h-16 grid place-items-center">
        {[0, 1.2].map((d) => (
          <span key={d} className="absolute inset-0 rounded-full border border-primary-300/60 animate-ring-out" style={{ animationDelay: `${d}s` }} />
        ))}
        <span className="relative grid place-items-center w-12 h-12 rounded-full bg-white/10 border border-white/20 text-white">
          <Video className="w-5 h-5" />
        </span>
      </div>
    </div>
  );
}

export function ShimmerTile({ video, className }: { video?: boolean; className?: string }) {
  return (
    <div className={clsx("relative overflow-hidden bg-gradient-to-b from-surface-2 to-surface", className)}>
      <div className="absolute inset-0 opacity-40" style={GRID} />
      <div className="absolute inset-0 grid place-items-center text-primary-300/70">
        {video ? <Play className="w-8 h-8" /> : <ImageIcon className="w-8 h-8" />}
      </div>
      <span className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
    </div>
  );
}
