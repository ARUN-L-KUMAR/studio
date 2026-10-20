import { useState } from "react";
import { api } from "../../api/client";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";
import { useToast } from "../../context/ToastContext";
import Select from "../ui/Select";

/**
 * Global Instagram account switch (top bar). The selected account is the "active" one: posts that don't pick
 * an account of their own, and scheduled posts without one, go to whichever account is active when they run.
 */
export default function AccountSwitch() {
  const { health, refreshAll } = useApp();
  const { setPostOpts } = useStudio();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const accounts = health?.keys.instagram.official_accounts ?? [];
  if (!accounts.length) return null;
  const active = accounts.find((a) => a.default) ?? accounts[0];
  const name = (a: { username: string | null; id: string }) => a.username ?? a.id;

  const change = async (id: string) => {
    if (id === active.id) return;
    setBusy(true);
    try {
      await api.setDefaultIgAccount(id);
      setPostOpts({ account: "", files: [] });          // a post follows the new active account, not an earlier per-post pick
      await refreshAll();
      const next = accounts.find((a) => a.id === id);
      toast(`Active account: @${next ? name(next) : id}. New files are saved in its folder and new posts go there.`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const avatar = (
    <span className="grid place-items-center w-6 h-6 rounded-full bg-brand text-neutral-950 text-[11px] font-bold uppercase shrink-0">
      {name(active).charAt(0)}
    </span>
  );

  if (accounts.length === 1) {
    return (
      <span className="glass hidden sm:flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full border border-line text-[12px] font-semibold" title="Instagram account">
        {avatar}
        <span className="max-w-[130px] truncate">@{name(active)}</span>
      </span>
    );
  }

  return (
    <Select
      variant="pill"
      ariaLabel="Active Instagram account"
      value={active.id}
      disabled={busy}
      onChange={change}
      alignRight
      menuMinWidth={230}
      className="max-w-[128px] sm:max-w-[220px]"
      options={accounts.map((a) => ({
        value: a.id,
        label: `@${name(a)}`,
        hint: a.id === active.id ? "Active account" : a.days_left != null ? `${a.days_left} days left on the token` : undefined,
        leading: (
          <span className="grid place-items-center w-6 h-6 rounded-full bg-brand text-neutral-950 text-[11px] font-bold uppercase shrink-0">
            {name(a).charAt(0)}
          </span>
        ),
      }))}
      renderValue={(o) => o?.label ?? `@${name(active)}`}
    />
  );
}
