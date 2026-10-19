import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Eye, ListChecks, ListPlus, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../api/client";
import KpiCard from "../components/ui/KpiCard";
import Reveal from "../components/ui/Reveal";
import { BannerArt } from "../components/art/Scenes";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import Select from "../components/ui/Select";
import Spinner from "../components/ui/Spinner";
import { useApp } from "../context/AppContext";
import { useConfirm } from "../context/ConfirmContext";
import { useStudio } from "../context/StudioContext";
import { useToast } from "../context/ToastContext";
import type { QueueJob } from "../api/types";

const BADGE: Record<string, string> = { pending: "badge-pending", running: "badge-primary", done: "badge-done", failed: "badge-failed" };

export default function Queue() {
  const { queue, refreshQueue, refreshGallery } = useApp();
  const { loadMedia } = useStudio();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [running, setRunning] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTask, setBulkTask] = useState("text_to_video");
  const [bulkText, setBulkText] = useState("");

  const status = (j: QueueJob) => j.status ?? "pending";
  const pending = queue.filter((j) => status(j) === "pending").length;
  const done = queue.filter((j) => status(j) === "done").length;
  const failed = queue.filter((j) => status(j) === "failed").length;

  const run = async () => {
    setRunning(true);
    try {
      const d = await api.runQueue(1);
      toast(`Executed ${d.executed} pending job(s)`, "success");
      refreshQueue();
      refreshGallery();
    } catch (e) {
      toast("Execution error: " + (e as Error).message, "error");
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

  const view = (job: QueueJob) => {
    if (!job.media_url) return;
    loadMedia({
      media_url: job.media_url,
      media_path: job.media ?? job.media_url,
      filename: job.media_url.split("/").pop() ?? "",
      is_video: job.task.endsWith("video"),
      caption: job.caption ?? "",
      song: "",
      task: job.task,
      prompt: job.prompt,
    });
    navigate("/post");
  };

  const submitBulk = async () => {
    const prompts = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!prompts.length) return toast("Please enter at least one prompt line", "error");
    try {
      const d = await api.addBatch(bulkTask, prompts);
      setBulkOpen(false);
      setBulkText("");
      toast(`Added ${d.added_count} prompt jobs to queue`, "success");
      refreshQueue();
    } catch (e) {
      toast("Bulk add failed: " + (e as Error).message, "error");
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

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} icon={ListPlus} title="Add Prompts to Queue" subtitle="One prompt per line. Each becomes a queued job.">
        <div className="field">
          <label className="label" htmlFor="bt">Pipeline</label>
          <Select
            ariaLabel="Pipeline"
            value={bulkTask}
            onChange={setBulkTask}
            options={[
              { value: "text_to_video", label: "Text to Video", hint: "Reels" },
              { value: "text_to_image", label: "Text to Image", hint: "Photos" },
            ]}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="bp">Prompts</label>
          <textarea id="bp" className="input" rows={6} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"A futuristic city in the clouds\nSunset over a neon highway\nCozy rainy bookstore aesthetic"} />
        </div>
        <div className="flex justify-end gap-3">
          <button className="btn btn-ghost" onClick={() => setBulkOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={submitBulk}><Plus className="ic" /><span>Add to Queue</span></button>
        </div>
      </Modal>
    </div>
  );
}
