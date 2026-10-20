import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertTriangle, CheckCircle2, Film, Loader2, Upload, UploadCloud, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import Modal from "../ui/Modal";
import Select, { type SelectOption } from "../ui/Select";
import Spinner from "../ui/Spinner";
import { useToast } from "../../context/ToastContext";

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp"];
const VIDEO_EXT = [".mp4", ".mov"];
const MAX_IMAGE_MB = 30;
const MAX_VIDEO_MB = 300;
const MAX_FILES = 200;
const ACCEPT = "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,.png,.jpg,.jpeg,.webp,.mp4,.mov";

type Status = "ready" | "uploading" | "done" | "error";
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
  /** Called after at least one file was saved, so the Vault can reload */
  onUploaded: (count: number) => void;
}

/** Add pictures (and videos) to a Vault folder: choose or drop many files, see each one's result. */
export default function UploadModal({ open, onClose, initialFiles, scope, destinations, onUploaded }: Props) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef(false);
  const [items, setItems] = useState<Item[]>([]);
  const [dest, setDest] = useState(scope);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

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
    cancel.current = false;
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
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error").length;
  const total = ready.length + done;
  const destLabel = useMemo(() => destinations.find((d) => d.value === dest)?.label ?? "this folder", [destinations, dest]);

  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const remove = (id: string) =>
    setItems((cur) => {
      const gone = cur.find((i) => i.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return cur.filter((i) => i.id !== id);
    });

  const start = async () => {
    cancel.current = false;
    setBusy(true);
    const alreadyBad = items.filter((i) => i.status === "error").length;     // files the page itself refused
    let saved = 0, refused = 0;
    for (const it of items.filter((i) => i.status === "ready")) {
      if (cancel.current) break;
      patch(it.id, { status: "uploading" });
      try {
        const r = await api.uploadToVault(it.file, dest);
        if (r.uploaded.length) {
          saved++;
          patch(it.id, { status: "done", message: r.uploaded[0].note });
        } else {
          refused++;
          patch(it.id, { status: "error", message: r.rejected[0]?.reason ?? "The server did not accept this file." });
        }
      } catch (e) {
        refused++;
        patch(it.id, { status: "error", message: (e as Error).message });
        if (/locked|PIN/i.test((e as Error).message)) break;          // every other file would be refused the same way
      }
    }
    setBusy(false);
    if (saved) onUploaded(saved);
    if (saved && !refused && !alreadyBad && !cancel.current) {
      toast(`${saved} file${saved === 1 ? "" : "s"} added to ${destLabel}`, "success");
      onClose();
    } else if (saved) {
      toast(`${saved} added${refused + alreadyBad ? `, ${refused + alreadyBad} could not be added` : ""}`, "info");
    }
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

  const close = () => {
    if (busy) cancel.current = true;
    onClose();
  };

  return (
    <Modal open={open} onClose={close} icon={UploadCloud} title="Upload to the Vault" subtitle="Add pictures or videos you already have, then use them for posts and automations.">
      <div className="field">
        <span className="label">Add them to</span>
        <Select ariaLabel="Destination folder" value={dest} onChange={setDest} options={destinations} disabled={busy} />
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Choose files to upload"
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={clsx(
          "grid place-items-center text-center rounded-md border-2 border-dashed px-4 py-7 cursor-pointer transition",
          over ? "border-primary-500 bg-primary-600/10" : "border-line bg-surface-2/50 hover:border-primary-500/60 hover:bg-surface-2",
          busy && "opacity-60 pointer-events-none",
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
                <span className={clsx("block text-[12.5px]", i.status === "error" ? "text-danger" : "text-dim")}>{i.status === "error" || (i.status === "done" && i.message) ? i.message : `${mb(i.file.size)} MB`}</span>
              </div>
              {i.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-primary-400 shrink-0" aria-label="Uploading" />}
              {i.status === "done" && <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-label="Uploaded" />}
              {i.status === "error" && <AlertTriangle className="w-4 h-4 text-danger shrink-0" aria-label="Not uploaded" />}
              {(i.status === "ready" || i.status === "error") && !busy && (
                <button className="p-1.5 rounded-md text-muted hover:text-fg hover:bg-surface-2" onClick={() => remove(i.id)} aria-label={`Remove ${i.file.name}`}><X className="w-4 h-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
        <span className="text-[13px] text-muted" role="status">
          {busy ? `Uploading ${done + 1} of ${total}…` : items.length === 0 ? "No files chosen yet." : `${ready.length} ready${failed ? `, ${failed} can't be uploaded` : ""}${done ? `, ${done} added` : ""}`}
        </span>
        <div className="flex gap-3">
          <button className="btn btn-ghost" onClick={close}>{busy ? "Stop" : done ? "Close" : "Cancel"}</button>
          <button className="btn btn-primary" onClick={start} disabled={busy || ready.length === 0}>
            {busy ? <Spinner /> : <Upload className="ic" />}<span>{busy ? "Uploading…" : `Upload ${ready.length || ""} file${ready.length === 1 ? "" : "s"}`.replace("  ", " ")}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
