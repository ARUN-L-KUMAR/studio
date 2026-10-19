import { motion } from "framer-motion";
import clsx from "clsx";
import { TASKS } from "../../data/tasks";
import { useStudio } from "../../context/StudioContext";
import { TaskArt } from "../art/Scenes";

export default function TaskGrid() {
  const { task, setTask } = useStudio();
  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      {TASKS.map((t) => {
        const active = t.key === task;
        return (
          <motion.button
            key={t.key}
            type="button"
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setTask(t.key)}
            aria-pressed={active}
            className={clsx(
              "group relative text-left rounded-md overflow-hidden border transition-colors",
              active ? "border-primary-500 shadow-glow" : "border-line hover:border-neutral-500/60",
            )}
          >
            <TaskArt task={t.key} className="h-20" />
            <div className="p-3 bg-surface-2">
              <div className="flex items-center gap-2">
                <t.icon className={clsx("ic-sm w-4 h-4", active ? "text-primary-400" : "text-muted")} />
                <strong className="text-[13px] truncate">{t.title}</strong>
              </div>
              <span className="block text-[11px] text-dim mt-0.5 truncate">{t.tag}</span>
            </div>
            {active && <motion.span layoutId="task-bar" className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
          </motion.button>
        );
      })}
    </div>
  );
}
