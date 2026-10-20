import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, FolderInput, Pencil, Play, Send, Tag, Trash2, Wand2, X } from "lucide-react";
import clsx from "clsx";
import type { GalleryFile, VaultLabel } from "../../api/types";
import StatusBadges from "../vault/StatusBadges";
import { LabelChips } from "../vault/LabelChips";

interface Props {
  files: GalleryFile[];
  /** Index of the file being viewed, or null when the viewer is closed */
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  onPost: (f: GalleryFile) => void;
  onMove?: (f: GalleryFile) => void;
  /** Use this file as the input of a new generation in the Studio */
  onUse?: (f: GalleryFile) => void;
  onRename?: (f: GalleryFile) => void;
  onLabel?: (f: GalleryFile) => void;
  /** The labels you made, so a file's labels can be drawn in their colors */
  labels?: VaultLabel[];
  onDelete: (f: GalleryFile) => void;
}

/** Full-screen viewer for the media vault: big picture or video, previous / next, thumbnails, quick actions. */
export default function MediaViewer({ files, index, onIndex, onClose, onPost, onMove, onUse, onRename, onLabel, labels = [], onDelete }: Props) {
  const count = files.length;
  const open = index !== null && count > 0;
  const i = open ? Math.min(index as number, count - 1) : 0;
  const f = open ? files[i] : null;
  const dir = useRef(1);
  const strip = useRef<HTMLDivElement>(null);

  const go = (d: number) => {
    if (count < 2) return;
    dir.current = d;
    onIndex((i + d + count) % count);
  };
  const jump = (n: number) => {
    dir.current = n > i ? 1 : -1;
    onIndex(n);
  };

  // keyboard (ignored while another dialog such as the delete confirmation is open on top)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelectorAll("[role=dialog]").length > 1) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, count]);

  // keep the page behind from scrolling
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // load the neighbours early so next / previous feel instant, and keep the current thumbnail in view
  useEffect(() => {
    if (!open) return;
    for (const n of [i - 1, i + 1]) {
      const g = files[(n + count) % count];
      if (g && !g.is_video) new Image().src = g.url;
    }
    strip.current?.querySelector<HTMLElement>("[data-current=true]")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [open, i, files, count]);

  // when the open file disappears (deleted or moved) and none are left, close
  useEffect(() => {
    if (index !== null && count === 0) onClose();
  }, [index, count, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && f && (
        <motion.div
          key="viewer"
          role="dialog"
          aria-modal="true"
          aria-label="Full view"
          className="fixed inset-0 z-[80] flex flex-col bg-neutral-950/95 backdrop-blur-md text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* top bar */}
          <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
            <div className="min-w-0 flex-1">
              <strong className="flex items-center gap-2 text-[14px]"><span className="truncate" title={f.filename}>{f.filename}</span><StatusBadges file={f} /></strong>
              <span className="block text-[11px] text-white/55">{f.is_video ? "Reel" : "Image"} · {f.size_mb} MB · {f.created_at}</span>
              <LabelChips names={f.labels ?? []} registry={labels} max={6} className="mt-1.5" />
            </div>
            <span className="text-[12px] font-semibold rounded-full bg-white/10 px-3 py-1">{i + 1} / {count}</span>
            <button className="btn btn-sm btn-glass" onClick={() => onPost(f)}><Send className="ic-sm w-4 h-4" /><span className="hidden sm:inline">Post</span></button>
            {onUse && <button className="btn btn-sm btn-glass" onClick={() => onUse(f)} aria-label="Use as input in the Studio" title="Use as input in the Studio"><Wand2 className="ic-sm w-4 h-4" /><span className="hidden sm:inline">Generate</span></button>}
            {onRename && <button className="btn btn-sm btn-glass" onClick={() => onRename(f)} aria-label="Rename" title="Rename"><Pencil className="ic-sm w-4 h-4" /><span className="hidden sm:inline">Rename</span></button>}
            {onLabel && <button className="btn btn-sm btn-glass" onClick={() => onLabel(f)} aria-label="Labels" title="Labels"><Tag className="ic-sm w-4 h-4" /><span className="hidden sm:inline">Label</span></button>}
            {onMove && <button className="btn btn-sm btn-glass" onClick={() => onMove(f)} aria-label="Move to another folder" title="Move to another folder"><FolderInput className="ic-sm w-4 h-4" /><span className="hidden sm:inline">Move</span></button>}
            <a className="btn btn-sm btn-glass" href={f.url} download={f.filename} aria-label="Download"><Download className="ic-sm w-4 h-4" /></a>
            <button className="btn btn-sm btn-glass hover:!bg-danger" onClick={() => onDelete(f)} aria-label="Delete"><Trash2 className="ic-sm w-4 h-4" /></button>
            <button className="btn btn-sm btn-glass" onClick={onClose} aria-label="Close full view"><X className="ic-sm w-4 h-4" /></button>
          </div>

          {/* picture */}
          <div className="relative flex-1 min-h-0 overflow-hidden" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <AnimatePresence initial={false} custom={dir.current} mode="popLayout">
              <motion.div
                key={f.path}
                custom={dir.current}
                className="absolute inset-0 flex items-center justify-center px-4 sm:px-20 py-1"
                variants={{
                  enter: (d: number) => ({ opacity: 0, x: d * 70 }),
                  center: { opacity: 1, x: 0 },
                  exit: (d: number) => ({ opacity: 0, x: d * -70 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                drag={count > 1 ? "x" : false}
                dragSnapToOrigin
                dragElastic={0.25}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -90) go(1);
                  else if (info.offset.x > 90) go(-1);
                }}
                onMouseDown={(e) => e.target === e.currentTarget && onClose()}
              >
                {f.is_video ? (
                  <video key={f.url} src={f.url} controls autoPlay loop playsInline className="max-w-full max-h-full rounded-lg shadow-3 bg-black" />
                ) : (
                  <img key={f.url} src={f.url} alt={f.filename} draggable={false} className="max-w-full max-h-full object-contain rounded-lg shadow-3 select-none" />
                )}
              </motion.div>
            </AnimatePresence>

            {count > 1 && (
              <>
                <button onClick={() => go(-1)} aria-label="Previous" className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-10 grid place-items-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur transition">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button onClick={() => go(1)} aria-label="Next" className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-10 grid place-items-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur transition">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {/* thumbnails */}
          {count > 1 && (
            <div ref={strip} className="flex gap-2 overflow-x-auto px-4 sm:px-6 py-3 justify-start sm:justify-center">
              {files.map((g, n) => (
                <button
                  key={g.path}
                  data-current={n === i}
                  onClick={() => jump(n)}
                  aria-label={`Open ${g.filename}`}
                  className={clsx(
                    "relative shrink-0 w-14 h-[72px] rounded-md overflow-hidden border-2 transition",
                    n === i ? "border-primary-400 opacity-100" : "border-transparent opacity-55 hover:opacity-90",
                  )}
                >
                  {g.is_video ? (
                    <>
                      <video src={`${g.url}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-cover pointer-events-none" />
                      <span className="absolute inset-0 grid place-items-center bg-neutral-950/30"><Play className="w-4 h-4 fill-current" /></span>
                    </>
                  ) : (
                    <img src={g.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
