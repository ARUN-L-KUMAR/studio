import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Film, GalleryHorizontal, Heart, Image as ImageIcon, MessageCircle, X } from "lucide-react";
import clsx from "clsx";
import type { IgPost } from "../../api/types";
import { useToast } from "../../context/ToastContext";

const KIND = { photo: "Photo", carousel: "Carousel", reel: "Reel", video: "Video" } as const;

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface Props {
  post: IgPost | null;
  account: string;
  onClose: () => void;
}

/** In-app preview of a post that is already on Instagram: media, full caption, stats. */
export default function PostPreview({ post, account, onClose }: Props) {
  const toast = useToast();
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIdx(0);
    setBroken(false);
    setCopied(false);
  }, [post?.id]);
  useEffect(() => setBroken(false), [idx]);

  const count = post?.media.length ?? 0;
  const go = (d: number) => count > 1 && setIdx((i) => (i + d + count) % count);

  useEffect(() => {
    if (!post) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, count]);

  const copy = async () => {
    if (!post) return;
    try {
      await navigator.clipboard.writeText(post.caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Could not copy the caption", "error");
    }
  };

  const m = post?.media[idx];
  const KindIcon = post?.kind === "carousel" ? GalleryHorizontal : post?.kind === "photo" ? ImageIcon : Film;

  return createPortal(
    <AnimatePresence>
      {post && (
        <motion.div
          className="fixed inset-0 z-[90] grid place-items-center p-3 sm:p-6 bg-neutral-950/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Post preview"
            className="relative w-full max-w-[980px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-surface shadow-3 grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
          >
            {/* media */}
            <div className="relative bg-black min-h-[320px] md:min-h-[560px] max-h-[60vh] md:max-h-none grid place-items-center">
              {m && !broken ? (
                m.type === "video" ? (
                  <video
                    key={m.url}
                    src={m.url}
                    poster={m.thumb || undefined}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    onError={() => setBroken(true)}
                    className="w-full h-full max-h-[85vh] object-contain"
                  />
                ) : (
                  <img key={m.url || m.thumb} src={m.url || m.thumb} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="w-full h-full max-h-[85vh] object-contain" />
                )
              ) : (
                <div className="p-8 text-center text-white/70 text-[13px] max-w-xs">
                  {m?.thumb && <img src={m.thumb} alt="" referrerPolicy="no-referrer" className="mx-auto mb-4 max-h-[260px] rounded-lg opacity-70" />}
                  Instagram does not allow this media to be played outside Instagram. Use the button on the right to open it there.
                </div>
              )}

              {count > 1 && (
                <>
                  <button onClick={() => go(-1)} aria-label="Previous" className="absolute left-3 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full bg-neutral-950/65 text-white backdrop-blur hover:bg-neutral-950/85 transition">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={() => go(1)} aria-label="Next" className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full bg-neutral-950/65 text-white backdrop-blur hover:bg-neutral-950/85 transition">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-3 inset-x-0 flex justify-center items-center gap-1.5">
                    {post.media.map((_, i) => (
                      <button key={i} onClick={() => setIdx(i)} aria-label={`Item ${i + 1}`} className={clsx("h-1.5 rounded-full transition-all", i === idx ? "w-5 bg-primary-400" : "w-1.5 bg-white/50 hover:bg-white/80")} />
                    ))}
                  </div>
                  <span className="absolute top-3 right-3 text-[11px] font-semibold rounded-full bg-neutral-950/65 text-white backdrop-blur px-2.5 py-1">{idx + 1} / {count}</span>
                </>
              )}
            </div>

            {/* details */}
            <div className="flex flex-col min-h-0 max-h-[40vh] md:max-h-[92vh]">
              <div className="flex items-center gap-3 p-4 border-b border-line">
                <span className="grid place-items-center w-9 h-9 rounded-full bg-brand text-neutral-950 text-[13px] font-bold uppercase shrink-0">{account.charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-[14px] truncate">@{account}</strong>
                  <span className="flex items-center gap-1.5 text-[11px] text-dim"><KindIcon className="w-3 h-3" />{KIND[post.kind]}{post.items ? ` · ${post.items} items` : ""}</span>
                </div>
                <button onClick={onClose} aria-label="Close" className="p-2 -m-1 rounded-sm text-muted hover:text-fg hover:bg-surface-2 transition"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 text-[14px] leading-relaxed whitespace-pre-wrap break-words">
                {post.caption || <span className="text-dim">No caption</span>}
              </div>

              <div className="p-4 border-t border-line space-y-3">
                <div className="flex items-center justify-between text-[12px] text-dim">
                  <span>{when(post.timestamp)}</span>
                  <span className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5"><Heart className="w-4 h-4" />{post.likes ?? "-"}</span>
                    <span className="flex items-center gap-1.5"><MessageCircle className="w-4 h-4" />{post.comments ?? "-"}</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button className="btn btn-ghost" onClick={copy}>
                    {copied ? <Check className="ic text-primary-400" /> : <Copy className="ic" />}<span>{copied ? "Copied" : "Copy caption"}</span>
                  </button>
                  <a className="btn btn-primary" href={post.permalink} target="_blank" rel="noreferrer">
                    <ExternalLink className="ic" /><span>Open on Instagram</span>
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
