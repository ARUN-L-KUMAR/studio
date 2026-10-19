import { useEffect, useRef, useState } from "react";
import { Bookmark, Camera, Heart, MessageCircle, Music2, Send } from "lucide-react";
import clsx from "clsx";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";
import { PhoneIdle } from "../art/Scenes";

export default function PhoneSimulator() {
  const { media, caption, prompt, song, postOpts } = useStudio();
  const { health } = useApp();
  // The Instagram username saved in Settings; shown exactly as it will appear on the post
  const handle = health?.keys.instagram.username?.trim() || "your_username";
  const video = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(false);
  const [pop, setPop] = useState(false);
  const [fit, setFit] = useState(true);
  const count = 2840 + (liked ? 1 : 0);

  // Several items: a carousel is flipped with the dots, a slideshow plays by itself
  const files = postOpts.files;
  const multi = files.length > 1;
  const slideshow = multi && postOpts.format === "slideshow";
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [files.length, postOpts.format]);
  useEffect(() => {
    if (!slideshow) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % files.length), postOpts.secondsPer * 1000);
    return () => window.clearInterval(t);
  }, [slideshow, files.length, postOpts.secondsPer]);

  const shownFile = multi ? files[idx % files.length] : null;
  const current = shownFile
    ? { url: shownFile.url, is_video: shownFile.is_video }
    : media
      ? { url: media.media_url, is_video: media.is_video }
      : null;

  useEffect(() => {
    if (current?.is_video) video.current?.play().catch(() => {});
  }, [current?.url, current?.is_video]);

  const songLabel =
    postOpts.audio === "instagram" && postOpts.track
      ? `${postOpts.track.title} · ${postOpts.track.artist}`
      : postOpts.audio === "mp3" && postOpts.mp3
        ? postOpts.mp3
        : song || "Original Audio";
  const kindLabel = multi ? (slideshow ? "Reels" : "Carousel") : media && !media.is_video ? "Photo" : "Reels";

  const toggleLike = () => {
    setLiked((l) => !l);
    setPop(true);
    window.setTimeout(() => setPop(false), 380);
  };

  const shown = caption || (prompt ? `${prompt}\n\n#reels #viral #explore` : "");

  const fitClass = fit ? "object-contain" : "object-cover";

  return (
    <div className="mx-auto shrink-0 flex flex-col items-center gap-4">
    <div className="relative w-[270px] rounded-[42px] p-[9px] bg-neutral-900 border border-white/10 shadow-3 ring-1 ring-black/40">
      <div className="absolute top-[18px] left-1/2 -translate-x-1/2 z-20 w-[84px] h-[24px] rounded-full bg-black" />
      <div className="relative aspect-[9/19] rounded-[34px] overflow-hidden bg-black text-white">
        {current?.is_video && <video key={current.url} ref={video} src={current.url} loop playsInline controls className={clsx("absolute inset-0 w-full h-full", fitClass)} />}
        {current && !current.is_video && <img key={current.url} src={current.url} alt="" className={clsx("absolute inset-0 w-full h-full animate-page-in", fitClass)} />}

        {!current && (
          <div className="absolute inset-0">
            <PhoneIdle />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center pl-5 pr-14 bg-neutral-950/55">
              <strong className="text-[14px]">Live Preview</strong>
              <span className="text-[11px] text-white/60">Choose a file above to preview it here</span>
            </div>
          </div>
        )}

        {multi && (
          <div className="absolute top-[84px] inset-x-0 z-10 flex justify-center items-center gap-1.5">
            {files.map((f, i) => (
              <button
                key={f.url}
                onClick={() => !slideshow && setIdx(i)}
                aria-label={`Item ${i + 1}`}
                className={clsx("h-1.5 rounded-full transition-all", i === idx % files.length ? "w-4 bg-primary-400" : "w-1.5 bg-white/50", slideshow && "cursor-default")}
              />
            ))}
            <span className="ml-1 text-[10px] font-semibold bg-black/50 rounded-full px-1.5 py-0.5">{(idx % files.length) + 1}/{files.length}</span>
          </div>
        )}

        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between bg-gradient-to-b from-black/45 via-transparent to-black/75">
          <div className="flex items-center justify-between px-4 pt-11">
            <span className="text-[16px] font-bold">{kindLabel}</span>
            <Camera className="w-5 h-5" />
          </div>
          <div className="flex items-end gap-2 px-3.5 pb-4">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="grid place-items-center w-7 h-7 rounded-full bg-brand text-neutral-950 text-[12px] font-bold uppercase border border-white/70">
                  {handle.charAt(0)}
                </span>
                <span className="text-[12px] font-semibold truncate max-w-[110px]" title={handle}>{handle}</span>
                <span className="px-2 py-0.5 rounded-md border border-white/70 text-[10px] font-semibold">Follow</span>
              </div>
              <p className="text-[11.5px] leading-snug line-clamp-3 whitespace-pre-line">{shown}</p>
              <div className="flex items-center gap-1.5 text-[11px] bg-black/35 backdrop-blur rounded-full px-2.5 py-1 w-fit max-w-full">
                <Music2 className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[130px]">{songLabel}</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-4 pointer-events-auto">
              <button onClick={toggleLike} title="Like" className="flex flex-col items-center gap-0.5">
                <Heart className={clsx("w-6 h-6 transition-colors", liked && "fill-danger text-danger", pop && "animate-pop")} />
                <span className="text-[10px] font-semibold">{count.toLocaleString()}</span>
              </button>
              <button title="Comments" className="flex flex-col items-center gap-0.5">
                <MessageCircle className="w-6 h-6" />
                <span className="text-[10px] font-semibold">142</span>
              </button>
              <button title="Share" className="flex flex-col items-center gap-0.5">
                <Send className="w-6 h-6" />
                <span className="text-[10px] font-semibold">89</span>
              </button>
              <button title="Save"><Bookmark className="w-6 h-6" /></button>
              <span className="w-7 h-7 rounded-md bg-brand border-2 border-white/80 animate-[spin_5s_linear_infinite]" />
            </div>
          </div>
        </div>
      </div>
    </div>

    {current && (
      <div className="flex flex-col items-center gap-2 max-w-[270px] text-center">
        <div className="inline-flex gap-1 p-1 rounded-full bg-surface-2 border border-line">
          {([[true, "Fit"], [false, "Fill"]] as const).map(([val, label]) => (
            <button
              key={label}
              onClick={() => setFit(val)}
              className={clsx(
                "px-4 py-1 rounded-full text-[12px] font-semibold transition",
                fit === val ? "bg-brand text-neutral-950" : "text-muted hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-dim leading-snug">
          Fit shows the whole picture. Fill crops to the phone screen. The original file is posted either way.
        </p>
      </div>
    )}
    </div>
  );
}
