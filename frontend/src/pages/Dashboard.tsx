import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderOpen,
  Loader2,
  CheckCircle2,
  Users,
  Wand2,
  ArrowRight,
} from "lucide-react";
import Hero from "../components/dashboard/Hero";
import Pipelines from "../components/dashboard/Pipelines";
import KpiCard from "../components/ui/KpiCard";
import Reveal from "../components/ui/Reveal";
import LiveQueue from "../components/dashboard/LiveQueue";
import QuickCreate from "../components/dashboard/QuickCreate";
import RecentCreations from "../components/dashboard/RecentCreations";
import ServiceHealth from "../components/dashboard/ServiceHealth";
import PublishingCalendar from "../components/dashboard/PublishingCalendar";
import { useApp } from "../context/AppContext";
import { useStudio } from "../context/StudioContext";

const STEPS = [
  { n: "01", title: "Create", text: "Choose a pipeline, write a prompt, and upload reference media if the task needs it." },
  { n: "02", title: "Preview", text: "Open the result on the Post page, see it in the Reels preview and rewrite the caption in the tone you want." },
  { n: "03", title: "Publish", text: "Post now or schedule it. Dry-run mode lets you test the whole flow without posting." },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { health, queue, gallery, refreshLive, refreshGallery } = useApp();
  const { generating } = useStudio();

  // keep the numbers, the queue and the vault live while this page is open
  useEffect(() => {
    let tick = 0;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      refreshLive();
      if (++tick % 3 === 0) refreshGallery();
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshLive, refreshGallery]);

  const stats = useMemo(() => {
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      return d.toDateString();
    };
    const made = (offset: number) => gallery.filter((f) => new Date(f.timestamp * 1000).toDateString() === day(offset)).length;
    const accounts = health?.keys.instagram.official_accounts ?? [];
    const healthy = accounts.filter((a) => a.days_left !== 0).length;
    const busy = generating || !!health?.active_generation?.is_generating;
    return {
      mediaToday: made(0),
      mediaSpark: Array.from({ length: 7 }, (_, i) => made(6 - i)),
      processing: queue.filter((j) => j.status === "running").length + (busy ? 1 : 0),
      queued: queue.filter((j) => (j.status ?? "pending") === "pending").length,
      accounts: accounts.length,
      healthy,
    };
  }, [gallery, queue, health, generating]);
  const published = health?.published;

  return (
    <div className="space-y-14">
      <Hero />

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <KpiCard label="Media Assets" value={gallery.length} icon={FolderOpen} tone="primary" to="/gallery"
          hint={stats.mediaToday ? `+${stats.mediaToday} today` : "In the active account"} spark={stats.mediaSpark} />
        <KpiCard label="Processing" value={stats.processing} icon={Loader2} tone="secondary" delay={0.06} to="/queue"
          hint={stats.processing ? "Generating now" : stats.queued ? `${stats.queued} waiting in queue` : "Idle"} />
        <KpiCard label="Published" value={published?.total ?? 0} icon={CheckCircle2} tone="success" delay={0.12}
          hint={published?.today ? `+${published.today} today` : "Real posts, not dry runs"} spark={published?.days} />
        <KpiCard label="Connected Accounts" value={stats.healthy} icon={Users} tone="neutral" delay={0.18} to="/settings"
          hint={!stats.accounts ? "None connected yet" : stats.healthy < stats.accounts ? `${stats.accounts - stats.healthy} need a new token` : `${stats.accounts} authenticated`} />
      </div>

      {/* Quick create + live queue */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch">
        <Reveal className="lg:col-span-2"><QuickCreate /></Reveal>
        <Reveal className="lg:col-span-3" delay={0.06}><LiveQueue /></Reveal>
      </div>

      <Pipelines />

      {/* Recent creations */}
      <section>
        <Reveal>
          <div className="section-head">
            <div>
              <h2>Recent Creations</h2>
              <p>Hover a file for Preview, Download, Edit and Publish.</p>
            </div>
            <button className="btn btn-ghost" onClick={() => navigate("/gallery")}>
              <span>View All</span>
              <ArrowRight className="ic-sm w-4 h-4" />
            </button>
          </div>
        </Reveal>
        <RecentCreations />
      </section>

      <PublishingCalendar />

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
          <ServiceHealth />
        </Reveal>
      </div>
    </div>
  );
}
