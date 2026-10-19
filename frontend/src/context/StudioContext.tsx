import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { GalleryFile, GenerationResult, InstaTrack, TaskKey } from "../api/types";
import { useApp } from "./AppContext";
import { useToast } from "./ToastContext";

export interface Uploads {
  image: File | null;
  video: File | null;
  face: File | null;
}

export type AudioMode = "none" | "instagram" | "mp3";

/** Everything chosen on the Post page besides the caption. */
export interface PostOptions {
  files: GalleryFile[];                  // selected vault items, in posting order
  format: "carousel" | "slideshow";      // used when 2+ items are selected
  secondsPer: number;                    // slideshow: seconds each picture is shown
  audio: AudioMode;
  track: InstaTrack | null;              // chosen Instagram song
  account: string;                       // Instagram API account id for this post ("" = the default account)
  trackSource: "auto" | "manual";         // "auto" = matched from the AI's suggestion, "manual" = chosen by the user
  clipStart: number;                     // seconds into the song where the clip starts
  clipLen: number;                       // clip length in seconds
  mp3: string;                           // chosen file in the music folder
}

const DEFAULT_POST_OPTS: PostOptions = { files: [], format: "carousel", secondsPer: 3, audio: "none", track: null, account: "", trackSource: "manual", clipStart: 0, clipLen: 30, mp3: "" };

interface StudioState {
  postOpts: PostOptions;
  setPostOpts: (patch: Partial<PostOptions>) => void;
  /** Change what the preview shows without touching the caption */
  showMedia: (r: GenerationResult) => void;
  task: TaskKey;
  setTask: (t: TaskKey) => void;
  prompt: string;
  setPrompt: (p: string) => void;
  uploads: Uploads;
  setUpload: (k: keyof Uploads, f: File | null) => void;
  space: string;
  setSpace: (s: string) => void;
  apiName: string;
  setApiName: (s: string) => void;
  paramsJson: string;
  setParamsJson: (s: string) => void;

  generating: boolean;
  progress: number;
  step: string;
  showProgress: boolean;
  generate: () => Promise<void>;

  media: GenerationResult | null;
  caption: string;
  setCaption: (c: string) => void;
  song: string;
  setSong: (s: string) => void;
  loadMedia: (r: GenerationResult) => void;
}

const Ctx = createContext<StudioState>(null as unknown as StudioState);

export function StudioProvider({ children }: { children: ReactNode }) {
  const { config, refreshGallery } = useApp();
  const toast = useToast();

  const [task, setTaskState] = useState<TaskKey>("text_to_video");
  const [prompt, setPrompt] = useState(
    "A stylish girl walking in a rainy neon cyberpunk city, cinematic slow motion, reflections",
  );
  const [uploads, setUploads] = useState<Uploads>({ image: null, video: null, face: null });
  const [space, setSpace] = useState("");
  const [apiName, setApiName] = useState("");
  const [paramsJson, setParamsJson] = useState("");

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [showProgress, setShowProgress] = useState(false);

  const [postOpts, setPostOptsState] = useState<PostOptions>(DEFAULT_POST_OPTS);
  const setPostOpts = useCallback((patch: Partial<PostOptions>) => setPostOptsState((o) => ({ ...o, ...patch })), []);
  const [media, setMedia] = useState<GenerationResult | null>(null);
  const [caption, setCaption] = useState("");
  const [song, setSong] = useState("");

  const timer = useRef<number | null>(null);

  // Load Space / endpoint / params whenever the task or config changes
  useEffect(() => {
    const t = config?.tasks?.[task];
    if (!t) return;
    setSpace(t.space ?? "");
    setApiName(t.api_name ?? "");
    setParamsJson(JSON.stringify(t.params ?? {}, null, 2));
  }, [task, config]);

  const setTask = useCallback((t: TaskKey) => setTaskState(t), []);
  const setUpload = useCallback((k: keyof Uploads, f: File | null) => setUploads((u) => ({ ...u, [k]: f })), []);

  const showMedia = useCallback((r: GenerationResult) => setMedia(r), []);

  const loadMedia = useCallback((r: GenerationResult) => {
    setMedia(r);
    setPostOptsState((o) => ({ ...o, files: [] }));   // a new single item replaces any earlier multi-selection
    setCaption(r.caption ?? "");
    setSong(r.song ?? "");
  }, []);

  const stopPoll = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };

  const startPoll = useCallback(() => {
    stopPoll();
    setGenerating(true);
    setShowProgress(true);
    timer.current = window.setInterval(async () => {
      try {
        const d = await api.generationStatus();
        if (d.is_generating) {
          setProgress(d.progress || 50);
          setStep(d.current_step || "Processing");
          return;
        }
        stopPoll();
        setGenerating(false);
        setProgress(100);
        if (d.error) {
          setStep("Failed: " + d.error);
          toast("Generation failed: " + d.error, "error");
        } else if (d.result) {
          setStep("Generation complete");
          toast("Media generated successfully", "success");
          loadMedia(d.result);
          refreshGallery();
        }
      } catch {
        /* transient polling error: keep trying */
      }
    }, 2500);
  }, [loadMedia, refreshGallery, toast]);

  // Resume a job already running on the server, and clean up on unmount
  useEffect(() => {
    api
      .generationStatus()
      .then((d) => {
        if (d.is_generating) {
          setProgress(d.progress);
          setStep(d.current_step);
          startPoll();
        }
      })
      .catch(() => {});
    return stopPoll;
  }, [startPoll]);

  const generate = useCallback(async () => {
    const text = prompt.trim();
    if (!text) return toast("Please enter a prompt or idea", "error");
    if (["image_to_video", "image_to_image"].includes(task) && !uploads.image)
      return toast("Please upload an input image for this task", "error");
    if (task === "video_to_video" && !uploads.video) return toast("Please upload an input video for this task", "error");
    if (task === "face_swap" && (!uploads.face || !uploads.image))
      return toast("Face Swap requires both a reference face and a target scene photo", "error");

    const form = new FormData();
    form.append("task", task);
    form.append("prompt", text);
    if (uploads.image) form.append("image", uploads.image);
    if (uploads.video) form.append("video", uploads.video);
    if (uploads.face) form.append("face", uploads.face);
    if (space.trim()) form.append("space_id", space.trim());
    if (apiName.trim()) form.append("api_name", apiName.trim());
    if (paramsJson.trim()) form.append("params_json", paramsJson.trim());

    setGenerating(true);
    setShowProgress(true);
    setProgress(10);
    setStep("Connecting to Hugging Face Space pipeline");
    try {
      await api.startGeneration(form);
      startPoll();
    } catch (e) {
      setGenerating(false);
      setShowProgress(false);
      toast("Generation error: " + (e as Error).message, "error");
    }
  }, [prompt, task, uploads, space, apiName, paramsJson, startPoll, toast]);

  return (
    <Ctx.Provider
      value={{
        task, setTask, prompt, setPrompt, uploads, setUpload,
        space, setSpace, apiName, setApiName, paramsJson, setParamsJson,
        generating, progress, step, showProgress, generate,
        media, caption, setCaption, song, setSong, loadMedia, showMedia,
        postOpts, setPostOpts,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useStudio = () => useContext(Ctx);
