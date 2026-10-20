import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Cpu, Download, FolderOpen, Film, Gauge, Image as ImageIcon, Lightbulb, Send, Sparkles, User, Video, Zap } from "lucide-react";
import type { TaskKey } from "../api/types";
import { TASK_BY_KEY, TASKS } from "../data/tasks";
import { useStudio } from "../context/StudioContext";
import { useToast } from "../context/ToastContext";
import { useApp } from "../context/AppContext";
import TaskGrid from "../components/studio/TaskGrid";
import Dropzone from "../components/studio/Dropzone";
import Accordion from "../components/ui/Accordion";
import Segmented from "../components/ui/Segmented";
import { PhoneIdle } from "../components/art/Scenes";
import Spinner from "../components/ui/Spinner";

const ENHANCERS = [
  "cinematic lighting, ultra-detailed 8k, shot on 35mm lens, photorealistic masterpiece, shallow depth of field, vivid colors",
  "volumetric atmospheric lighting, hyper-realistic, elegant composition, award-winning cinematography, smooth motion",
  "golden hour sunbeams, octane render 3D detail, sharp focus, aesthetic composition, highly detailed texture",
];

export default function Studio() {
  const s = useStudio();
  const { health } = useApp();
  const activeIg = health?.keys.instagram.official_accounts?.find((a) => a.default);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const meta = TASK_BY_KEY[s.task];

  // Deep link from the dashboard: /studio?task=text_to_video
  useEffect(() => {
    const t = params.get("task") as TaskKey | null;
    if (t && TASKS.some((x) => x.key === t)) {
      s.setTask(t);
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Face Swap quality: edits the "resolution" value inside the Model Parameters JSON
  const resolution = (() => {
    try {
      return String(JSON.parse(s.paramsJson).resolution ?? "1536");
    } catch {
      return "1536";
    }
  })();
  const setResolution = (value: string) => {
    try {
      // the Space expects a number (1024 / 1536 / 2048), not text
      s.setParamsJson(JSON.stringify({ ...JSON.parse(s.paramsJson), resolution: Number(value) }, null, 2));
    } catch {
      toast("Fix the JSON in Model Parameters first", "error");
    }
  };

  const enhance = () => {
    const cur = s.prompt.trim();
    if (!cur) return toast("Please enter a basic idea first to enhance", "info");
    s.setPrompt(`${cur}, ${ENHANCERS[Math.floor(Math.random() * ENHANCERS.length)]}`);
    toast("Prompt enhanced with cinematic tags", "success");
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 items-start">
      {/* Controls */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title"><Zap className="ic" />Generation Engine</h3>
            <p className="card-sub">Select a pipeline and write a prompt.</p>
          </div>
        </div>

        <TaskGrid />

        <div className="field">
          <div className="flex items-center justify-between mb-1.5">
            <label className="label !mb-0" htmlFor="prompt"><Lightbulb className="ic" />Creative Prompt</label>
            <button className="btn btn-sm btn-soft" onClick={enhance} title="Add cinematic detail to the prompt">
              <Sparkles className="ic-sm w-4 h-4" /><span>Enhance</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-2.5">
            {meta.presets.map((p) => (
              <button
                key={p}
                title={p}
                onClick={() => s.setPrompt(p)}
                className="px-3 py-1 rounded-full text-[12px] bg-surface-2 border border-line text-muted hover:text-fg hover:border-primary-500/50 transition max-w-full truncate"
              >
                {p.length > 44 ? p.slice(0, 44) + "..." : p}
              </button>
            ))}
          </div>
          <textarea id="prompt" className="input" rows={4} value={s.prompt} onChange={(e) => s.setPrompt(e.target.value)} placeholder="Describe the scene you want to create" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 empty:hidden mb-4">
          <AnimatePresence>
            {meta.needsImage && (
              <Dropzone key="image" title={meta.needsFace ? "Target Body / Scene Photo" : "Input Photo"} hint="Click or drop PNG, JPG, WEBP" icon={ImageIcon} accept="image/*" kind="image" file={s.uploads.image} onFile={(f) => s.setUpload("image", f)} />
            )}
            {meta.needsFace && (
              <Dropzone key="face" title="Reference Face" hint="Use only photos you have consent for" icon={User} accept="image/*" kind="image" file={s.uploads.face} onFile={(f) => s.setUpload("face", f)} />
            )}
            {meta.needsVideo && (
              <Dropzone key="video" title="Input Video Clip" hint="MP4 or MOV, up to 90 seconds" icon={Video} accept="video/mp4,video/quicktime" kind="video" file={s.uploads.video} onFile={(f) => s.setUpload("video", f)} />
            )}
          </AnimatePresence>
        </div>

        <Accordion title="Space and Model Parameters" icon={Cpu}>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="space">Space ID</label>
              <input id="space" className="input" value={s.space} onChange={(e) => s.setSpace(e.target.value)} placeholder="Lightricks/LTX-Video-Distilled" />
            </div>
            <div className="field">
              <label className="label" htmlFor="apiName">API Endpoint</label>
              <input id="apiName" className="input" value={s.apiName} onChange={(e) => s.setApiName(e.target.value)} placeholder="/predict" />
            </div>
          </div>
          <div className="field !mb-0">
            <label className="label" htmlFor="params">Parameters (JSON)</label>
            <textarea id="params" className="input font-mono text-[12px]" rows={5} value={s.paramsJson} onChange={(e) => s.setParamsJson(e.target.value)} />
          </div>
        </Accordion>

        {s.task === "face_swap" && (
          <div className="field">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="label !mb-0"><Gauge className="ic" />Quality</span>
              <Segmented<string>
                value={resolution}
                onChange={setResolution}
                options={[
                  { value: "1024", label: <>Fast <span className="opacity-60 text-[11px]">1024</span></> },
                  { value: "1536", label: <>Best <span className="opacity-60 text-[11px]">1536</span></> },
                ]}
              />
            </div>
            <p className="hint">Fast finishes sooner. Best keeps more detail in the swapped face.</p>
          </div>
        )}

        <button className="btn btn-primary btn-lg btn-shine w-full" onClick={() => s.generate()} disabled={s.generating}>
          {s.generating ? <Spinner /> : <Zap className="ic" />}
          <span>{s.generating ? "Generating" : "Generate Media"}</span>
        </button>
        {activeIg && (
          <p className="hint flex items-center justify-center gap-1.5 mt-2.5">
            <FolderOpen className="w-3.5 h-3.5" />Saved to the folder of <strong className="text-fg font-semibold">@{activeIg.username ?? activeIg.id}</strong>
          </p>
        )}

        {s.showProgress && !s.generating && s.step.startsWith("Failed") ? (
          <div className="mt-4 p-4 rounded-md bg-danger/10 border border-danger/40">
            <strong className="block text-[13px] text-danger mb-1">Generation failed</strong>
            <p className="text-[13px] text-fg/90 break-words">{s.step.replace(/^Failed:\s*/, "")}</p>
            <p className="hint mt-2">
              {s.step.includes("Can't reach")
                ? "This is a connection problem on your computer, not an account problem. Once you are back online, press Generate Media again."
                : "Free Hugging Face Spaces can be busy or slow. Press Generate Media to try again, or add another Hugging Face account in Settings so the app can switch."}
            </p>
          </div>
        ) : (
          s.showProgress && (
            <div className="mt-4 p-4 rounded-md bg-surface-2 border border-line">
              <div className="flex items-center justify-between gap-3 mb-2.5 text-[13px]">
                <span className="font-semibold truncate">{s.step}</span>
                <span className="font-mono text-secondary-400">{s.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out bg-brand"
                  style={{
                    width: `${s.progress}%`,
                    backgroundImage: s.generating
                      ? "repeating-linear-gradient(-45deg, rgb(0 0 0 / .14) 0 8px, transparent 8px 16px), linear-gradient(rgb(var(--primary-500)), rgb(var(--primary-500)))"
                      : undefined,
                    backgroundSize: "32px 32px, 100% 100%",
                    animation: s.generating ? "stripes 1s linear infinite" : undefined,
                  }}
                />
              </div>
            </div>
          )
        )}
      </div>

      {/* Result */}
      <div className="card xl:sticky xl:top-20">
        <div className="card-head">
          <div>
            <h3 className="card-title"><Film className="ic" />Result</h3>
            <p className="card-sub">Your latest generation appears here.</p>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[380px] aspect-[9/13] rounded-2xl overflow-hidden border border-line bg-surface-2">
          {s.media ? (
            s.media.is_video ? (
              <video key={s.media.media_url} src={s.media.media_url} controls loop playsInline autoPlay muted className="absolute inset-0 w-full h-full object-contain bg-black" />
            ) : (
              <img key={s.media.media_url} src={s.media.media_url} alt="" className="absolute inset-0 w-full h-full object-contain bg-black" />
            )
          ) : (
            <>
              <PhoneIdle />
              <div className="absolute inset-x-0 bottom-0 top-[48%] flex flex-col items-center justify-start gap-2 text-center px-8 text-white">
                <strong className="text-[15px]">Nothing generated yet</strong>
                <span className="text-[12px] text-white/65">Pick a pipeline, write a prompt and press Generate Media.</span>
              </div>
            </>
          )}
          {s.generating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8 bg-neutral-950/75 backdrop-blur-sm text-white">
              <Spinner className="w-8 h-8" />
              <strong className="text-[14px]">{s.step || "Working"}</strong>
              <span className="font-mono text-[12px] text-primary-300">{s.progress}%</span>
            </div>
          )}
        </div>

        {s.media && (
          <div className="mt-5">
            <p className="text-[12px] text-dim truncate mb-3" title={s.media.prompt}>{s.media.filename || s.media.prompt}</p>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn btn-primary" onClick={() => navigate("/post")}>
                <Send className="ic" /><span>Preview and Post</span>
              </button>
              <a className="btn btn-secondary" href={s.media.media_url} download={s.media.filename || true}>
                <Download className="ic" /><span>Download</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
