import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import clsx from "clsx";

interface Props {
  title: string;
  hint: string;
  icon: LucideIcon;
  accept: string;
  kind: "image" | "video";
  file: File | null;
  onFile: (f: File | null) => void;
}

export default function Dropzone({ title, hint, icon: Icon, accept, kind, file, onFile }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const pick = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith(kind + "/")) return;
    onFile(f);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files[0]);
      }}
      className={clsx(
        "relative grid place-items-center min-h-[150px] rounded-md border-2 border-dashed text-center cursor-pointer overflow-hidden transition",
        over ? "border-primary-500 bg-primary-600/10 scale-[1.01]" : "border-line bg-surface-2/50 hover:border-primary-500/60 hover:bg-surface-2",
      )}
    >
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} />
      {url && kind === "image" && <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      {url && kind === "video" && <video src={url} muted autoPlay loop playsInline className="absolute inset-0 w-full h-full object-cover" />}
      {url && <div className="absolute inset-0 bg-neutral-950/35" />}
      <div className={clsx("relative p-4 flex flex-col items-center gap-1.5", url && "text-white")}>
        <span className={clsx("grid place-items-center w-11 h-11 rounded-full", url ? "bg-white/20" : "bg-primary-600/15 text-primary-400")}>
          <Icon className="ic-lg w-6 h-6" />
        </span>
        <strong className="text-[13px]">{file ? file.name : title}</strong>
        <span className={clsx("text-[11px]", url ? "text-white/75" : "text-dim")}>{file ? "Click to replace" : hint}</span>
      </div>
      {file && (
        <button
          type="button"
          aria-label="Remove file"
          onClick={(e) => {
            e.stopPropagation();
            onFile(null);
          }}
          className="absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-full bg-neutral-950/70 text-white hover:bg-danger transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  );
}
