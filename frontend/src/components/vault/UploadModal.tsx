import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertTriangle, Film, Upload, UploadCloud, X } from "lucide-react";
import clsx from "clsx";
import Modal from "../ui/Modal";
import Select, { type SelectOption } from "../ui/Select";
import { useUploads } from "../../context/UploadContext";

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp"];
const VIDEO_EXT = [".mp4", ".mov"];
const MAX_IMAGE_MB = 30;
const MAX_VIDEO_MB = 300;
const MAX_FILES = 200;
const ACCEPT = "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,.png,.jpg,.jpeg,.webp,.mp4,.mov";

type Status = "ready" | "error";
interface Item {
  id: string;
  file: File;
  status: Status;
  message?: string;
  preview?: string;
}

const extOf = (n: string) => n.slice(n.lastIndexOf(".")).toLowerCase();
const mb = (b: number) => (b / (1024 * 1024)).toFixed(b < 1024 * 1024 ? 2 : 1);
const idOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

/** The same checks the server makes, so a wrong file is told about straight away. */
function problemWith(f: File): string | null {
  const e = extOf(f.name);
  const image = IMAGE_EXT.includes(e);
  if (!image && !VIDEO_EXT.includes(e)) return "Only PNG, JPG, WEBP pictures and MP4, MOV videos can be uploaded.";
  if (f.size === 0) return "The file is empty.";
  const limit = image ? MAX_IMAGE_MB : MAX_VIDEO_MB;
  if (f.size > limit * 1024 * 1024) return `Larger than ${limit} MB (this one is ${mb(f.size)} MB).`;
  return null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Files already chosen (for example dropped on the Vault page) */
  initialFiles: File[];
  /** Where the files go, named like the Vault's views: "" = active account, an account id, "folder:<name>", "unassigned" */
  scope: string;
  /** The folders that can be chosen (locked ones come disabled) */
  destinations: SelectOption[];
}

/** Add pictures (and videos) to a Vault folder: choose or drop many files, see each one's result. */
export default function UploadModal({ open, onClose, initialFiles, scope, destinations }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const { enqueue } = useUploads();
  const [items, setItems] = useState<Item[]>([]);
  const [dest, setDest] = useState(scope);
  const [over, setOver] = useState(false);

  const add = (list: File[]) => {
    setItems((cur) => {
      const have = new Set(cur.map((i) => i.id));
      const next = [...cur];
      for (const f of list) {
        const id = idOf(f);
        if (have.has(id) || next.length >= MAX_FILES) continue;
        have.add(id);
        const bad = problemWith(f);
        next.push({ id, file: f, status: bad ? "error" : "ready", message: bad ?? undefined, preview: !bad && IMAGE_EXT.includes(extOf(f.name)) ? URL.createObjectURL(f) : undefined });
      }
      return next;
    });
  };

  // a fresh start every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setDest(scope);
    setItems([]);
    add(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // free the preview pictures when the dialog is gone
  useEffect(() => {
    if (open) return;
    setItems((cur) => {
      cur.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
      return [];
    });
  }, [open]);

  const ready = items.filter((i) => i.status === "ready");
  const failed = items.filter((i) => i.status === "error").length;
  const destLabel = useMemo(() => destinations.find((d) => d.value === dest)?.label ?? "this folder", [destinations, dest]);

  const remove = (id: string) =>
    setItems((cur) => {
      const gone = cur.find((i) => i.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return cur.filter((i) => i.id !== id);
    });

  // the files are sent in the background (see UploadContext): the dialog closes at once and a tray shows the progress
  const start = () => {
    const files = ready.map((i) => i.file);
    if (!files.length) return;
    enqueue(files, dest, destLabel);
    onClose();
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    add(Array.from(e.target.files ?? []));
    e.target.value = "";                                // lets the same file be chosen again later
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(Array.from(e.dataTransfer.files));
  };

  return (
    <Modal open={open} onClose={onClose} icon={UploadCloud} title="Upload to the Vault" subtitle="Add pictures or videos you already have, then use them for posts and automations.">
      <div className="field">
        <span className="label">Add them to</span>
        <Select ariaLabel="Destination folder" value={dest} onChange={setDest} options={destinations} />
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Choose files to upload"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={clsx(
          "grid place-items-center text-center rounded-md border-2 border-dashed px-4 py-7 cursor-pointer transition",
          over ? "border-primary-500 bg-primary-600/10" : "border-line bg-surface-2/50 hover:border-primary-500/60 hover:bg-surface-2",
        )}
      >
        <input ref={input} type="file" multiple hidden accept={ACCEPT} onChange={onPick} />
        <span className="grid place-items-center w-12 h-12 rounded-full bg-primary-600/15 text-primary-400 mb-2"><Upload className="w-6 h-6" /></span>
        <strong className="text-[14px]">Drop files here, or click to choose</strong>
        <span className="text-[13px] text-dim mt-1">PNG, JPG, WEBP up to {MAX_IMAGE_MB} MB · MP4, MOV up to {MAX_VIDEO_MB} MB · as many as you like</span>
      </div>

      {items.length > 0 && (
        <ul className="mt-4 max-h-[260px] overflow-y-auto divide-y divide-line rounded-md border border-line" aria-label="Files to upload">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="grid place-items-center w-11 h-11 rounded-md bg-surface-2 overflow-hidden shrink-0">
                {i.preview ? <img src={i.preview} alt="" className="w-full h-full object-cover" /> : <Film className="w-5 h-5 text-dim" />}
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block text-[13.5px] truncate" title={i.file.name}>{i.file.name}</strong>
                <span className={clsx("block text-[12.5px]", i.status === "error" ? "text-danger" : "text-dim")}>{i.status === "error" ? i.message : `${mb(i.file.size)} MB`}</span>
              </div>
              {i.status === "error" && <AlertTriangle className="w-4 h-4 text-danger shrink-0" aria-label="Not uploaded" />}
              {(
                <button className="p-1.5 rounded-md text-muted hover:text-fg hover:bg-surface-2" onClick={() => remove(i.id)} aria-label={`Remove ${i.file.name}`}><X className="w-4 h-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
        <span className="text-[13px] text-muted" role="status">
          {items.length === 0 ? "No files chosen yet." : `${ready.length} ready${failed ? `, ${failed} can't be uploaded` : ""}. Uploading continues in the background.`}
        </span>
        <div className="flex gap-3">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={start} disabled={ready.length === 0}>
            <Upload className="ic" /><span>{`Upload ${ready.length || ""} file${ready.length === 1 ? "" : "s"}`.replace("  ", " ")}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
