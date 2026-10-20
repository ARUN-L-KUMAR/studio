import { useEffect, useState, type FormEvent } from "react";
import { FolderPlus, KeyRound, Lock, LockOpen } from "lucide-react";
import { api } from "../../api/client";
import Modal from "../ui/Modal";
import Spinner from "../ui/Spinner";
import { useToast } from "../../context/ToastContext";

const PIN_HINT = "4 to 32 characters. Numbers are fine for a PIN; letters make it a password.";

/** Returns an error text when the new PIN is not acceptable, otherwise "" */
function pinProblem(pin: string, confirm: string): string {
  if (pin.length < 4 || pin.length > 32) return "Use 4 to 32 characters for the PIN.";
  if (pin !== confirm) return "The two PINs do not match.";
  return "";
}

function Field({ label, value, onChange, autoFocus, autoComplete = "off", hint }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div className="mt-3.5">
      <label className="label">{label}</label>
      <input className="input w-full" type="password" value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} autoComplete={autoComplete} maxLength={32} />
      {hint && <p className="hint mt-1.5">{hint}</p>}
    </div>
  );
}

/** Make a custom folder, optionally with a PIN. */
export function NewFolderModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setPin("");
      setConfirm("");
      setError("");
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the folder a name.");
    if (pin || confirm) {
      const problem = pinProblem(pin, confirm);
      if (problem) return setError(problem);
    }
    setBusy(true);
    setError("");
    try {
      const r = await api.createFolder(name.trim(), pin);
      toast(r.locked ? `Folder “${r.name}” created with a PIN` : `Folder “${r.name}” created`, "success");
      onCreated(r.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="New folder" subtitle="Keep files together, for example by campaign or client." icon={FolderPlus} size="sm">
      <form onSubmit={submit}>
        <label className="label">Folder name</label>
        <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={64} placeholder="e.g. Summer campaign" />
        <p className="hint mt-3.5 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />Optional: protect it with a PIN. Leave empty for none.</p>
        <Field label="PIN" value={pin} onChange={setPin} autoComplete="new-password" />
        <Field label="Confirm PIN" value={confirm} onChange={setConfirm} autoComplete="new-password" hint={PIN_HINT} />
        {error && <p className="text-[12px] text-danger mt-3" role="alert">{error}</p>}
        <div className="flex justify-end gap-2.5 mt-6">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? <Spinner /> : <FolderPlus className="ic" />}<span>Create folder</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Add, change or remove the PIN of a folder. */
export function PinModal({ open, onClose, folder, isProtected, onDone }: {
  open: boolean;
  onClose: () => void;
  folder: string;
  isProtected: boolean;
  onDone: () => void;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setCurrent("");
      setPin("");
      setConfirm("");
      setError("");
    }
  }, [open]);

  const run = async (job: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError("");
    try {
      await job();
      toast(done, "success");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const problem = pinProblem(pin, confirm);
    if (problem) return setError(problem);
    run(() => api.setFolderPin(folder, pin, current), isProtected ? "PIN changed. Other devices are locked out of this folder." : "PIN added. This folder is now protected.");
  };
  const remove = () => {
    if (!current) return setError("Enter the current PIN to remove it.");
    run(() => api.removeFolderPin(folder, current), "PIN removed");
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={isProtected ? "Folder PIN" : "Protect with a PIN"}
      subtitle={isProtected ? `Change or remove the PIN of “${folder}”.` : `Ask for a PIN before “${folder}” can be opened.`}
      icon={KeyRound}
      size="sm"
    >
      <form onSubmit={save}>
        {isProtected && <Field label="Current PIN" value={current} onChange={setCurrent} autoFocus />}
        <Field label={isProtected ? "New PIN" : "PIN"} value={pin} onChange={setPin} autoFocus={!isProtected} autoComplete="new-password" />
        <Field label="Confirm PIN" value={confirm} onChange={setConfirm} autoComplete="new-password" hint={PIN_HINT} />
        <p className="hint mt-3">The PIN is stored as a salted hash. If you forget it, nobody can recover it from the app.</p>
        {error && <p className="text-[12px] text-danger mt-3" role="alert">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2.5 mt-6">
          {isProtected && (
            <button type="button" className="btn btn-ghost mr-auto" onClick={remove} disabled={busy}>
              <LockOpen className="ic" /><span>Remove PIN</span>
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !pin}>
            {busy ? <Spinner /> : <Lock className="ic" />}<span>{isProtected ? "Change PIN" : "Set PIN"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Shown instead of the files while a folder with a PIN has not been unlocked in this browser. */
export function LockedCard({ folder, onUnlocked }: { folder: string; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPin("");
    setError("");
  }, [folder]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.unlockFolder(folder, pin);
      setPin("");
      onUnlocked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <form onSubmit={submit} className="mx-auto max-w-[320px] py-10 text-center">
        <div className="mx-auto grid place-items-center w-14 h-14 rounded-full bg-primary-600/15 text-primary-400 mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-[17px]">This folder is locked</h3>
        <p className="text-[13px] text-muted mt-1 mb-5">Enter the PIN for <strong className="text-fg font-semibold">{folder}</strong> to see its files.</p>
        <input
          className="input w-full text-center tracking-[0.3em]"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoFocus
          autoComplete="off"
          maxLength={32}
          aria-label="Folder PIN"
          placeholder="PIN"
        />
        {error && <p className="text-[12px] text-danger mt-3" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary w-full mt-4" disabled={busy || !pin}>
          {busy ? <Spinner /> : <LockOpen className="ic" />}<span>Unlock</span>
        </button>
        <p className="hint mt-3">It stays open for 30 minutes in this browser.</p>
      </form>
    </div>
  );
}
