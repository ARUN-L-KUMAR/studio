import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, ListOrdered, Plus, Repeat, Sparkles, User, Video, Wand2, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import Dropzone from "../studio/Dropzone";
import Modal from "../ui/Modal";
import Segmented from "../ui/Segmented";
import Select from "../ui/Select";
import Spinner from "../ui/Spinner";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/ToastContext";
import { TASKS, TASK_BY_KEY } from "../../data/tasks";
import type { Automation, AutomationFolder, TaskKey } from "../../api/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Role = "image" | "face" | "video";
type RoleMode = "file" | "folder";

/** What each input of a pipeline is called, and how the finished run is described. */
function roleInfo(pipeline: TaskKey, role: Role) {
  if (role === "face") return { title: "Reference face (the face to swap in)", short: "reference face photo", kind: "image" as const, icon: User };
  if (role === "video") return { title: "Video to restyle", short: "video", kind: "video" as const, icon: Video };
  if (pipeline === "face_swap") return { title: "Target body / scene photo", short: "target photo", kind: "image" as const, icon: ImageIcon };
  return { title: pipeline === "image_to_video" ? "Photo to animate" : "Photo to edit", short: "photo", kind: "image" as const, icon: ImageIcon };
}
const RESULT: Partial<Record<TaskKey, string>> = {
  image_to_video: "animates it into a new video",
  image_to_image: "edits it into a new image",
  video_to_video: "restyles it into a new video",
  face_swap: "swaps the reference face onto the target, creating a new image",
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** The automation being edited, or null to make a new one */
  editing: Automation | null;
  onSaved: () => void;
}

/** Create or edit a daily automation. */
export default function AutomationModal({ open, onClose, editing, onSaved }: Props) {
  const toast = useToast();
  const { health, config } = useApp();
  const accounts = health?.keys.instagram.official_accounts ?? [];

  const [name, setName] = useState("");
  const [source, setSource] = useState<"generate" | "own">("generate");
  const [loop, setLoop] = useState(false);
  const [pipeline, setPipeline] = useState<TaskKey>("text_to_video");
  const [account, setAccount] = useState("");
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [days, setDays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [mode, setMode] = useState<"list" | "ai">("list");
  const [promptsText, setPromptsText] = useState("");
  const [theme, setTheme] = useState("");
  // the post-my-own-files folder
  const [ownFolder, setOwnFolder] = useState("");
  // for the pipelines that start from files: each input is an uploaded file or a rotating Vault folder
  const [roleMode, setRoleMode] = useState<Record<string, RoleMode>>({});
  const [roleFolder, setRoleFolder] = useState<Record<string, string>>({});
  const [roleFile, setRoleFile] = useState<Record<string, File | null>>({});
  const [folders, setFolders] = useState<AutomationFolder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // start from the automation being edited (or from defaults) each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setError("");
    setRoleFile({});
    setName(editing?.name ?? "");
    setSource(editing?.source ?? "generate");
    setLoop(editing?.loop ?? false);
    setPipeline(editing && editing.source !== "own" ? (editing.pipeline as TaskKey) : "text_to_video");
    setAccount(editing?.account ?? "");
    setTimes(editing?.times.length ? editing.times : ["09:00"]);
    setDays(editing?.days ?? []);
    setStartDate(editing?.start_date ?? "");
    setEndDate(editing?.end_date ?? "");
    setMode(editing?.prompt_mode ?? "list");
    setPromptsText((editing?.prompts ?? []).join("\n"));
    setTheme(editing?.theme ?? "");
    setOwnFolder(editing?.source === "own" ? editing.input_folder : "");
    const m: Record<string, RoleMode> = {}, f: Record<string, string> = {};
    for (const [role, v] of Object.entries(editing?.inputs ?? {})) {
      m[role] = v.mode;
      f[role] = v.folder;
    }
    setRoleMode(m);
    setRoleFolder(f);
    api.automationFolders().then((r) => setFolders(r.folders)).catch(() => setFolders([]));
  }, [open, editing]);

  const own = source === "own";
  const meta = TASK_BY_KEY[pipeline];
  const roles: Role[] = own ? [] : ([meta.needsImage && "image", meta.needsFace && "face", meta.needsVideo && "video"].filter(Boolean) as Role[]);
  const modeOf = (r: Role): RoleMode => roleMode[r] ?? (r === "face" ? "file" : "folder");
  const model = config?.tasks?.[pipeline]?.space ?? "";
  const noModel = !own && (!model || model.startsWith("your-username/"));
  const aiReady = !health || health.caption_ai.providers.some((p) => p.configured);
  const had = (r: Role) => (editing && editing.source !== "own" && editing.pipeline === pipeline ? editing.inputs?.[r] : undefined);

  const countOf = (f: AutomationFolder, kind: "image" | "video" | "any") => (kind === "video" ? f.videos : kind === "image" ? f.images : f.images + f.videos);
  const optionsFor = (kind: "image" | "video" | "any") => {
    const one = kind === "video" ? "video" : kind === "any" ? "photo or video" : "photo";
    const many = kind === "video" ? "videos" : kind === "any" ? "photos or videos" : "photos";
    return folders.map((f) => ({
      value: f.name,
      label: f.account ? `${f.name} (@${f.account})` : f.name,
      hint: countOf(f, kind) ? `${countOf(f, kind)} ${countOf(f, kind) === 1 ? one : many}${f.locked ? " · PIN-protected" : ""}` : `No ${many} here`,
      disabled: countOf(f, kind) === 0,
    }));
  };
  const ownOptions = useMemo(() => optionsFor("any"), [folders]); // eslint-disable-line react-hooks/exhaustive-deps

  // a folder with nothing usable cannot stay selected: pick the first one that has files
  useEffect(() => {
    if (!open || !folders.length) return;
    const first = (kind: "image" | "video" | "any") => folders.find((f) => countOf(f, kind) > 0)?.name ?? "";
    if (own) {
      const cur = folders.find((f) => f.name === ownFolder);
      if (!cur || countOf(cur, "any") === 0) setOwnFolder(first("any"));
    }
    setRoleFolder((cur) => {
      const next = { ...cur };
      let changed = false;
      for (const r of roles) {
        if (modeOf(r) !== "folder") continue;
        const k = roleInfo(pipeline, r).kind;
        const f = folders.find((x) => x.name === next[r]);
        if (!f || countOf(f, k) === 0) {
          next[r] = first(k);
          changed = true;
        }
      }
      return changed ? next : cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folders, pipeline, own, roleMode]);

  const setTimeAt = (i: number, v: string) => setTimes((t) => t.map((x, k) => (k === i ? v : x)));
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const who = account ? `@${accounts.find((a) => a.id === account)?.username ?? account}` : "the active account";
  const summary = useMemo(() => {
    const when = `${days.length === 0 || days.length === 7 ? "Every day" : days.map((d) => DAYS[d]).join(", ")} at ${times.filter(Boolean).join(" and ") || "…"}`;
    if (own) {
      return `${when}: posts the next photo or video from ${ownFolder ? `“${ownFolder}”` : "the chosen folder"} exactly as it is (nothing is generated), with a caption the AI writes from the picture, to ${who}. ${loop ? "When all are posted it starts over." : "Each file is posted once, then it waits for new ones."}`;
    }
    const idea = mode === "list" ? "the next prompt from your list" : "a new idea the AI writes from your theme";
    if (!roles.length) return `${when}: uses ${idea} to generate a new ${pipeline.endsWith("video") ? "video" : "image"} with ${meta.title}, writes a caption, and posts it to ${who}.`;
    const part = (r: Role) => {
      const i = roleInfo(pipeline, r);
      return modeOf(r) === "folder" ? `the next ${i.short} from “${roleFolder[r] || "the chosen folder"}”` : `your uploaded ${i.short}`;
    };
    const inputs = pipeline === "face_swap" ? `uses ${part("image")} as the target and ${part("face")} as the face to swap in` : `takes ${part(roles[0])}`;
    return `${when}: ${inputs}; ${RESULT[pipeline]}, using ${idea}; writes a caption, and posts the new result to ${who}.`;
  }, [own, loop, days, times, ownFolder, mode, roles, roleFolder, roleMode, pipeline, meta, who]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setError("");
    const prompts = promptsText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!name.trim()) return setError("Give the automation a name.");
    if (times.some((t) => !t)) return setError("Fill in every time, or remove the empty one.");
    if (own && !ownFolder) return setError("Choose a folder with photos or videos to post.");
    if (!own && mode === "list" && !prompts.length) return setError("Write at least one prompt.");
    if (!own && mode === "ai" && theme.trim().length < 3) return setError("Describe a theme for the AI, for example “cozy rainy-day aesthetics”.");
    for (const r of roles) {
      const i = roleInfo(pipeline, r);
      if (modeOf(r) === "folder" && !roleFolder[r]) return setError(`Choose a Vault folder for the ${i.short}.`);
      if (modeOf(r) === "file" && !roleFile[r] && !(had(r)?.mode === "file" && had(r)?.file_ok)) return setError(`Upload the ${i.short}, or choose a Vault folder for it.`);
    }

    setBusy(true);
    try {
      const inputs: Record<string, { mode: RoleMode; folder: string; file: string }> = {};
      for (const r of roles) {
        if (modeOf(r) === "folder") inputs[r] = { mode: "folder", folder: roleFolder[r], file: "" };
        else inputs[r] = { mode: "file", folder: "", file: roleFile[r] ? (await api.uploadInput(roleFile[r] as File)).url : "" };
      }
      const body = {
        name: name.trim(), enabled: editing?.enabled ?? true, pipeline, account, times, days,
        start_date: startDate || null, end_date: endDate || null,
        source, loop: own && loop,
        prompt_mode: mode, prompts: !own && mode === "list" ? prompts : [], theme: !own && mode === "ai" ? theme.trim() : "",
        input_folder: own ? ownFolder : "", inputs,
      };
      if (editing) await api.updateAutomation(editing.id, body);
      else await api.createAutomation(body);
      toast(editing ? "Automation saved. Changes apply from now on." : "Automation created.", "success");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} icon={Repeat} title={editing ? "Edit automation" : "New automation"} subtitle="Post on a schedule, without lifting a finger.">
      <div className="field">
        <label className="label" htmlFor="au-name">Name</label>
        <input id="au-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning post" maxLength={60} autoFocus />
      </div>

      <div className="field">
        <span className="label">What should it do each time?</span>
        <Segmented<"generate" | "own">
          value={source}
          onChange={setSource}
          options={[
            { value: "generate", label: <><Wand2 className="ic-sm w-4 h-4" />Generate new with AI</> },
            { value: "own", label: <><ImageIcon className="ic-sm w-4 h-4" />Post my own files</> },
          ]}
        />
        <p className="hint mt-1.5">
          {own ? "Posts photos or videos you already have, exactly as they are. Nothing is generated." : "Makes something NEW with an AI pipeline each time, then posts it."}
        </p>
      </div>

      <div className="form-grid">
        {!own && (
          <div className="field">
            <span className="label">AI pipeline</span>
            <Select
              ariaLabel="AI pipeline"
              value={pipeline}
              onChange={(v) => setPipeline(v as TaskKey)}
              options={TASKS.map((t) => ({
                value: t.key, label: t.title, leading: <t.icon className="w-4 h-4 text-primary-400 shrink-0" />,
                hint: t.needsImage || t.needsVideo || t.needsFace ? "Starts from photos or videos you provide" : t.key.endsWith("video") ? "Reels" : "Photos",
              }))}
            />
          </div>
        )}
        <div className="field">
          <span className="label">Post to</span>
          <Select
            ariaLabel="Account"
            value={account}
            onChange={setAccount}
            options={[
              { value: "", label: "Active account", hint: "Whichever is active when it posts" },
              ...accounts.map((a) => ({ value: a.id, label: `@${a.username ?? a.id}`, hint: a.default ? "Currently active" : undefined })),
            ]}
          />
        </div>
      </div>

      {noModel && (
        <p className="text-[13px] text-warning mb-4">No model is set for this pipeline yet, so its posts would fail. Set a Hugging Face Space for it in the Studio or config.yaml first.</p>
      )}

      <div className="field">
        <span className="label">Time of day</span>
        <div className="flex flex-wrap gap-2.5">
          {times.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input type="time" className="input !w-[132px]" value={t} onChange={(e) => setTimeAt(i, e.target.value)} aria-label={`Time ${i + 1}`} />
              {times.length > 1 && (
                <button type="button" className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-surface-2" onClick={() => setTimes((x) => x.filter((_, k) => k !== i))} aria-label={`Remove time ${i + 1}`}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {times.length < 8 && (
            <button type="button" className="btn btn-sm btn-soft" onClick={() => setTimes((x) => [...x, "19:00"])}><Plus className="ic-sm w-4 h-4" /><span>Add a time</span></button>
          )}
        </div>
        <p className="hint mt-1.5">Each time makes one post. The server must be running then (a missed time is still made if it is less than 2 hours late).</p>
      </div>

      <div className="field">
        <span className="label">Days</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Days of the week">
          <button type="button" aria-pressed={days.length === 0} onClick={() => setDays([])}
            className={clsx("px-3.5 py-1.5 rounded-full text-[13.5px] font-semibold border transition", days.length === 0 ? "bg-primary-600/20 border-primary-500 text-primary-300" : "border-line text-muted hover:text-fg")}>
            Every day
          </button>
          {DAYS.map((d, i) => (
            <button key={d} type="button" aria-pressed={days.includes(i)} onClick={() => toggleDay(i)}
              className={clsx("px-3 py-1.5 rounded-full text-[13.5px] font-semibold border transition", days.includes(i) ? "bg-primary-600/20 border-primary-500 text-primary-300" : "border-line text-muted hover:text-fg")}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="au-start">Start date (optional)</label>
          <input id="au-start" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="au-end">End date (optional)</label>
          <input id="au-end" type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      {!own && (
        <div className="field">
          <span className="label">{roles.length ? "Prompt for each run" : "What to make each time"}</span>
          <Segmented<"list" | "ai">
            value={mode}
            onChange={setMode}
            options={[
              { value: "list", label: <><ListOrdered className="ic-sm w-4 h-4" />Rotating list</> },
              { value: "ai", label: <><Sparkles className="ic-sm w-4 h-4" />AI writes ideas</> },
            ]}
          />
          {mode === "list" ? (
            <>
              <textarea className="input mt-3" rows={5} value={promptsText} onChange={(e) => setPromptsText(e.target.value)} aria-label="Prompts"
                placeholder={roles.length ? "Slow cinematic zoom in\nGentle breeze moving the hair\nCamera slowly orbits the subject" : "A futuristic city in the clouds\nSunset over a neon highway\nCozy rainy bookstore aesthetic"} />
              <p className="hint mt-1.5">One prompt per line. It uses them in order and starts over after the last one.</p>
            </>
          ) : (
            <>
              <input className="input mt-3" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. cozy rainy-day aesthetics" maxLength={200} aria-label="Theme" />
              <p className="hint mt-1.5">The caption AI writes a new idea each time from this theme, and avoids repeating recent ones.</p>
              {!aiReady && <p className="text-[13px] text-warning mt-1.5">No caption AI key is set, so ideas can't be written. Add one in Settings.</p>}
            </>
          )}
        </div>
      )}

      {/* Post my own files: one Vault folder */}
      {own && (
        <div className="field">
          <span className="label">Photos and videos to post, from</span>
          <Select ariaLabel="Vault folder" value={ownFolder} onChange={setOwnFolder} options={ownOptions} placeholder="Choose a Vault folder" />
          <p className="hint mt-1.5">Posts the files in this folder one after another, in name order. Each is posted once, and files already labelled Posted in the Vault are skipped. Tip: make a folder in the Vault (New folder) and use its Upload button to add the files.</p>
          <label className="flex items-center gap-2.5 mt-3 text-[14px] cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 accent-[rgb(var(--primary-500))]" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            When every file has been posted, start over from the first
          </label>
        </div>
      )}

      {/* Generate from files: every input is an uploaded file or a rotating Vault folder */}
      {roles.map((r) => {
        const info = roleInfo(pipeline, r);
        const m = modeOf(r);
        const was = had(r);
        return (
          <div key={r} className="field rounded-md border border-line bg-surface-2/40 p-4" role="group" aria-label={info.title}>
            <span className="label !mb-2"><info.icon className="w-4 h-4" />{info.title}</span>
            <Segmented<RoleMode>
              value={m}
              onChange={(v) => setRoleMode((cur) => ({ ...cur, [r]: v }))}
              options={[
                { value: "file", label: <>Upload one file</> },
                { value: "folder", label: <>From a Vault folder</> },
              ]}
            />
            <div className="mt-3">
              {m === "file" ? (
                <>
                  <Dropzone
                    title={`Upload the ${info.short}`}
                    hint={info.kind === "video" ? "MP4 or MOV" : r === "face" ? "Use only photos you have consent for" : "Click or drop PNG, JPG, WEBP"}
                    icon={info.icon} accept={info.kind === "video" ? "video/mp4,video/quicktime" : "image/*"} kind={info.kind}
                    file={roleFile[r] ?? null} onFile={(f) => setRoleFile((cur) => ({ ...cur, [r]: f }))}
                  />
                  <p className="hint mt-1.5">
                    The same file is used every time.
                    {was?.mode === "file" && was.file_ok && !roleFile[r] ? ` Currently using ${was.file_name}. Drop a new one to replace it.` : ""}
                  </p>
                </>
              ) : (
                <>
                  <Select ariaLabel={`${info.title}: Vault folder`} value={roleFolder[r] ?? ""} onChange={(v) => setRoleFolder((cur) => ({ ...cur, [r]: v }))} options={optionsFor(info.kind)} placeholder="Choose a Vault folder" />
                  <p className="hint mt-1.5">Uses the {info.kind === "video" ? "videos" : "photos"} in this folder one after another, in name order, and starts over at the end. Tip: make a folder in the Vault (New folder) and use its Upload button to add the files.</p>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="rounded-md border border-primary-500/30 bg-primary-600/10 px-4 py-3 mb-4 text-[14px]" aria-label="What will happen">
        <strong className="block text-[13px] uppercase tracking-wide text-primary-300 mb-1">What will happen</strong>
        {summary}
      </div>

      {error && <p className="text-[13px] text-danger mb-3" role="alert">{error}</p>}
      <div className="flex justify-end gap-3 mt-2">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? <Spinner /> : <Repeat className="ic" />}
          <span>{busy ? "Saving…" : editing ? "Save changes" : "Create automation"}</span>
        </button>
      </div>
    </Modal>
  );
}
