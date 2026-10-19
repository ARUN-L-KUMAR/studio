import { useEffect, useRef, useState } from "react";
import { Check, GalleryHorizontal, Music, Pause, Play, Scissors, Search, Upload, Volume2, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import type { InstaTrack, LocalTrack } from "../../api/types";
import { useStudio, type AudioMode } from "../../context/StudioContext";
import { useToast } from "../../context/ToastContext";
import { clipDefaults } from "../../utils/media";
import Segmented from "../ui/Segmented";
import Select from "../ui/Select";
import Spinner from "../ui/Spinner";

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/** Card on the Post page: carousel or slideshow, and which sound to use. */
export default function PostOptions() {
  const { postOpts: o, setPostOpts, song, media } = useStudio();
  const toast = useToast();
  const count = o.files.length;
  const hasVideo = o.files.some((f) => f.is_video);

  // Instagram song search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstaTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  // Own audio files
  const [local, setLocal] = useState<LocalTrack[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadLocal = () => api.localMusic().then((d) => setLocal(d.tracks)).catch(() => {});
  useEffect(() => {
    loadLocal();
    return () => audio.current?.pause();
  }, []);

  // Start the search box with the AI's suggested song the first time Instagram songs is chosen
  useEffect(() => {
    if (o.audio === "instagram" && !query && song) setQuery(song.replace(/\s+/g, " ").trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.audio, song]);

  const search = async () => {
    if (!query.trim()) return toast("Type a song or artist first", "info");
    setSearching(true);
    try {
      const d = await api.musicSearch(query);
      setResults(d.tracks);
      if (!d.tracks.length) toast("No songs found. Try a different search", "info");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSearching(false);
    }
  };

  const preview = (t: { id: string; preview: string }) => {
    if (playing === t.id) {
      audio.current?.pause();
      return setPlaying(null);
    }
    audio.current?.pause();
    if (!t.preview) return toast("No preview available for this song", "info");
    audio.current = new Audio(t.preview);
    audio.current.onended = () => setPlaying(null);
    audio.current.play().catch(() => toast("Could not play the preview", "error"));
    setPlaying(t.id);
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const d = await api.uploadMusic(file);
      await loadLocal();
      setPostOpts({ audio: "mp3", mp3: d.name });
      toast(`Added ${d.name}`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  // Play only the chosen part of the selected song
  const clipAudio = useRef<HTMLAudioElement | null>(null);
  const [clipPlaying, setClipPlaying] = useState(false);
  const stopClip = () => {
    clipAudio.current?.pause();
    clipAudio.current = null;
    setClipPlaying(false);
  };
  useEffect(() => stopClip, []);
  useEffect(() => {
    stopClip();
  }, [o.clipStart, o.clipLen, o.track?.id]);

  const playClip = () => {
    if (!o.track?.preview) return toast("No preview available for this song", "info");
    if (clipPlaying) return stopClip();
    audio.current?.pause();
    setPlaying(null);
    const a = new Audio(o.track.preview);
    const start = o.clipStart;
    const end = start + o.clipLen;
    a.addEventListener("loadedmetadata", () => {
      a.currentTime = start;
      a.play().catch(() => toast("Could not play the preview", "error"));
    });
    a.addEventListener("timeupdate", () => {
      if (a.currentTime >= end) stopClip();
    });
    a.onended = stopClip;
    clipAudio.current = a;
    setClipPlaying(true);
  };

  const chooseTrack = (t: InstaTrack) => {
    setPostOpts({ track: t, trackSource: "manual", ...clipDefaults(t, o.clipLen) });
  };

  // 60s clips only make sense for a video (Reel / slideshow); photos and carousels use 15s or 30s
  const isVideoPost = (o.files.length > 1 ? o.format === "slideshow" || o.files.some((f) => f.is_video) : !!media?.is_video);
  const lengths = isVideoPost ? ["15", "30", "60"] : ["15", "30"];

  const carouselBlocksMp3 = count > 1 && o.format === "carousel";
  const audioOptions: { value: AudioMode; label: string; disabled?: boolean; title?: string }[] = [
    { value: "none", label: "No sound" },
    {
      value: "instagram",
      label: "Instagram song",
      disabled: carouselBlocksMp3,
      title: carouselBlocksMp3 ? "Songs can't be added to a carousel. Use a Slideshow Reel, or post a single photo." : undefined,
    },
    {
      value: "mp3",
      label: "My audio",
      disabled: carouselBlocksMp3,
      title: carouselBlocksMp3 ? "Your own audio needs a video. Switch to Slideshow Reel." : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Format for several items */}
      {count > 1 && (
        <div>
          <span className="label"><GalleryHorizontal className="ic" />Post as</span>
          <Segmented<"carousel" | "slideshow">
            value={o.format}
            onChange={(format) => setPostOpts({ format, ...(format === "carousel" && o.audio !== "none" ? { audio: "none" as const } : {}) })}
            options={[
              { value: "carousel", label: "Carousel" },
              { value: "slideshow", label: "Slideshow Reel", disabled: hasVideo, title: hasVideo ? "A slideshow can only use pictures" : undefined },
            ]}
          />
          <p className="hint mt-2 leading-snug">
            {o.format === "carousel"
              ? "One post that people swipe through (pictures only, up to 10). Instagram doesn't allow a song on a carousel; use a Slideshow Reel for that."
              : "The pictures become one short vertical video, each shown for a few seconds, posted as a Reel."}
          </p>
          {o.format === "slideshow" && (
            <div className="mt-3">
              <label className="label justify-between" htmlFor="secs">
                <span>Seconds per picture</span>
                <strong className="text-primary-400">{o.secondsPer}s · {Math.round(count * o.secondsPer)}s total</strong>
              </label>
              <input
                id="secs" type="range" min={1} max={8} step={0.5} value={o.secondsPer}
                onChange={(e) => setPostOpts({ secondsPer: parseFloat(e.target.value) })}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary-600 bg-surface-3"
              />
            </div>
          )}
        </div>
      )}

      {/* Sound */}
      <div>
        <span className="label"><Music className="ic" />Sound</span>
        <Segmented<AudioMode> value={o.audio} onChange={(audioMode) => setPostOpts({ audio: audioMode })} options={audioOptions} />

        {o.audio === "instagram" && (
          <div className="mt-4">
            <div className="flex gap-2">
              <input
                className="input" value={query} placeholder="Song or artist"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                aria-label="Search Instagram songs"
              />
              <button className="btn btn-primary" onClick={search} disabled={searching}>
                {searching ? <Spinner /> : <Search className="ic" />}<span className="hidden sm:inline">Search</span>
              </button>
            </div>

            {o.track && (() => {
              const t = o.track;
              const durSec = Math.floor(t.duration_ms / 1000);
              const maxStart = Math.max(0, durSec - o.clipLen);
              const setStart = (v: number) => setPostOpts({ clipStart: Math.max(0, Math.min(v, maxStart)) });
              return (
                <div className="mt-3 rounded-md border border-primary-500/50 bg-primary-600/10 p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <Check className="ic text-primary-400" />
                    <div className="min-w-0 flex-1">
                      <strong className="block text-[13px] truncate">{t.title}</strong>
                      <span className="block text-[12px] text-muted truncate">{t.artist}</span>
                    </div>
                    <button className="p-1.5 rounded-sm text-muted hover:text-fg hover:bg-surface-2" onClick={() => setPostOpts({ track: null })} aria-label="Remove song">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <div className="label justify-between !mb-2">
                      <span className="flex items-center gap-1.5"><Scissors className="ic" />Part of the song</span>
                      <strong className="text-primary-400">{mmss(o.clipStart * 1000)} to {mmss((o.clipStart + o.clipLen) * 1000)}</strong>
                    </div>
                    {/* Timeline: the green block is the part that plays. Drag anywhere on the bar to move it. */}
                    <div className="relative h-9 flex items-center">
                      <div className="absolute inset-x-0 h-3 rounded-full bg-surface-3 overflow-hidden">
                        <div
                          className="absolute inset-y-0 rounded-full bg-brand shadow-glow"
                          style={{ left: `${(o.clipStart / durSec) * 100}%`, width: `${(o.clipLen / durSec) * 100}%` }}
                        />
                      </div>
                      <input
                        type="range" min={0} max={maxStart} step={1} value={o.clipStart}
                        onChange={(e) => setStart(parseInt(e.target.value, 10))}
                        aria-label="Where the clip starts"
                        className="absolute left-0 h-9 opacity-0 cursor-grab active:cursor-grabbing"
                        style={{ width: `${(maxStart / durSec) * 100}%`, minWidth: maxStart ? "24px" : "0" }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-dim mt-1"><span>0:00</span><span>{mmss(t.duration_ms)}</span></div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <div className="flex items-center gap-2">
                      <span className="hint">Length</span>
                      <Segmented<string>
                        value={String(o.clipLen)}
                        onChange={(v) => setPostOpts({ clipLen: Math.min(parseInt(v, 10), durSec), clipStart: Math.min(o.clipStart, Math.max(0, durSec - parseInt(v, 10))) })}
                        options={lengths.map((l) => ({ value: l, label: `${l}s` }))}
                      />
                    </div>
                    <button className="btn btn-sm btn-secondary" onClick={playClip}>
                      {clipPlaying ? <Pause className="ic-sm w-4 h-4" /> : <Play className="ic-sm w-4 h-4 fill-current" />}
                      <span>{clipPlaying ? "Stop" : "Play this part"}</span>
                    </button>
                  </div>

                  {t.highlights?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="hint">Instagram suggests starting at</span>
                      {[...new Set(t.highlights.map((h) => Math.floor(h / 1000)))].sort((x, y) => x - y).map((sec) => (
                        <button
                          key={sec}
                          onClick={() => setStart(sec)}
                          className={clsx(
                            "px-3 py-1 rounded-full text-[12px] font-semibold border transition",
                            o.clipStart === Math.min(sec, maxStart) ? "bg-brand text-neutral-950 border-transparent" : "border-line text-muted hover:text-fg hover:border-primary-500/50",
                          )}
                        >
                          {mmss(sec * 1000)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {results.length > 0 && (
              <ul className="mt-3 max-h-[280px] overflow-y-auto rounded-md border border-line divide-y divide-line">
                {results.map((t) => {
                  const chosen = o.track?.id === t.id;
                  return (
                    <li key={t.id} className={clsx("flex items-center gap-3 px-3 py-2.5", chosen && "bg-primary-600/10")}>
                      <button className="grid place-items-center w-9 h-9 rounded-full bg-surface-3 text-fg hover:bg-primary-600/30 shrink-0" onClick={() => preview(t)} aria-label={playing === t.id ? "Pause preview" : "Play preview"}>
                        {playing === t.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <strong className="block text-[13px] truncate">{t.title}{t.explicit && <span className="ml-1.5 text-[10px] text-dim border border-line rounded px-1">E</span>}</strong>
                        <span className="block text-[12px] text-muted truncate">{t.artist} · {mmss(t.duration_ms)}</span>
                      </div>
                      <button className={clsx("btn btn-sm", chosen ? "btn-primary" : "btn-ghost")} onClick={() => chooseTrack(t)}>
                        {chosen ? "Selected" : "Use"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="hint mt-2">Songs come from Instagram's own library, so they are licensed for your post.</p>
          </div>
        )}

        {o.audio === "mp3" && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <Select
                  ariaLabel="Your audio file"
                  value={o.mp3}
                  onChange={(v) => setPostOpts({ mp3: v })}
                  placeholder={local.length ? "Choose a file" : "No audio files yet"}
                  options={local.map((t) => ({ value: t.name, label: t.name, hint: `${t.size_mb} MB` }))}
                />
              </div>
              <button className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {uploading ? <Spinner /> : <Upload className="ic" />}<span className="hidden sm:inline">Upload</span>
              </button>
              <input ref={fileInput} type="file" accept=".mp3,.m4a,.wav,.aac,audio/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
            </div>
            {o.mp3 && (
              <audio className="w-full h-9" controls src={`/music/${encodeURIComponent(o.mp3)}`}>
                <track kind="captions" />
              </audio>
            )}
            <p className="hint flex items-start gap-1.5 leading-snug">
              <Volume2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {count <= 1 && !hasVideo
                  ? "Your audio turns this photo into a short Reel video. "
                  : "Your audio is mixed into the video. "}
                Only use music you have the rights to; Instagram can mute or remove other tracks.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
