import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { api } from "../../api/client";
import Modal from "../ui/Modal";
import Spinner from "../ui/Spinner";
import { useToast } from "../../context/ToastContext";
import type { GalleryFile } from "../../api/types";

const splitName = (n: string) => {
  const dot = n.lastIndexOf(".");
  return dot > 0 ? { stem: n.slice(0, dot), ext: n.slice(dot) } : { stem: n, ext: "" };
};

/** Give a Vault file a new name. The file type (.png, .mp4 ...) stays as it is. */
export default function RenameModal({ file, onClose, onRenamed }: { file: GalleryFile | null; onClose: () => void; onRenamed: (f: GalleryFile, newName: string) => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shown = useRef<GalleryFile | null>(null);
  if (file) shown.current = file;                       // keeps the name on screen while the dialog fades out
  const { ext } = splitName(shown.current?.filename ?? "");

  useEffect(() => {
    if (!file) return;
    setName(splitName(file.filename).stem);
    setError("");
    const t = window.setTimeout(() => input.current?.select(), 60);
    return () => window.clearTimeout(t);
  }, [file]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const next = name.trim();
    if (!next) return setError("Give the file a name.");
    setBusy(true);
    setError("");
    try {
      const r = await api.renameMedia(file.path, next);
      if (r.changed) toast(`Renamed to ${r.filename}`, "success");
      onRenamed(file, r.filename);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!file} onClose={() => !busy && onClose()} title="Rename file" subtitle={shown.current?.filename} icon={Pencil} size="sm">
      <form onSubmit={submit}>
        <label className="label" htmlFor="rename-input">New name</label>
        <div className="flex items-center gap-2">
          <input
            id="rename-input"
            ref={input}
            className="input flex-1 min-w-0"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          {ext && <span className="px-3 py-2.5 rounded-md bg-surface-2 border border-line text-[13px] text-muted shrink-0" title="The file type stays the same">{ext}</span>}
        </div>
        {error ? <p className="text-[12.5px] text-danger mt-2" role="alert">{error}</p> : <p className="hint mt-2">Queued posts that use this file keep working. Its Posted / Uploaded label stays.</p>}
        <div className="flex justify-end gap-2.5 mt-6">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? <Spinner /> : <Pencil className="ic" />}<span>Rename</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
