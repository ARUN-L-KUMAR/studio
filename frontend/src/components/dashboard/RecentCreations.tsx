import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Download, Eye, Image as ImageIcon, Loader2, Pencil, Send, Video, Zap } from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import EmptyState from "../ui/EmptyState";
import MediaViewer from "../studio/MediaViewer";
import { useApp } from "../../context/AppContext";
import { useConfirm } from "../../context/ConfirmContext";
import { useStudio } from "../../context/StudioContext";
import { useToast } from "../../context/ToastContext";
import type { GalleryFile } from "../../api/types";
import { aspectLabel, clock, fileToResult, pipelineLabel } from "../../utils/media";

const CARD = "relative shrink-0 snap-start w-[190px] sm:w-[220px] aspect-[9/14] rounded-lg overflow-hidden border border-line bg-surface-2";

function Skeleton() {
  return <div className={clsx(CARD, "animate-pulse")} aria-hidden><div className="absolute inset-x-3 bottom-3 space-y-2"><div className="h-3 rounded bg-surface-3 w-2/3" /><div className="h-3 rounded bg-surface-3 w-1/3" /></div></div>;
}

function GeneratingCard() {
  const { progress, step } = useStudio();
  return (
    <div className={clsx(CARD, "grid place-items-center text-center p-4 border-primary-500/50")} role="status">
      <div>
        <Loader2 className="w-7 h-7 mx-auto text-primary-400 animate-spin" />
        <strong className="block text-[14px] mt-3">Generating…</strong>
        <span className="block text-[12.5px] text-muted mt-1 line-clamp-2">{step || "Working"}</span>
        <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-3"><div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(6, progress)}%` }} /></div>
      </div>
    </div>
  );
}

function Action({ label, onClick, href, download, children }: { label: string; onClick?: () => void; href?: string; download?: string; children: React.ReactNode }) {
  const cls = "btn btn-sm btn-glass !px-0 w-9 h-9 justify-center";
  return href ? (
    <a className={cls} href={href} download={download} aria-label={label} title={label}>{children}</a>
  ) : (
    <button className={cls} onClick={onClick} aria-label={label} title={label}>{children}</button>
  );
}

function MediaCard({ f, onPreview, onEdit, onPublish }: { f: GalleryFile; onPreview: () => void; onEdit: () => void; onPublish: () => void }) {
  const [info, setInfo] = useState<{ w: number; h: number; sec: number } | null>(null);
  return (
    <div className={clsx(CARD, "group")}>
      <button className="absolute inset-0 w-full h-full" onClick={onPreview} aria-label={`Preview ${f.filename}`}>
        {f.is_video ? (
          <video
            src={f.url} muted loop playsInline preload="metadata"
            className="w-full h-full object-cover"
            onLoadedMetadata={(e) => setInfo({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight, sec: e.currentTarget.duration })}
            onMouseOver={(e) => e.currentTarget.play().catch(() => {})}
            onMouseOut={(e) => e.currentTarget.pause()}
          />
        ) : (
          <img src={f.url} alt="" loading="lazy" className="w-full h-full object-cover" onLoad={(e) => setInfo({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight, sec: 0 })} />
        )}
      </button>

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 pointer-events-none">
        <span className="badge bg-neutral-950/70 text-white backdrop-blur normal-case tracking-normal">
          {f.is_video ? <Video className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}{pipelineLabel(f.filename, f.is_video)}
        </span>
        <span className="badge bg-success/90 text-neutral-950 normal-case tracking-normal"><CheckCircle2 className="w-3.5 h-3.5" />{f.posted ? "Posted" : f.uploaded ? "Uploaded" : "Ready"}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 pointer-events-none bg-gradient-to-t from-neutral-950/90 via-neutral-950/60 to-transparent pt-10 pb-2.5 px-2.5 text-white">
        <div className="pointer-events-auto flex gap-1.5 mb-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 [@media(hover:none)]:opacity-100 [@media(hover:none)]:translate-y-0 transition duration-200">
          <Action label="Preview" onClick={onPreview}><Eye className="ic-sm w-4 h-4" /></Action>
          <Action label="Download" href={f.url} download={f.filename}><Download className="ic-sm w-4 h-4" /></Action>
          <Action label={f.is_video ? "Edit: restyle this clip" : "Edit: use as input"} onClick={onEdit}><Pencil className="ic-sm w-4 h-4" /></Action>
          <Action label="Publish" onClick={onPublish}><Send className="ic-sm w-4 h-4" /></Action>
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[12.5px] text-white/90 font-medium tabular-nums">
          {f.is_video && info?.sec ? <span>{clock(info.sec)}</span> : null}
          {info && <span>{aspectLabel(info.w, info.h)}</span>}
          <span>{f.size_mb < 0.1 ? "<0.1" : f.size_mb} MB</span>
        </div>
      </div>
    </div>
  );
}

const SPEED = 38;                                  // pixels per second the row travels

/** True when the person asked their system to reduce motion; the row then stays still and can be scrolled by hand. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!m) return;
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** The latest files in the vault, as real previews with quick actions. */
export default function RecentCreations() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { gallery, galleryLoaded, refreshGallery } = useApp();
  const { generating, loadMedia, setTask, setUpload } = useStudio();
  const [viewing, setViewing] = useState<number | null>(null);
  const files = gallery.slice(0, 12);
  const reduced = useReducedMotion();

  // The row runs in a loop once its cards are wider than the space they have; a short row stays put
  const boxRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);
  const [setWidth, setSetWidth] = useState(0);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const box = boxRef.current, set = setRef.current;
    if (!box || !set || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setBoxWidth(box.clientWidth);
      setSetWidth(set.scrollWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(set);
    return () => ro.disconnect();
  }, [files.length, generating, galleryLoaded]);
  const loop = !reduced && setWidth > boxWidth + 8;
  const closeViewer = useCallback(() => setViewing(null), []);

  const publish = (f: GalleryFile) => {
    loadMedia(fileToResult(f));
    navigate("/post");
  };

  // "Edit" sends the picture or clip to the Studio as the input of a new generation
  const edit = async (f: GalleryFile) => {
    try {
      const blob = await (await fetch(f.url)).blob();
      setUpload(f.is_video ? "video" : "image", new File([blob], f.filename, { type: blob.type }));
      setTask(f.is_video ? "video_to_video" : "image_to_video");
      navigate("/studio");
    } catch {
      toast("Could not open this file in the Studio.", "error");
    }
  };

  const remove = async (f: GalleryFile) => {
    if (!(await confirm({ title: "Delete this file?", text: `${f.filename} will be permanently removed from the output folder.` }))) return;
    try {
      await api.deleteMedia(f.path);
      toast("File deleted", "info");
      refreshGallery();
    } catch (e) {
      toast("Error deleting: " + (e as Error).message, "error");
    }
  };

  return (
    <>
      {!galleryLoaded ? (
        <div className="flex gap-4 overflow-hidden">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} />)}</div>
      ) : files.length === 0 && !generating ? (
        <div className="card">
          <EmptyState
            image="empty-gallery.svg"
            title="Nothing created yet"
            text="Your generated images and Reels show up here with previews, so you can review and publish them in one click."
            action={<button className="btn btn-primary btn-sm" onClick={() => document.getElementById("qc-prompt")?.focus()}><Zap className="ic-sm w-4 h-4" /><span>Try Quick Create</span></button>}
          />
        </div>
      ) : (
        <div
          ref={boxRef}
          className={clsx("marquee -mx-1 px-1 pb-3", loop ? "overflow-hidden" : "overflow-x-auto snap-x no-scrollbar")}
          data-paused={viewing !== null}
          aria-label="Recent creations, scrolling in a loop. Hover or focus a card to pause."
        >
          <div className={clsx("flex w-max", loop && "marquee-track")} style={loop ? ({ "--marquee-s": `${Math.max(12, setWidth / SPEED)}s` } as React.CSSProperties) : undefined}>
            <div ref={setRef} className="flex gap-4 pr-4">
              {generating && <GeneratingCard />}
              {files.map((f, i) => (
                <MediaCard key={f.path} f={f} onPreview={() => setViewing(i)} onEdit={() => edit(f)} onPublish={() => publish(f)} />
              ))}
              <button className={clsx(CARD, "grid place-items-center text-muted hover:text-fg hover:border-primary-500/60 transition")} onClick={() => navigate("/gallery")}>
                <span className="text-center"><ArrowRight className="w-6 h-6 mx-auto" /><span className="block text-[14px] font-semibold mt-2">Open the Vault</span></span>
              </button>
            </div>
            {loop && (
              // the second copy only makes the loop seamless: hidden from screen readers and keyboard
              <div className="flex gap-4 pr-4" aria-hidden="true" ref={(el) => { if (el) el.setAttribute("inert", ""); }}>
                {generating && <GeneratingCard />}
                {files.map((f, i) => (
                  <MediaCard key={f.path} f={f} onPreview={() => setViewing(i)} onEdit={() => edit(f)} onPublish={() => publish(f)} />
                ))}
                <div className={clsx(CARD, "grid place-items-center text-muted")}>
                  <span className="text-center"><ArrowRight className="w-6 h-6 mx-auto" /><span className="block text-[14px] font-semibold mt-2">Open the Vault</span></span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <MediaViewer files={files} index={viewing} onIndex={setViewing} onClose={closeViewer} onPost={publish} onDelete={remove} />
    </>
  );
}
