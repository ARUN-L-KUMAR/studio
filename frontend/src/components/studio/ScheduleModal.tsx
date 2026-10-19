import { useEffect, useState } from "react";
import { CalendarClock, Check } from "lucide-react";
import { api } from "../../api/client";
import Modal from "../ui/Modal";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";
import { useToast } from "../../context/ToastContext";

export default function ScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { media, task, caption, postOpts } = useStudio();
  const { refreshQueue, health } = useApp();
  const accounts = health?.keys.instagram.official_accounts ?? [];
  const target = accounts.find((a) => a.id === postOpts.account) ?? accounts.find((a) => a.default);
  const followsActive = !postOpts.account;
  const toast = useToast();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:30");

  useEffect(() => {
    if (!open) return;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setTime("18:30");
  }, [open]);

  const confirm = async () => {
    if (!media) return;
    if (!date || !time) return toast("Please pick both date and time", "error");
    if (postOpts.audio !== "none") return toast("A scheduled post can't have a song. Set Sound to No sound, or use Publish Now.", "error");
    const items = postOpts.files;
    const multi = items.length > 1;
    const postAt = `${date} ${time}`;
    try {
      await api.addToQueue({
        task: media.task || task,
        prompt: media.prompt || "Generated media",
        media: multi ? items[0].url : media.media_path || media.media_url,
        media_paths: multi ? items.map((f) => f.url) : undefined,
        account: postOpts.account || undefined,
        caption,
        post_at: postAt,
      });
      onClose();
      toast(`Scheduled for ${postAt}`, "success");
      refreshQueue();
    } catch (e) {
      toast("Error scheduling: " + (e as Error).message, "error");
    }
  };

  return (
    <Modal open={open} onClose={onClose} icon={CalendarClock} title="Schedule Publication" subtitle={postOpts.files.length > 1 ? `Pick when this carousel of ${postOpts.files.length} items should go live.` : "Pick when this post should go live on Instagram."}>
      {target && (
        <p className="text-[12px] text-muted mb-4 leading-snug">
          Posts to <strong className="text-fg">@{target.username ?? target.id}</strong>
          {followsActive ? ", the account that is active when it runs." : "."}
        </p>
      )}
      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="sd">Date</label>
          <input id="sd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="st">Time (24h)</label>
          <input id="st" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={confirm}><Check className="ic" /><span>Confirm Schedule</span></button>
      </div>
    </Modal>
  );
}
