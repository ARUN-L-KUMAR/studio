import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dices, Zap } from "lucide-react";
import Select from "../ui/Select";
import Spinner from "../ui/Spinner";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";
import { TASKS, TASK_BY_KEY } from "../../data/tasks";
import type { TaskKey } from "../../api/types";

/** Write a prompt, pick a pipeline and a model, and start generating without leaving the dashboard. */
export default function QuickCreate() {
  const navigate = useNavigate();
  const { config, health } = useApp();
  const { generate, generating, progress, step, setTask, setPrompt } = useStudio();

  const [task, setLocalTask] = useState<TaskKey>("text_to_video");
  const [text, setText] = useState("");
  const [model, setModel] = useState<"default" | "custom">("default");
  const [custom, setCustom] = useState("");

  const meta = TASK_BY_KEY[task];
  const needsInput = meta.needsImage || meta.needsVideo || meta.needsFace;
  const configured = config?.tasks?.[task]?.space ?? "";
  const placeholderModel = !configured || configured.startsWith("your-username/");
  const noTokens = !!health && !health.keys.huggingface.configured;

  const submit = () => {
    if (needsInput) {                                  // these pipelines need a photo or video, which the Studio handles
      setTask(task);
      if (text.trim()) setPrompt(text.trim());
      navigate("/studio");
      return;
    }
    generate({ task, prompt: text, space: model === "custom" ? custom : "" });
  };

  const surprise = () => setText(meta.presets[Math.floor(Math.random() * meta.presets.length)]);

  return (
    <div id="quick-create" className="card h-full flex flex-col">
      <div className="card-head">
        <div>
          <h3 className="card-title"><Zap className="ic" />Quick Create</h3>
          <p className="card-sub">Describe it, choose how to make it, and go.</p>
        </div>
      </div>

      <label className="label" htmlFor="qc-prompt">Prompt</label>
      <textarea
        id="qc-prompt"
        className="input"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !generating) submit();
        }}
        placeholder="A stylish girl walking in a rainy neon city, cinematic slow motion"
      />
      <button type="button" className="self-start mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-400 hover:text-primary-300" onClick={surprise}>
        <Dices className="w-4 h-4" />Surprise me
      </button>

      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <div>
          <span className="label">Pipeline</span>
          <Select
            ariaLabel="Pipeline"
            value={task}
            onChange={(v) => {
              setLocalTask(v as TaskKey);
              setModel("default");
            }}
            options={TASKS.map((t) => ({
              value: t.key,
              label: t.title,
              hint: t.needsImage || t.needsVideo || t.needsFace ? "Needs a photo or video: opens the Studio" : t.desc,
              leading: <t.icon className="w-4 h-4 text-primary-400 shrink-0" />,
            }))}
          />
        </div>
        <div>
          <span className="label">Model</span>
          <Select
            ariaLabel="Model"
            value={model}
            onChange={(v) => setModel(v as "default" | "custom")}
            disabled={needsInput}
            options={[
              { value: "default", label: configured || "Not set", hint: placeholderModel ? "Placeholder: set a real Space in the Studio" : meta.tag },
              { value: "custom", label: "Another Space…", hint: "Use any Hugging Face Space ID" },
            ]}
          />
        </div>
      </div>

      {model === "custom" && !needsInput && (
        <input className="input mt-3" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="owner/space-name" aria-label="Hugging Face Space ID" spellCheck={false} />
      )}

      {generating && (
        <div className="mt-4" role="status" aria-live="polite">
          <div className="flex justify-between text-[13px] text-muted mb-1.5">
            <span className="truncate pr-3">{step || "Working"}</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(6, progress)}%` }} />
          </div>
        </div>
      )}

      {noTokens && !needsInput && (
        <p className="text-[13px] text-warning mt-4">
          No Hugging Face token yet. <button className="underline font-semibold" onClick={() => navigate("/settings")}>Add one in Settings</button> to generate.
        </p>
      )}

      <div className="mt-auto pt-5">
        <button className="btn btn-primary btn-lg w-full" onClick={submit} disabled={generating || (noTokens && !needsInput)}>
          {generating ? <Spinner /> : <Zap className="ic" />}
          <span>{generating ? "Generating…" : needsInput ? "Continue in Studio" : `Generate ${meta.title.replace("Text to ", "")}`}</span>
        </button>
        <p className="hint mt-2 text-center">Ctrl + Enter to start. Your result appears in Recent Creations.</p>
      </div>
    </div>
  );
}
