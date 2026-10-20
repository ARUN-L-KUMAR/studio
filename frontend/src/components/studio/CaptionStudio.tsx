import { useEffect, useState } from "react";
import { CalendarClock, PenLine, Send, Sparkles } from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import { TONES } from "../../data/tasks";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";
import { useToast } from "../../context/ToastContext";
import CaptionAiPicker from "../ui/CaptionAiPicker";
import SuggestedSound from "./SuggestedSound";
import Spinner from "../ui/Spinner";

export default function CaptionStudio({ onSchedule, footer }: { onSchedule: () => void; footer?: React.ReactNode }) {
  const { media, prompt, caption, setCaption, setSong, postOpts } = useStudio();
  const { health, refreshGallery } = useApp();
  const toast = useToast();
  const [tone, setTone] = useState(TONES[0].value);
  const [writing, setWriting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Caption AI for this post. Starts at the default from Settings and can be changed here.
  const ai = health?.caption_ai;
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  useEffect(() => {
    if (!ai || provider) return;
    const start = ai.providers.find((p) => p.id === ai.provider && p.configured) ?? ai.providers.find((p) => p.configured);
    if (start) {
      setProvider(start.id);
      setModel(ai.models[start.id] ?? start.default_model);
    }
  }, [ai, provider]);

  const tags = (caption.match(/#[a-zA-Z0-9_]+/g) ?? []).length;

  const rewrite = async (nextTone?: string) => {
    const base = media?.prompt ?? prompt;
    if (!media && !base.trim()) return toast("Choose media or enter a prompt first", "info");
    setWriting(true);
    try {
      const d = await api.generateCaption({
        prompt: base,
        media_kind: media && !media.is_video ? "image" : "video",
        tone: nextTone ?? tone,
        media_url: postOpts.files[0]?.url ?? media?.media_url,
        // a carousel / slideshow: let the AI see the whole set (the server uses up to 4)
        media_urls: postOpts.files.length > 1 ? postOpts.files.map((f) => f.url) : undefined,
        provider,
        model,
      });
      setCaption(d.caption);
      if (d.song) setSong(d.song);
      const label = ai?.providers.find((p) => p.id === d.provider)?.label ?? d.provider;
      toast(
        d.provider === provider ? `Caption written by ${label}` : `Your chosen AI was unavailable, so ${label} wrote it`,
        d.provider === provider ? "success" : "info",
      );
    } catch (e) {
      toast("Error generating caption: " + (e as Error).message, "error");
    } finally {
      setWriting(false);
    }
  };

  const publish = async () => {
    const o = postOpts;
    const files = o.files;
    const multi = files.length > 1;
    if (!media && !files.length) return toast("Please choose a media file first", "error");
    if (o.audio === "instagram" && !o.track) return toast("Pick an Instagram song first, or choose No sound", "error");
    if (o.audio === "mp3" && !o.mp3) return toast("Choose one of your audio files first", "error");
    if (multi && o.format === "slideshow" && files.some((f) => f.is_video)) return toast("A slideshow can only use pictures", "error");
    if (multi && o.format === "carousel" && o.audio !== "none") return toast("A carousel can't have a song. Set Sound to No sound, or switch Post as to Slideshow Reel.", "error");

    setPublishing(true);
    try {
      const d = await api.post({
        media_path: multi ? files[0].url : media!.media_path || media!.media_url,
        media_paths: multi ? files.map((f) => f.url) : undefined,
        format: multi ? o.format : undefined,
        seconds_per_image: o.secondsPer,
        caption,
        is_video: multi ? files[0].is_video : media!.is_video,
        account: o.account || undefined,
        track_id: o.audio === "instagram" ? o.track?.id : undefined,
        track_start_ms: o.audio === "instagram" ? o.clipStart * 1000 : undefined,
        track_clip_ms: o.audio === "instagram" ? o.clipLen * 1000 : undefined,
        local_track: o.audio === "mp3" ? o.mp3 : undefined,
      });
      if (d.built_media_url) refreshGallery();   // a slideshow / mixed video was saved to the vault
      toast(d.message, d.posted ? "success" : "info");
    } catch (e) {
      toast("Failed to publish: " + (e as Error).message, "error");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[14px] font-bold"><PenLine className="ic text-primary-400" />Caption</span>
        <div className="flex items-center gap-2">
          <span className="badge badge-primary">{tags} hashtags</span>
          <button className="btn btn-sm btn-soft" onClick={() => rewrite()} disabled={writing || !provider}>
            {writing ? <Spinner className="ic-sm w-4 h-4" /> : <Sparkles className="ic-sm w-4 h-4" />}
            <span>{writing ? "Writing" : "AI Rewrite"}</span>
          </button>
        </div>
      </div>

      <div>
        <span className="hint block mb-2">Caption AI</span>
        {ai && provider ? (
          <CaptionAiPicker
            providers={ai.providers}
            provider={provider}
            model={model}
            saved={ai.models}
            onChange={(p, m) => {
              setProvider(p);
              setModel(m);
            }}
          />
        ) : (
          <p className="text-[12px] text-danger">No caption AI key found. Add a Gemini, Groq or OpenRouter key in Settings.</p>
        )}
      </div>

      <div>
        <span className="hint block mb-2">Tone preset</span>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t.label}
              onClick={() => {
                setTone(t.value);
                rewrite(t.value);
              }}
              disabled={writing || !provider}
              className={clsx(
                "px-3.5 py-1.5 rounded-full text-[12px] font-semibold border transition disabled:opacity-60",
                tone === t.value ? "bg-brand text-neutral-950 border-transparent shadow-glow" : "bg-surface-2 text-muted border-line hover:text-fg hover:border-primary-500/50",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <textarea className="input min-h-[150px] flex-1" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Press AI Rewrite and the AI will write a caption from your picture" />

      <SuggestedSound />

      <div className="grid grid-cols-2 gap-3">
        <button className="btn btn-primary" onClick={publish} disabled={publishing}>
          {publishing ? <Spinner /> : <Send className="ic" />}
          <span>{publishing ? "Publishing" : "Publish Now"}</span>
        </button>
        <button className="btn btn-secondary" onClick={onSchedule}>
          <CalendarClock className="ic" />
          <span>Schedule</span>
        </button>
      </div>
      {footer}
    </div>
  );
}
