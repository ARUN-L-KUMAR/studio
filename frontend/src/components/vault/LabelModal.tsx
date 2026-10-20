import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Minus, Plus, Tag, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../../api/client";
import Modal from "../ui/Modal";
import Spinner from "../ui/Spinner";
import { LABEL_COLORS, LabelChip, colorHex } from "./LabelChips";
import { useConfirm } from "../../context/ConfirmContext";
import { useToast } from "../../context/ToastContext";
import type { GalleryFile, VaultLabel } from "../../api/types";

type Want = "on" | "off" | "mixed";

interface Props {
  /** The files to label. An empty list opens the dialog only to make and delete labels. null = closed. */
  files: GalleryFile[] | null;
  labels: VaultLabel[];
  onClose: () => void;
  /** Something changed (labels were put on files, made or deleted): reload the Vault */
  onChanged: () => void;
}

/** Put labels on one or many files, make new labels, and delete labels you no longer use. */
export default function LabelModal({ files, labels, onClose, onChanged }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<VaultLabel[]>(labels);
  const [want, setWant] = useState<Record<string, Want>>({});
  const [name, setName] = useState("");
  const [color, setColor] = useState("emerald");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = files !== null;
  const manage = open && files.length === 0;

  // the state of every label across the chosen files when the dialog opens: on every file, on some, or on none
  const initial = useMemo<Record<string, Want>>(() => {
    const out: Record<string, Want> = {};
    for (const l of list) {
      const n = (files ?? []).filter((f) => f.labels.includes(l.name)).length;
      out[l.name] = !files?.length || n === 0 ? "off" : n === files.length ? "on" : "mixed";
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, list]);

  useEffect(() => {
    if (!open) return;
    setList(labels);
    setName("");
    setError("");
    setColor(Object.keys(LABEL_COLORS)[labels.length % Object.keys(LABEL_COLORS).length]);
    setWant({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const state = (n: string): Want => want[n] ?? initial[n] ?? "off";
  const toggle = (n: string) => setWant((w) => ({ ...w, [n]: state(n) === "on" ? "off" : "on" }));

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the label a name.");
    setBusy(true);
    setError("");
    try {
      const r = await api.createLabel(name.trim(), color);
      setList(r.labels);
      if (!manage) setWant((w) => ({ ...w, [r.label.name]: "on" }));         // a label made here is put on the chosen files
      setName("");
      setColor(Object.keys(LABEL_COLORS)[r.labels.length % Object.keys(LABEL_COLORS).length]);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeLabel = async (l: VaultLabel) => {
    if (!(await confirm({ title: `Delete the label “${l.name}”?`, text: "It is taken off every file that has it. The files themselves are not touched.", confirmLabel: "Delete label" }))) return;
    setBusy(true);
    try {
      const r = await api.deleteLabel(l.name);
      setList(r.labels);
      setWant((w) => {
        const { [l.name]: _gone, ...rest } = w;
        return rest;
      });
      onChanged();
      toast(`Label “${l.name}” deleted`, "info");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!files?.length) return onClose();
    const add = list.filter((l) => state(l.name) === "on" && initial[l.name] !== "on").map((l) => l.name);
    const remove = list.filter((l) => state(l.name) === "off" && initial[l.name] !== "off").map((l) => l.name);
    if (!add.length && !remove.length) return onClose();
    setBusy(true);
    setError("");
    try {
      await api.labelFiles(files.map((f) => f.path), add, remove);
      onChanged();
      toast(files.length === 1 ? "Labels saved" : `Labels saved on ${files.length} files`, "success");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={manage ? "Manage labels" : "Labels"}
      subtitle={manage ? "Make labels, then put them on files to find them again." : files && files.length === 1 ? files[0].filename : `${files?.length ?? 0} files selected`}
      icon={Tag}
      size="sm"
    >
      {list.length === 0 ? (
        <p className="text-[13px] text-muted">You have no labels yet. Make your first one below, for example “Best of”, “Ads” or a person’s name.</p>
      ) : (
        <ul className="max-h-[240px] overflow-y-auto divide-y divide-line rounded-md border border-line" aria-label="Labels">
          {list.map((l) => {
            const s = state(l.name);
            return (
              <li key={l.name} className="flex items-center gap-2 pr-2">
                {manage ? (
                  <span className="flex-1 min-w-0 px-3 py-2.5"><LabelChip name={l.name} color={l.color} /></span>
                ) : (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={s === "mixed" ? "mixed" : s === "on"}
                    onClick={() => toggle(l.name)}
                    className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    <span
                      className={clsx("grid place-items-center w-5 h-5 rounded-md border-2 shrink-0", s === "off" ? "border-line" : "text-neutral-950")}
                      style={s === "off" ? undefined : { backgroundColor: colorHex(l.color), borderColor: colorHex(l.color) }}
                    >
                      {s === "on" && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      {s === "mixed" && <Minus className="w-3.5 h-3.5" strokeWidth={3} />}
                    </span>
                    <LabelChip name={l.name} color={l.color} />
                    {s === "mixed" && <span className="text-[11.5px] text-dim">on some of them</span>}
                  </button>
                )}
                <button type="button" className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-surface-2" onClick={() => removeLabel(l)} disabled={busy} aria-label={`Delete label ${l.name}`} title="Delete this label">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={create} className="mt-4">
        <label className="label" htmlFor="new-label">New label</label>
        <div className="flex items-center gap-2">
          <input id="new-label" className="input flex-1 min-w-0" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="For example: Best of" autoComplete="off" />
          <button type="submit" className="btn btn-soft" disabled={busy || !name.trim()}>
            {busy ? <Spinner /> : <Plus className="ic" />}<span>Add</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2.5" role="radiogroup" aria-label="Label color">
          {Object.entries(LABEL_COLORS).map(([c, hex]) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              title={c}
              onClick={() => setColor(c)}
              className={clsx("w-6 h-6 rounded-full border-2 transition", color === c ? "border-fg scale-110" : "border-transparent hover:scale-110")}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      </form>

      {error && <p className="text-[12.5px] text-danger mt-3" role="alert">{error}</p>}

      <div className="flex justify-end gap-2.5 mt-6">
        {manage ? (
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : <Tag className="ic" />}<span>Save</span></button>
          </>
        )}
      </div>
    </Modal>
  );
}
