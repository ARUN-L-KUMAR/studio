import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import clsx from "clsx";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  tone?: "brand" | "danger";
  size?: "sm" | "md";
  children?: ReactNode;
}

/** How long the closing animation runs before the dialog is removed from the page. */
const CLOSE_MS = 250;

/**
 * Dialog window. It is removed from the page on its own timer after the closing animation, NOT when everything
 * inside it has finished animating: a dialog that holds animated parts (such as the sliding switch) used to stay on
 * screen after closing, covering the page and swallowing every click until the page was reloaded. The backdrop also
 * stops catching clicks the moment the dialog starts to close, so nothing can ever be blocked by it.
 */
export default function Modal({ open, onClose, title, subtitle, icon: Icon, tone = "brand", size = "md", children }: Props) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[90] grid place-items-center p-4 bg-neutral-950/70 backdrop-blur-sm"
      style={{ pointerEvents: open ? "auto" : "none" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={{ duration: CLOSE_MS / 1000 }}
      onMouseDown={(e) => open && e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal={open}
        aria-label={title}
        className={clsx(
          "w-full bg-surface border border-line rounded-xl shadow-3 p-6 max-h-[90vh] overflow-y-auto",
          size === "sm" ? "max-w-[420px]" : "max-w-[520px]",
        )}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={open ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        transition={open ? { type: "spring", stiffness: 360, damping: 30 } : { duration: CLOSE_MS / 1000 }}
      >
        <div className="flex items-start gap-3.5 mb-5">
          <div
            className={clsx(
              "grid place-items-center w-10 h-10 rounded-md shrink-0",
              tone === "danger" ? "bg-danger/15 text-danger" : "bg-primary-600/15 text-primary-400",
            )}
          >
            <Icon className="ic" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[17px]">{title}</h3>
            {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button className="p-1.5 -m-1.5 rounded-sm text-muted hover:text-fg hover:bg-surface-2 transition" onClick={onClose} aria-label="Close">
            <X className="ic-sm w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
