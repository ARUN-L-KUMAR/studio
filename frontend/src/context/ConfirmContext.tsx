import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import Modal from "../components/ui/Modal";

interface Options {
  title: string;
  text: string;
  confirmLabel?: string;
}
type Fn = (o: Options) => Promise<boolean>;

const Ctx = createContext<Fn>(() => Promise.resolve(false));

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<Options | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm: Fn = useCallback((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onClose={() => close(false)} icon={Trash2} tone="danger" title={opts?.title ?? ""} subtitle={opts?.text} size="sm">
        <div className="flex justify-end gap-3 mt-2">
          <button className="btn btn-ghost" onClick={() => close(false)}>Cancel</button>
          <button className="btn btn-danger" onClick={() => close(true)}>{opts?.confirmLabel ?? "Delete"}</button>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
