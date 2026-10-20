import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Eye, Image as ImageIcon, ListChecks, ListPlus, Play, Plus, RefreshCw, Repeat, SkipForward, Trash2, User, Video } from "lucide-react";
import { api } from "../api/client";
import KpiCard from "../components/ui/KpiCard";
import Reveal from "../components/ui/Reveal";
import { BannerArt } from "../components/art/Scenes";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import Select from "../components/ui/Select";
import Spinner from "../components/ui/Spinner";
import { useApp } from "../context/AppContext";
import { TASKS, TASK_BY_KEY } from "../data/tasks";
import { jobForPost } from "../utils/media";
import Dropzone from "../components/studio/Dropzone";
import { useConfirm } from "../context/ConfirmContext";
import { useStudio } from "../context/StudioContext";
import { useToast } from "../context/ToastContext";
import type { QueueJob } from "../api/types";

const BADGE: Record<string, string> = { pending: "badge-pending", running: "badge-primary", done: "badge-done", failed: "badge-failed" };

export default function Queue() {
  const { queue, refreshQueue, refreshGallery, config, health } = useApp();
  const { loadMedia, setPostOpts } = useStudio();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [running, setRunning] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTask, setBulkTask] = useState("text_to_video");
  const [bulkText, setBulkText] = useState("");
  const [bulkFiles, setBulkFiles] = useState<{ image: File | null; video: File | null; face: File | null }>({ image: null, video: null, face: null });
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkMeta = TASK_BY_KEY[bulkTask as keyof typeof TASK_BY_KEY];
  const bulkNeedsFile = !!bulkMeta && (bulkMeta.needsImage || bulkMeta.needsVideo || bulkMeta.needsFace);
  const bulkModel = config?.tasks?.[bulkTask]?.space ?? "";

  const status = (j: QueueJob) => j.status ?? "pending";
  const pending = queue.filter((j) => status(j) === "pending").length;
  const done = queue.filter((j) => status(j) === "done").length;
  const failed = queue.filter((j) => status(j) === "failed").length;

  // A job scheduled for later is never posted early by accident: the user is asked first.
  type Choice = "now" | "next" | "cancel";
  const [ask, setAsk] = useState<{ job: QueueJob; last: boolean; resolve: (c: Choice) => void } | null>(null);
  const choose = (job: QueueJob, last: boolean) => new Promise<Choice>((resolve) => setAsk({ job, last, resolve }));
  const answer = (c: Choice) => {
    ask?.resolve(c);
    setAsk(null);
  };

  const run = async () => {
    const nowStamp = (() => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    })();
    const waiting = queue.filter((j) => status(j) === "pending");
    if (!waiting.length) return toast("No pending jobs to run.", "info");
    const isLater = (j: QueueJob) => !!j.post_at && j.post_at > nowStamp;
    // jobs that are due (or have no time) first, then the ones scheduled for later, soonest first
    const order = [...waiting.filter((j) => !isLater(j)), ...waiting.filter(isLater).sort((a, b) => (a.post_at! < b.post_at! ? -1 : 1))];

    try {
      for (let i = 0; i < order.length; i++) {
        const job = order[i];
        if (isLater(job)) {
          const c = await choose(job, i === order.length - 1);
          if (c === "cancel") return;
          if (c === "next") continue;
        }
        setRunning(true);                       // only while a job really runs, not while the question is open
        const d = await api.runQueue(1, job.id);
        toast(d.executed ? "Job finished. Check its status in the list." : "Nothing was run.", d.executed ? "success" : "info");
        refreshQueue();
        refreshGallery();
        return;
      }
      toast("No other job is due. The rest are scheduled for later.", "info");
    } catch (e) {
      toast("Execution error: " + (e as Error).message, "error");
      refreshQueue();
    } finally {
      setRunning(false);
    }
  };

  const remove = async (job: QueueJob) => {
    const ok = await confirm({ title: "Remove this job?", text: "It will be deleted from the queue.", confirmLabel: "Remove" });
    if (!ok) return;
    try {
      await api.deleteJob(job.id);
      toast("Job removed from queue", "info");
      refreshQueue();
    } catch (e) {
      toast("Error deleting: " + (e as Error).message, "error");
    }
  };

  // open the job on the Post page with ALL its pictures selected (a carousel shows every picture, in order)
  const view = (job: QueueJob) => {
    const p = jobForPost(job);
    if (!p) return;
    loadMedia(p.result);
    setPostOpts(p.carousel ? { files: p.files, format: "carousel", audio: "none" } : { files: p.files });
    navigate("/post");
  };

  const submitBulk = async () => {
    const prompts = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!prompts.length) return toast("Please enter at least one prompt line", "error");
    // the pipelines that start from a file need it before anything is queued
    const needed: ("image" | "video" | "face")[] = [];
    if (bulkMeta?.needsImage) needed.push("image");
    if (bulkMeta?.needsVideo) needed.push("video");
    if (bulkMeta?.needsFace) needed.push("face");
    const label = { image: bulkMeta?.needsFace ? "a target scene photo" : "a photo", video: "a video", face: "a reference face photo" };
    for (const k of needed) if (!bulkFiles[k]) return toast(`${bulkMeta.title} needs ${label[k]}. Attach it first.`, "error");

    setBulkBusy(true);
    try {
      const inputs: { image?: string; video?: string; face?: string } = {};
      for (const k of needed) inputs[k] = (await api.uploadInput(bulkFiles[k] as File)).url;
      const d = await api.addBatch(bulkTask, prompts, inputs);
      setBulkOpen(false);
      setBulkText("");
      setBulkFiles({ image: null, video: null, face: null });
      toast(`Added ${d.added_count} job${d.added_count === 1 ? "" : "s"} to the queue`, "success");
      refreshQueue();
    } catch (e) {
      toast("Bulk add failed: " + (e as Error).message, "error");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Reveal>
        <div className="relative h-40 rounded-xl overflow-hidden border border-line">
          <BannerArt />
          <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/85 to-neutral-950/20" />
          <div className="relative h-full flex flex-col justify-center px-6 sm:px-10 text-white">
            <h2 className="text-[26px]">Automation Queue</h2>
            <p className="text-[14px] text-white/75 max-w-lg">Monitor queued jobs, add prompts in bulk, and run scheduled slots on demand.</p>
          </div>
        </div>
      </Reveal>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <KpiCard label="Total Jobs" value={queue.length} icon={ListChecks} tone="neutral" />
        <KpiCard label="Pending" value={pending} icon={Clock} tone="secondary" delay={0.05} />
        <KpiCard label="Posted" value={done} icon={CheckCircle2} tone="success" delay={0.1} />
        <KpiCard label="Failed" value={failed} icon={AlertTriangle} tone="danger" delay={0.15} />
      </div>

      <Reveal>
        <div className="card !p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-line">
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" onClick={() => setBulkOpen(true)}><Plus className="ic" /><span>Bulk Prompts</span></button>
              <button className="btn btn-secondary" onClick={() => navigate("/automations")}><Repeat className="ic" /><span>Daily Automations</span></button>
              <button className="btn btn-secondary" onClick={run} disabled={running}>
                {running ? <Spinner /> : <Play className="ic" />}<span>{running ? "Executing" : "Run Next Job"}</span>
              </button>
            </div>
            <button className="btn btn-ghost" onClick={refreshQueue}><RefreshCw className="ic-sm w-4 h-4" /><span>Refresh</span></button>
          </div>

          {queue.length === 0 ? (
            <EmptyState
              image="empty-queue.svg"
              title="The queue is empty"
              text="Add prompts in bulk or schedule a post from the Studio."
              action={<button className="btn btn-primary btn-sm" onClick={() => setBulkOpen(true)}><ListPlus className="ic-sm w-4 h-4" /><span>Add Prompts</span></button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] max-md:block">
                <thead className="max-md:hidden text-[11px] uppercase tracking-wider text-dim bg-surface-2/60">
                  <tr>
                    {["#", "Status", "Pipeline", "Prompt", "Scheduled", "Actions"].map((h) => (
                      <th key={h} className="px-5 py-3 font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line max-md:block">
                  {queue.map((j, i) => (
                    <tr key={j.id} className="hover:bg-surface-2/50 transition-colors max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:p-4">
                      <td className="px-5 py-4 font-bold text-dim max-md:p-0">#{i + 1}</td>
                      <td className="px-5 py-4 max-md:p-0"><span className={`badge ${BADGE[status(j)] ?? "badge-pending"}`}>{status(j)}</span></td>
                      <td className="px-5 py-4 max-md:p-0"><code>{j.task}</code></td>
                      <td className="px-5 py-4 max-w-[380px] max-md:p-0 max-md:basis-full max-md:max-w-none" title={j.prompt}>
                        {j.media_urls && j.media_urls.length > 1 && (
                          <span className="badge badge-primary mb-1 mr-2">Carousel · {j.media_urls.length} items</span>
                        )}
                        {j.automation_name && (
                          <span className="badge badge-primary mb-1 mr-2" title="Made by a daily automation"><Repeat className="w-3.5 h-3.5" />{j.automation_name}</span>
                        )}
                        {j.input_urls && (
                          <span className="badge badge-pending mb-1 mr-2" title="Starts from the attached file">
                            {[j.input_urls.image !== undefined && (j.input_urls.face !== undefined ? "Scene photo" : "Photo"), j.input_urls.face !== undefined && "Face photo", j.input_urls.video !== undefined && "Video"].filter(Boolean).join(" + ")} attached
                          </span>
                        )}
                        {j.account_name ? (
                          <span className="badge badge-primary mb-1 mr-2">@{j.account_name}</span>
                        ) : (
                          status(j) === "pending" && <span className="badge badge-pending mb-1 mr-2" title="Posts to whichever account is active when it runs">Active account</span>
                        )}
                        <span className="line-clamp-2">{j.prompt}</span>
                        {j.error && <span className="block text-[12px] text-danger mt-1 line-clamp-1">{j.error}</span>}
                      </td>
                      <td className="px-5 py-4 text-muted whitespace-nowrap max-md:p-0">{j.post_at || "Next daily slot"}</td>
                      <td className="px-5 py-4 max-md:p-0 max-md:ml-auto">
                        <div className="flex gap-2">
                          {j.media_url && (
                            <button className="btn btn-sm btn-ghost" onClick={() => view(j)}><Eye className="ic-sm w-4 h-4" /><span>View</span></button>
                          )}
                          <button className="btn btn-sm btn-ghost !text-danger hover:!bg-danger/10" onClick={() => remove(j)} aria-label="Delete job"><Trash2 className="ic-sm w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Reveal>

      <Modal
        open={!!ask}
        onClose={() => answer("cancel")}
        icon={CalendarClock}
        title="This job is scheduled for later"
        subtitle={ask ? `Scheduled for ${ask.job.post_at}` : undefined}
        size="sm"
      >
        {ask && (
          <>
            <p className="text-[14px] text-muted mb-3">
              Do you want to post it now, or move on to the next job and leave this one to go out at its time?
            </p>
            <div className="rounded-md border border-line bg-surface-2 p-3.5 mb-3">
              <strong className="block text-[14px]">{TASK_BY_KEY[ask.job.task as keyof typeof TASK_BY_KEY]?.title ?? ask.job.task}{ask.job.media_urls && ask.job.media_urls.length > 1 ? ` · carousel of ${ask.job.media_urls.length}` : ""}</strong>
              <p className="text-[13px] text-muted line-clamp-2">{ask.job.prompt}</p>
              <p className="text-[13px] text-dim mt-1">Posts to {ask.job.account_name ? `@${ask.job.account_name}` : "the active account"}</p>
            </div>
            <p className={`text-[13px] mb-5 ${health && !(config?.instagram.dry_run ?? true) ? "text-warning font-semibold" : "text-dim"}`}>
              {config?.instagram.dry_run ?? true ? "Dry run is on: nothing will really be posted." : "Live Publishing is on: this will really post to Instagram."}
            </p>
            <div className="flex flex-wrap justify-end gap-2.5">
              <button className="btn btn-ghost" onClick={() => answer("cancel")}>Cancel</button>
              <button className="btn btn-soft" onClick={() => answer("next")}><SkipForward className="ic" /><span>{ask.last ? "Skip" : "Next job"}</span></button>
              <button className="btn btn-primary" onClick={() => answer("now")}><Play className="ic" /><span>Post now</span></button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={bulkOpen} onClose={() => !bulkBusy && setBulkOpen(false)} icon={ListPlus} title="Add Prompts to Queue" subtitle="One prompt per line. Each becomes a queued job.">
        <div className="field">
          <label className="label" htmlFor="bt">Pipeline</label>
          <Select
            ariaLabel="Pipeline"
            value={bulkTask}
            onChange={setBulkTask}
            options={TASKS.map((t) => ({
              value: t.key,
              label: t.title,
              hint: t.needsImage || t.needsVideo || t.needsFace ? "Attach one file, used for every line" : t.key.endsWith("video") ? "Reels" : "Photos",
              leading: <t.icon className="w-4 h-4 text-primary-400 shrink-0" />,
            }))}
          />
        </div>

        {bulkNeedsFile && (
          <div className="field">
            <span className="label">{bulkMeta.needsFace ? "Photos" : bulkMeta.needsVideo ? "Video" : "Photo"} for every line</span>
            <div className={bulkMeta.needsFace ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
              {bulkMeta.needsImage && (
                <Dropzone title={bulkMeta.needsFace ? "Target body / scene photo" : "Input photo"} hint="Click or drop PNG, JPG, WEBP" icon={ImageIcon} accept="image/*" kind="image" file={bulkFiles.image} onFile={(f) => setBulkFiles((s) => ({ ...s, image: f }))} />
              )}
              {bulkMeta.needsFace && (
                <Dropzone title="Reference face" hint="Use only photos you have consent for" icon={User} accept="image/*" kind="image" file={bulkFiles.face} onFile={(f) => setBulkFiles((s) => ({ ...s, face: f }))} />
              )}
              {bulkMeta.needsVideo && (
                <Dropzone title="Input video clip" hint="MP4 or MOV, up to 90 seconds" icon={Video} accept="video/mp4,video/quicktime" kind="video" file={bulkFiles.video} onFile={(f) => setBulkFiles((s) => ({ ...s, video: f }))} />
              )}
            </div>
            <p className="hint mt-2">Every line uses the same file; only the prompt changes. {bulkMeta.needsVideo ? "Each prompt describes the new look." : bulkMeta.needsFace ? "Each prompt describes the new scene." : "Each prompt describes the motion or edit."}</p>
          </div>
        )}
        {bulkNeedsFile && (!bulkModel || bulkModel.startsWith("your-username/")) && (
          <p className="text-[13px] text-warning mb-4">No model is set for this pipeline yet, so these jobs would fail. Set a Hugging Face Space for it in the Studio or config.yaml first.</p>
        )}

        <div className="field">
          <label className="label" htmlFor="bp">Prompts</label>
          <textarea id="bp" className="input" rows={bulkNeedsFile ? 4 : 6} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={bulkNeedsFile ? "Slow cinematic zoom in\nGentle breeze moving the hair\nCamera slowly orbits the subject" : "A futuristic city in the clouds\nSunset over a neon highway\nCozy rainy bookstore aesthetic"} />
        </div>
        <div className="flex justify-end gap-3">
          <button className="btn btn-ghost" onClick={() => setBulkOpen(false)} disabled={bulkBusy}>Cancel</button>
          <button className="btn btn-primary" onClick={submitBulk} disabled={bulkBusy}>{bulkBusy ? <Spinner /> : <Plus className="ic" />}<span>{bulkBusy ? "Uploading…" : "Add to Queue"}</span></button>
        </div>
      </Modal>
    </div>
  );
}
