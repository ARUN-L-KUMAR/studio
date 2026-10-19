import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, type LucideIcon } from "lucide-react";

interface Props {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}

export default function Accordion({ title, icon: Icon, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-line rounded-md bg-surface-2/60 mb-4">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-[13px] font-semibold"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Icon className="ic-sm w-4 h-4 text-secondary-400" />
          {title}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
