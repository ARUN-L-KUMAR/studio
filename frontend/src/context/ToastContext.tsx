import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

type Kind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});
let seq = 0;

const ICON = { success: CheckCircle2, error: AlertCircle, info: Info };
const TONE = {
  success: "text-success",
  error: "text-danger",
  info: "text-secondary-400",
};
const BAR = { success: "bg-success", error: "bg-danger", info: "bg-secondary-400" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, kind: Kind = "info") => {
    const id = ++seq;
    setItems((l) => [...l, { id, kind, text }]);
    window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-32 right-4 sm:right-6 z-[100] flex flex-col gap-3 w-[min(380px,calc(100vw-32px))] pointer-events-none">
        <AnimatePresence>
          {items.map((t) => {
            const Icon = ICON[t.kind];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 60, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="pointer-events-auto relative overflow-hidden flex items-start gap-3 bg-surface-2 border border-line rounded-md shadow-3 px-4 py-3.5"
              >
                <Icon className={`ic mt-0.5 ${TONE[t.kind]}`} />
                <span className="text-[13px] font-medium leading-snug">{t.text}</span>
                <motion.span
                  className={`absolute left-0 bottom-0 h-0.5 ${BAR[t.kind]}`}
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 4.2, ease: "linear" }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
