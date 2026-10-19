import { useNavigate } from "react-router-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Keyboard, Navigation, Pagination } from "swiper/modules";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderOpen,
  KeyRound,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Video,
  Wand2,
  Zap,
  XCircle,
  Activity,
} from "lucide-react";
import { motion } from "framer-motion";
import { HeroBackdrop, HeroScene, ShimmerTile, TaskArt } from "../components/art/Scenes";
import KpiCard from "../components/ui/KpiCard";
import Reveal from "../components/ui/Reveal";
import { useApp } from "../context/AppContext";
import { useStudio } from "../context/StudioContext";
import { TASKS } from "../data/tasks";
import type { TaskKey } from "../api/types";

const SLIDES = [
  {
    eyebrow: "Text to Video",
    icon: Video,
    title: "Cinematic Reels from a single line of text",
    text: "Describe a scene and get a 9:16 vertical video, mixed with background audio and paired with a ready-to-post caption.",
    cta: { label: "Start Creating", icon: Zap, to: "/studio?task=text_to_video" },
    alt: { label: "Browse Media", to: "/gallery" },
  },
  {
    eyebrow: "Six AI Pipelines",
    icon: Layers,
    title: "Animate, restyle, edit and swap in one studio",
    text: "Image to video, video to video, image editing and face swap run on Hugging Face Spaces with automatic account failover.",
    cta: { label: "Explore Pipelines", icon: Sparkles, to: "/studio" },
    alt: { label: "Configure Accounts", to: "/settings" },
  },
  {
    eyebrow: "Scheduler",
    icon: CalendarClock,
    title: "Schedule once and publish on autopilot",
    text: "Batch dozens of prompts, set daily posting slots, and let the queue generate and publish to Instagram for you.",
    cta: { label: "Open Queue", icon: CalendarClock, to: "/queue" },
    alt: { label: "Daily Slots", to: "/settings" },
  },
];

const STEPS = [
  { n: "01", title: "Create", text: "Choose a pipeline, write a prompt, and upload reference media if the task needs it." },
  { n: "02", title: "Preview", text: "Open the result on the Post page, see it in the Reels preview and rewrite the caption in the tone you want." },
  { n: "03", title: "Publish", text: "Post now or schedule it. Dry-run mode lets you test the whole flow without posting." },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { health, queue, gallery, refreshAll } = useApp();
  const { setTask } = useStudio();

  const pending = queue.filter((j) => (j.status ?? "pending") === "pending").length;
  const done = queue.filter((j) => j.status === "done").length;
  const recent = gallery.slice(0, 10);

  const openTask = (key: TaskKey) => {
    setTask(key);
    navigate("/studio");
  };

  const services = [
    { label: "Hugging Face", ok: !!health?.keys.huggingface.configured, detail: health ? `${health.keys.huggingface.total_accounts} account(s)` : "" },
    {
      label: "Caption AI",
      ok: !!health?.caption_ai.providers.some((p) => p.configured),
      detail: health
        ? `${health.caption_ai.providers.find((p) => p.id === health.caption_ai.provider)?.label ?? ""} · ${health.caption_ai.providers.filter((p) => p.configured).length} key(s)`
        : "",
    },
    { label: "Instagram", ok: !!health?.keys.instagram.configured, detail: health?.keys.instagram.preview ?? "" },
    { label: "Cloudinary", ok: !!health?.keys.cloudinary.configured, detail: health?.keys.cloudinary.preview ?? "" },
  ];

  return (
    <div className="space-y-10">
      {/* Hero slider */}
      <div className="hero-swiper relative rounded-[28px] overflow-hidden border border-line shadow-3 group">
        {/* HUD frame */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
          <span className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary-400/80 rounded-tl-lg" />
          <span className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-secondary-400/80 rounded-tr-lg" />
          <span className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary-400/80 rounded-bl-lg" />
          <span className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-secondary-400/80 rounded-br-lg" />
          <div className="absolute inset-x-0 h-24 -top-24 bg-gradient-to-b from-transparent via-primary-400/10 to-transparent animate-scan [animation-duration:7s]" style={{ top: 0, height: "30%" }} />
        </div>
        <Swiper
          modules={[Autoplay, Pagination, Navigation, Keyboard]}
          slidesPerView={1}
          speed={700}
          loop
          keyboard
          autoplay={{ delay: 6000, disableOnInteraction: false, pauseOnMouseEnter: true }}
          pagination={{ clickable: true }}
          navigation={{ prevEl: ".hero-prev", nextEl: ".hero-next" }}
        >
          {SLIDES.map((s, i) => (
            <SwiperSlide key={s.eyebrow}>
              <div className="relative h-[380px] sm:h-[440px] lg:h-[480px]">
                <HeroBackdrop />
                <div className="hidden md:block absolute right-0 inset-y-0 w-[48%] pointer-events-none">
                  <HeroScene index={i} />
                </div>
                <div className="relative h-full flex flex-col justify-center gap-4 px-6 sm:px-12 lg:px-16 max-w-[720px] text-white">
                  <span className="eyebrow w-fit">
                    <s.icon className="ic-sm w-4 h-4" />
                    {s.eyebrow}
                  </span>
                  <h2 className="text-[30px] sm:text-[42px] lg:text-[52px] leading-[1.05] font-bold tracking-tight [text-shadow:0_2px_30px_rgb(0_0_0/.5)]">{s.title}</h2>
                  <p className="text-[14px] sm:text-[16px] text-white/80 max-w-[560px]">{s.text}</p>
                  <div className="flex flex-wrap gap-3 mt-2">
                    <button className="btn btn-primary btn-lg" onClick={() => navigate(s.cta.to)}>
                      <s.cta.icon className="ic" />
                      <span>{s.cta.label}</span>
                    </button>
                    <button className="btn btn-glass btn-lg" onClick={() => navigate(s.alt.to)}>
                      {s.alt.label}
                    </button>
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
        <button className="hero-prev absolute left-4 top-1/2 -translate-y-1/2 z-10 grid place-items-center w-11 h-11 rounded-full bg-white/15 backdrop-blur border border-white/25 text-white opacity-0 group-hover:opacity-100 hover:bg-white/30 transition" aria-label="Previous slide">
          <ChevronLeft className="ic" />
        </button>
        <button className="hero-next absolute right-4 top-1/2 -translate-y-1/2 z-10 grid place-items-center w-11 h-11 rounded-full bg-white/15 backdrop-blur border border-white/25 text-white opacity-0 group-hover:opacity-100 hover:bg-white/30 transition" aria-label="Next slide">
          <ChevronRight className="ic" />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <KpiCard label="Media Assets" value={gallery.length} icon={FolderOpen} tone="primary" />
        <KpiCard label="Pending Jobs" value={pending} icon={Clock} tone="secondary" delay={0.06} />
        <KpiCard label="Published" value={done} icon={CheckCircle2} tone="success" delay={0.12} />
        <KpiCard label="HF Accounts" value={health?.keys.huggingface.total_accounts ?? 0} icon={KeyRound} tone="neutral" delay={0.18} />
      </div>

      {/* Pipelines */}
      <section>
        <Reveal>
          <div className="section-head">
            <div>
              <h2>AI Pipelines</h2>
              <p>Pick a pipeline to open it in the Studio with its model preset loaded.</p>
            </div>
            <button className="btn btn-ghost" onClick={() => navigate("/studio")}>
              <span>Open Studio</span>
              <ArrowRight className="ic-sm w-4 h-4" />
            </button>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {TASKS.map((t, i) => (
            <Reveal key={t.key} delay={(i % 3) * 0.07}>
              <motion.button
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 320, damping: 22 }}
                onClick={() => openTask(t.key)}
                className="neon-border group relative block w-full h-[230px] rounded-2xl overflow-hidden border border-line shadow-2 hover:shadow-glow text-left"
              >
                <TaskArt task={t.key} lift fill />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/85 via-neutral-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="grid place-items-center w-9 h-9 rounded-md bg-brand text-neutral-950 shadow-glow">
                      <t.icon className="ic" />
                    </span>
                    <span className="badge bg-white/15 text-white backdrop-blur">{t.tag}</span>
                  </div>
                  <strong className="block text-[18px]">{t.title}</strong>
                  <span className="block text-[13px] text-white/75">{t.desc}</span>
                  <span className="absolute right-5 bottom-5 grid place-items-center w-9 h-9 rounded-full bg-white/15 backdrop-blur opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition duration-300">
                    <ArrowRight className="ic-sm w-4 h-4" />
                  </span>
                </div>
              </motion.button>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Recent creations marquee */}
      <section>
        <Reveal>
          <div className="section-head">
            <div>
              <h2>Recent Creations</h2>
              <p>Latest outputs from the media vault. Hover to pause.</p>
            </div>
            <button className="btn btn-ghost" onClick={() => navigate("/gallery")}>
              <span>View All</span>
              <ArrowRight className="ic-sm w-4 h-4" />
            </button>
          </div>
        </Reveal>
        <div className="relative overflow-hidden rounded-lg [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
          <div className="flex w-max gap-4 animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
            {[0, 1].map((copy) =>
              (recent.length
                ? recent.map((f) => ({ key: f.path, url: f.url, video: f.is_video, file: "" }))
                : Array.from({ length: 6 }, (_, i) => ({ key: `s${i}`, url: "", video: i % 2 === 0, file: "" }))
              ).map((f) => (
                <div key={`${copy}-${f.key}`} aria-hidden={copy === 1} className="relative w-[180px] sm:w-[210px] aspect-[9/14] rounded-lg overflow-hidden border border-line bg-surface-2 shrink-0">
                  {f.url ? (
                    f.video ? (
                      <video src={f.url} muted loop playsInline className="w-full h-full object-cover" onMouseOver={(e) => e.currentTarget.play()} onMouseOut={(e) => e.currentTarget.pause()} />
                    ) : (
                      <img src={f.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <ShimmerTile video={f.video} className="w-full h-full" />
                  )}
                </div>
              )),
            )}
          </div>
        </div>
      </section>

      {/* Workflow + health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Reveal>
          <div className="card h-full">
            <div className="card-head">
              <h3 className="card-title"><Wand2 className="ic" />How It Works</h3>
            </div>
            <ol className="space-y-5">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="grid place-items-center w-10 h-10 rounded-md bg-primary-600/15 text-primary-400 font-mono text-[13px] font-medium shrink-0">{s.n}</span>
                  <div>
                    <strong className="block text-[15px]">{s.title}</strong>
                    <p className="text-[13px] text-muted">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="card h-full">
            <div className="card-head">
              <h3 className="card-title"><ShieldCheck className="ic" />Service Health</h3>
              <button className="p-2 -m-2 rounded-md text-muted hover:text-fg hover:bg-surface-2" onClick={refreshAll} aria-label="Refresh status">
                <RefreshCw className="ic-sm w-4 h-4" />
              </button>
            </div>
            <ul className="divide-y divide-line">
              {services.map((s) => (
                <li key={s.label} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                  {s.ok ? <Activity className="ic text-success" /> : <XCircle className="ic text-danger" />}
                  <div className="flex-1 min-w-0">
                    <strong className="block text-[14px]">{s.label}</strong>
                    <span className="block text-[12px] text-dim font-mono truncate">{s.detail || "Not configured"}</span>
                  </div>
                  <span className={`badge ${s.ok ? "badge-done" : "badge-failed"}`}>{s.ok ? "Ready" : "Missing"}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
