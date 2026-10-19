import { useEffect, useState } from "react";
import { Activity, Clock, Cloud, Cpu, Globe, Hash, Instagram, KeyRound, LockKeyhole, LogOut, PenLine, RefreshCw, Save, ShieldAlert, Star, Trash2, ShieldCheck, SlidersHorizontal, Sparkles, Volume2 } from "lucide-react";
import { api } from "../api/client";
import type { IgAccount, IgAccountStatus } from "../api/types";
import CaptionAiPicker from "../components/ui/CaptionAiPicker";
import { BannerArt } from "../components/art/Scenes";
import Reveal from "../components/ui/Reveal";
import Spinner from "../components/ui/Spinner";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../context/ConfirmContext";
import { useToast } from "../context/ToastContext";

export default function Settings() {
  const { health, config, refreshAll } = useApp();
  const toast = useToast();
  const confirmAsk = useConfirm();
  const { status: auth, logout, setPassword } = useAuth();

  // Security
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const savePassword = async () => {
    if (newPw.length < 8) return toast("Use at least 8 characters", "error");
    if (newPw !== newPw2) return toast("The two new passwords do not match", "error");
    setPwBusy(true);
    const r = await setPassword(curPw, newPw);
    setPwBusy(false);
    toast(r.message, r.ok ? "success" : "error");
    if (r.ok) {
      setCurPw("");
      setNewPw("");
      setNewPw2("");
    }
  };

  // Automation defaults
  const [tone, setTone] = useState("");
  const [lang, setLang] = useState("English");
  const [maxTags, setMaxTags] = useState(12);
  const [times, setTimes] = useState("");
  const [volume, setVolume] = useState(0.8);

  // Credentials
  const [hf1, setHf1] = useState("");
  const [hf2, setHf2] = useState("");
  const [hfExtra, setHfExtra] = useState("");
  const [igUser, setIgUser] = useState("");
  const [igPass, setIgPass] = useState("");
  const [ig2fa, setIg2fa] = useState("");
  const [show2fa, setShow2fa] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!config) return;
    setTone(config.caption.tone ?? "");
    setLang(config.caption.language ?? "English");
    setMaxTags(config.caption.max_hashtags ?? 12);
    setTimes((config.schedule.daily_times ?? []).join(", "));
    setVolume(config.music.volume ?? 0.8);
  }, [config]);

  useEffect(() => {
    if (health?.keys.instagram.username) setIgUser((u) => u || health.keys.instagram.username || "");
  }, [health]);

  const hf = health?.keys.huggingface;
  const ig = health?.keys.instagram;

  // Official Instagram API accounts
  const [igList, setIgList] = useState<IgAccount[]>([]);
  const [igStatus, setIgStatus] = useState<Record<string, IgAccountStatus>>({});
  const [cloudOk, setCloudOk] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [newCloud, setNewCloud] = useState("");
  const [igBusy, setIgBusy] = useState(false);

  const loadAccounts = async () => {
    try {
      const d = await api.igAccounts();
      setIgList(d.accounts);
      setCloudOk(d.cloudinary);
      d.accounts.forEach((a) => api.igAccountStatus(a.id).then((st) => setIgStatus((m) => ({ ...m, [a.id]: st }))).catch(() => {}));
    } catch (e) {
      toast("Could not read the Instagram accounts: " + (e as Error).message, "error");
    }
  };
  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const afterChange = async () => {
    await Promise.all([loadAccounts(), refreshAll()]);
  };

  const addAccount = async () => {
    if (!newToken.trim() && !newCloud.trim()) return toast("Paste an access token or a Cloudinary link first", "info");
    setIgBusy(true);
    try {
      if (newCloud.trim()) await api.saveCloudinary(newCloud.trim());
      if (newToken.trim()) toast((await api.addIgAccount(newToken.trim())).message, "success");
      setNewToken("");
      setNewCloud("");
      await afterChange();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setIgBusy(false);
    }
  };

  const accountAction = async (fn: () => Promise<{ message?: string } | unknown>, ok: string) => {
    try {
      const r = (await fn()) as { message?: string } | undefined;
      toast(r?.message ?? ok, "success");
      await afterChange();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  // Caption AI
  const ai = health?.caption_ai;
  const [aiProvider, setAiProvider] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiKeys, setAiKeys] = useState({ gemini: "", groq: "", openrouter: "", openai: "" });
  const [aiTesting, setAiTesting] = useState(false);

  useEffect(() => {
    if (!ai) return;
    setAiProvider(ai.provider);
    setAiModel(ai.models[ai.provider] ?? ai.providers.find((p) => p.id === ai.provider)?.default_model ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai?.provider, ai?.models?.[ai?.provider ?? ""]]);

  const saveAi = async () => {
    try {
      const keys = Object.fromEntries(Object.entries(aiKeys).filter(([, v]) => v.trim()));
      if (Object.keys(keys).length) {
        const r = await api.saveAiKeys(keys);
        r.warnings.forEach((w) => toast(w, "error"));
      }
      await api.saveConfig({ caption: { provider: aiProvider, models: { [aiProvider]: aiModel } } });
      setAiKeys({ gemini: "", groq: "", openrouter: "", openai: "" });
      await refreshAll();
      toast("Caption AI saved", "success");
    } catch (e) {
      toast("Save error: " + (e as Error).message, "error");
    }
  };

  const testAi = async () => {
    setAiTesting(true);
    try {
      const r = await api.testCaptionAi(aiProvider, aiModel);
      toast(`${aiModel} replied in ${(r.ms / 1000).toFixed(1)}s: "${r.sample}"`, "success");
    } catch (e) {
      toast("Test failed: " + (e as Error).message, "error");
    } finally {
      setAiTesting(false);
    }
  };

  const saveConfig = async () => {
    try {
      await api.saveConfig({
        caption: { tone, language: lang, max_hashtags: maxTags },
        schedule: { daily_times: times.split(",").map((t) => t.trim()).filter(Boolean) },
        music: { volume },
      });
      await refreshAll();
      toast("Settings saved successfully", "success");
    } catch (e) {
      toast("Save error: " + (e as Error).message, "error");
    }
  };

  const saveHf = async () => {
    const tokens = [hf1, hf2, ...hfExtra.split(",")].map((t) => t.trim()).filter(Boolean);
    const unique = [...new Set(tokens)];
    if (!unique.length) return toast("Please enter at least one Hugging Face token", "info");
    try {
      const d = await api.saveHfTokens(unique);
      setHf1(""); setHf2(""); setHfExtra("");
      await refreshAll();
      toast(d.message, "success");
    } catch (e) {
      toast("Error updating tokens: " + (e as Error).message, "error");
    }
  };

  const saveIg = async () => {
    if (!igUser.trim()) return toast("Please enter your Instagram username", "info");
    try {
      const d = await api.saveInstagram({
        username: igUser.trim(),
        ...(igPass.trim() && { password: igPass.trim() }),
        ...(ig2fa.trim() && { verification_code: ig2fa.trim() }),
      });
      await refreshAll();
      toast(d.message || "Instagram credentials updated", "success");
    } catch (e) {
      toast("Error updating credentials: " + (e as Error).message, "error");
    }
  };

  const verifyIg = async () => {
    if (!igUser.trim()) return toast("Please enter your Instagram username first", "info");
    setVerifying(true);
    const r = await api.verifyInstagram({ username: igUser.trim(), password: igPass.trim(), verification_code: ig2fa.trim() });
    setVerifying(false);
    if (r.ok) {
      setShow2fa(false);
      toast(r.message, "success");
      return refreshAll();
    }
    if (r.error.status === "2fa_required") {
      setShow2fa(true);
      toast("Two-factor authentication is on. Enter your 6-digit code and verify again.", "info");
    } else if (r.error.status === "version_error") {
      toast("Instagram blocked password login. Use the browser Session ID below.", "error");
    } else {
      toast(r.error.message, "error");
    }
  };

  const connectSession = async () => {
    if (!sessionId.trim()) return toast("Please paste your Instagram sessionid cookie first", "info");
    toast("Authenticating with browser session ID", "info");
    const r = await api.verifyInstagram({ session_id: sessionId.trim() });
    if (r.ok) {
      setSessionId("");
      toast(r.message || "Connected successfully", "success");
      refreshAll();
    } else {
      toast("Session ID error: " + r.error.message, "error");
    }
  };

  const hfBadge = !hf?.configured
    ? ["badge-failed", "No account configured"]
    : hf.has_failover
      ? ["badge-done", `Failover active, ${hf.total_accounts} accounts`]
      : ["badge-pending", "1 account, add a backup"];
  const igBadge = ig?.session_expired ? ["badge-failed", "Session expired"] : ig?.session_cached ? ["badge-done", "Session active"] : ig?.configured ? ["badge-pending", "Credentials stored"] : ["badge-failed", "Not configured"];

  const services = [
    {
      icon: Cpu,
      name: "Caption AI",
      desc: "Gemini, Groq, OpenRouter or OpenAI for captions and song ideas",
      ok: ai?.providers.some((p) => p.configured),
      text: ai ? `${ai.providers.find((p) => p.id === ai.provider)?.label ?? ""}` : "",
    },
    { icon: Cloud, name: "Cloudinary CDN", desc: "Public hosting for the Graph API", ok: health?.keys.cloudinary.configured, text: health?.keys.cloudinary.preview },
    { icon: Instagram, name: "Instagram Publishing", desc: "Direct mobile client or Graph API", ok: ig?.configured, text: ig?.preview },
  ];

  return (
    <div className="space-y-6">
      <Reveal>
        <div className="relative h-40 rounded-xl overflow-hidden border border-line">
          <BannerArt />
          <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/85 to-neutral-950/20" />
          <div className="relative h-full flex flex-col justify-center px-6 sm:px-10 text-white">
            <h2 className="text-[26px]">Settings and Diagnostics</h2>
            <p className="text-[14px] text-white/75 max-w-lg">Manage credentials, publishing defaults, and the daily posting schedule.</p>
          </div>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <Reveal>
            <div className="card">
              <div className="card-head">
                <h3 className="card-title"><KeyRound className="ic" />Hugging Face Account Pool</h3>
                <span className={`badge ${hfBadge[0]}`}>{hfBadge[1]}</span>
              </div>
              <p className="text-[13px] text-muted mb-5">If the primary account hits its GPU quota or a rate limit, the pipeline switches to the next token automatically.</p>
              {hf?.quota?.some((q) => q.wait_seconds > 0) && (
                <div className="mb-4 rounded-md bg-surface-2 border border-line px-3.5 py-2.5 text-[12px] text-muted space-y-0.5">
                  {hf.quota.filter((q) => q.wait_seconds > 0).map((q) => (
                    <p key={q.index}>
                      <strong className="text-fg">Account {q.index}</strong> used up its free GPU time. It is skipped for about{" "}
                      {q.wait_seconds >= 3600 ? `${Math.floor(q.wait_seconds / 3600)}h ${Math.floor((q.wait_seconds % 3600) / 60)}m` : `${Math.max(1, Math.round(q.wait_seconds / 60))} min`},
                      then checked again.
                    </p>
                  ))}
                </div>
              )}
              {hf && hf.valid_accounts !== null && hf.valid_accounts < hf.total_accounts && (
                <p className={`text-[12px] mb-4 ${hf.valid_accounts === 0 ? "text-danger" : "text-muted"}`}>
                  {hf.valid_accounts} of {hf.total_accounts} tokens are accepted by Hugging Face. Rejected tokens are skipped automatically; replace them below.
                </p>
              )}
              <div className="field">
                <label className="label justify-between" htmlFor="hf1"><span>Account 1 (Primary)</span><code>{hf?.primary.configured ? hf.primary.preview : "Not set"}</code></label>
                <input id="hf1" type="password" className="input" value={hf1} onChange={(e) => setHf1(e.target.value)} placeholder="hf_xxxxxxxxxxxx" autoComplete="off" />
              </div>
              <div className="field">
                <label className="label justify-between" htmlFor="hf2"><span>Account 2 (Backup)</span><code>{hf?.backup.configured ? hf.backup.preview : "Not set"}</code></label>
                <input id="hf2" type="password" className="input" value={hf2} onChange={(e) => setHf2(e.target.value)} placeholder="hf_yyyyyyyyyyyy" autoComplete="off" />
              </div>
              <div className="field">
                <label className="label justify-between" htmlFor="hf3"><span>Additional Accounts</span><span className="hint">Comma separated</span></label>
                <input id="hf3" type="password" className="input" value={hfExtra} onChange={(e) => setHfExtra(e.target.value)} placeholder="hf_token3, hf_token4" autoComplete="off" />
              </div>
              <button className="btn btn-secondary w-full" onClick={saveHf}><Save className="ic" /><span>Save Account Pool</span></button>
            </div>
          </Reveal>

          <Reveal>
            <div className="card">
              <div className="card-head">
                <h3 className="card-title"><Instagram className="ic" />Instagram accounts (official API)</h3>
                <span className={`badge ${igList.length && cloudOk ? "badge-done" : "badge-failed"}`}>
                  {igList.length ? `${igList.length} connected` : "None connected"}
                </span>
              </div>
              <p className="text-[13px] text-muted mb-5">
                Posts photos, Reels and carousels with an access token per account, no browser session needed. The star marks the active account (also switchable in the top bar): posts and scheduled posts go there unless you pick another on the Post page. Songs still use the Instagram login below.
              </p>

              <div className="space-y-3 mb-5">
                {igList.map((a) => {
                  const st = igStatus[a.id];
                  return (
                    <div key={a.id} className="rounded-md bg-surface-2 border border-line p-3.5">
                      <div className="flex items-center gap-3">
                        <button
                          className={`p-1.5 rounded-sm ${a.default ? "text-secondary-400" : "text-dim hover:text-fg"}`}
                          title={a.default ? "Active account" : "Make active"}
                          aria-label={a.default ? "Active account" : "Make active"}
                          onClick={() => !a.default && accountAction(() => api.setDefaultIgAccount(a.id), "Active account changed")}
                        >
                          <Star className={`w-4 h-4 ${a.default ? "fill-current" : ""}`} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <strong className="block text-[14px] truncate">@{st?.username ?? a.username ?? a.id}</strong>
                          <span className="block text-[12px] text-dim">
                            {st?.error
                              ? <span className="text-danger">{st.error}</span>
                              : st
                                ? `${st.account_type?.replace("MEDIA_", "").toLowerCase() ?? "account"} · ${st.quota_used ?? 0} of ${st.quota_total ?? "?"} posts today`
                                : "Checking..."}
                          </span>
                        </div>
                        <span className="text-[12px] text-muted whitespace-nowrap hidden sm:block">
                          {a.days_left != null ? `${a.days_left}d left` : ""}
                        </span>
                        <button className="p-2 rounded-sm text-muted hover:text-fg hover:bg-surface-3" title="Renew token" aria-label="Renew token" onClick={() => accountAction(() => api.refreshIgAccount(a.id), "Token renewed")}>
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 rounded-sm text-muted hover:text-danger hover:bg-danger/10"
                          title="Disconnect"
                          aria-label="Disconnect"
                          onClick={async () => {
                            if (await confirmAsk({ title: `Disconnect @${a.username ?? a.id}?`, text: "Its token is removed from this app. The account itself is not affected.", confirmLabel: "Disconnect" }))
                              accountAction(() => api.removeIgAccount(a.id), "Account disconnected");
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {igList.length === 0 && <p className="text-[12px] text-muted">No account yet. Paste an access token below to connect one.</p>}
              </div>

              <div className="field">
                <label className="label" htmlFor="nat">Add an account: access token</label>
                <input id="nat" type="password" className="input" autoComplete="off" value={newToken} onChange={(e) => setNewToken(e.target.value)} placeholder="Paste the token. The name and ID are read from Instagram." />
              </div>
              <div className="field">
                <label className="label justify-between" htmlFor="ncu"><span>Cloudinary URL (shared by all accounts)</span><code className={cloudOk ? "" : "!text-danger"}>{cloudOk ? "Set" : "Not set"}</code></label>
                <input id="ncu" type="password" className="input" autoComplete="off" value={newCloud} onChange={(e) => setNewCloud(e.target.value)} placeholder="cloudinary://key:secret@name (leave empty to keep it)" />
              </div>
              <button className="btn btn-primary w-full" onClick={addAccount} disabled={igBusy}>
                {igBusy ? <Spinner /> : <Save className="ic" />}<span>{igBusy ? "Checking with Instagram" : "Connect account"}</span>
              </button>
              <p className="hint mt-3">
                Each account must be added to your Meta app as an Instagram Tester, and you generate its token there. Tokens last 60 days and renew by themselves about every 20 days while the server runs.
              </p>
            </div>
          </Reveal>

          <Reveal>
            <div className="card">
              <div className="card-head">
                <h3 className="card-title"><Instagram className="ic" />Instagram Login</h3>
                <span className={`badge ${igBadge[0]}`}>{igBadge[1]}</span>
              </div>
              <p className="text-[13px] text-muted mb-5">Logs in with the mobile client protocol and caches the session to <code>ig_session.json</code>. No Facebook Page or Graph API needed.</p>
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="igu">Username</label>
                  <input id="igu" className="input" value={igUser} onChange={(e) => setIgUser(e.target.value)} placeholder="your_username" autoComplete="username" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="igp">Password</label>
                  <input id="igp" type="password" className="input" value={igPass} onChange={(e) => setIgPass(e.target.value)} placeholder="Password" autoComplete="current-password" />
                </div>
              </div>
              {show2fa && (
                <div className="field">
                  <label className="label !text-secondary-400" htmlFor="ig2">Two-factor verification code</label>
                  <input id="ig2" className="input" inputMode="numeric" value={ig2fa} onChange={(e) => setIg2fa(e.target.value)} placeholder="6-digit code from SMS or authenticator app" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button className="btn btn-ghost" onClick={saveIg}><Save className="ic" /><span>Save</span></button>
                <button className="btn btn-secondary" onClick={verifyIg} disabled={verifying}>
                  {verifying ? <Spinner /> : <ShieldCheck className="ic" />}<span>{verifying ? "Verifying" : "Test and Verify"}</span>
                </button>
              </div>

              <div className="border-t border-line my-5" />

              <div className="field !mb-0">
                <label className="label justify-between" htmlFor="sid"><span className="!text-fg">Browser Session ID</span><span className="badge badge-done">Most reliable</span></label>
                <p className="hint mb-2.5">If Instagram rejects password login as "version out of date": open instagram.com, press <kbd>F12</kbd>, go to Application, then Cookies, and copy the <code>sessionid</code> value.</p>
                <div className="flex gap-2">
                  <input id="sid" type="password" className="input font-mono text-[12px]" value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Paste sessionid cookie" autoComplete="off" />
                  <button className="btn btn-primary" onClick={connectSession}>Connect</button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="space-y-6">
          <Reveal>
            <div className="card">
              <div className="card-head">
                <h3 className="card-title"><LockKeyhole className="ic" />Security</h3>
                <span className={`badge ${auth?.configured ? "badge-done" : "badge-failed"}`}>{auth?.configured ? "Password set" : "No password"}</span>
              </div>
              {auth?.configured ? (
                <p className="text-[13px] text-muted mb-5">Everyone must sign in with this password before using the app. Changing it signs out every other device.</p>
              ) : (
                <p className="flex items-start gap-2 text-[13px] text-secondary-400 mb-5 leading-snug">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>No password is set. The app is open on this computer only. Set one before you put it online, or anyone who finds the address could post to your accounts.</span>
                </p>
              )}
              {auth?.configured && (
                <div className="field">
                  <label className="label" htmlFor="cpw">Current password</label>
                  <input id="cpw" type="password" className="input" autoComplete="current-password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
                </div>
              )}
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="npw">{auth?.configured ? "New password" : "Password"}</label>
                  <input id="npw" type="password" className="input" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 8 characters" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="npw2">Repeat it</label>
                  <input id="npw2" type="password" className="input" autoComplete="new-password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
                </div>
              </div>
              <div className={`grid gap-3 ${auth?.required ? "grid-cols-2" : "grid-cols-1"}`}>
                <button className="btn btn-primary" onClick={savePassword} disabled={pwBusy}>
                  {pwBusy ? <Spinner /> : <Save className="ic" />}<span>{auth?.configured ? "Change password" : "Set password"}</span>
                </button>
                {auth?.required && (
                  <button className="btn btn-ghost" onClick={logout}><LogOut className="ic" /><span>Sign out</span></button>
                )}
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="card">
              <div className="card-head"><h3 className="card-title"><SlidersHorizontal className="ic" />Automation Defaults</h3></div>
              <div className="field">
                <label className="label" htmlFor="tone"><PenLine className="ic" />Default Caption Tone</label>
                <input id="tone" className="input" value={tone} onChange={(e) => setTone(e.target.value)} />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="lang"><Globe className="ic" />Language</label>
                  <input id="lang" className="input" value={lang} onChange={(e) => setLang(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="tags"><Hash className="ic" />Max Hashtags</label>
                  <input id="tags" type="number" min={1} max={30} className="input" value={maxTags} onChange={(e) => setMaxTags(parseInt(e.target.value, 10) || 1)} />
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="times"><Clock className="ic" />Daily Posting Times (24h, comma separated)</label>
                <input id="times" className="input" value={times} onChange={(e) => setTimes(e.target.value)} placeholder="09:00, 19:00" />
              </div>
              <div className="field">
                <label className="label justify-between" htmlFor="vol"><span className="flex items-center gap-1.5"><Volume2 className="ic" />Background Music Volume</span><strong className="text-primary-400">{Math.round(volume * 100)}%</strong></label>
                <input
                  id="vol" type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary-600"
                  style={{ background: `linear-gradient(90deg, rgb(var(--primary-600)) ${volume * 100}%, rgb(var(--surface-3)) ${volume * 100}%)` }}
                />
              </div>
              <button className="btn btn-primary w-full" onClick={saveConfig}><Save className="ic" /><span>Save Configuration</span></button>
            </div>
          </Reveal>

          <Reveal>
            <div className="card">
              <div className="card-head">
                <h3 className="card-title"><Sparkles className="ic" />Caption AI</h3>
                <span className={`badge ${ai?.providers.some((p) => p.configured) ? "badge-done" : "badge-failed"}`}>
                  {ai?.providers.filter((p) => p.configured).length ?? 0} of {ai?.providers.length ?? 4} keys
                </span>
              </div>
              <p className="text-[13px] text-muted mb-5">Writes captions from your picture. This is the default; you can also change it per post on the Post page. If one provider is rate-limited, the next configured one is used automatically.</p>

              {ai && aiProvider && (
                <div className="field">
                  <label className="label">Default provider and model</label>
                  <CaptionAiPicker
                    providers={ai.providers}
                    provider={aiProvider}
                    model={aiModel}
                    saved={ai.models}
                    onChange={(p, m) => {
                      setAiProvider(p);
                      setAiModel(m);
                    }}
                  />
                </div>
              )}

              <div className="space-y-3 mt-5">
                {ai?.providers.some((p) => p.key_source === "hf_pool") && (
                  <p className="hint rounded-md bg-surface-2 border border-line px-3.5 py-2.5 leading-snug">
                    Hugging Face and Hugging Face Spaces use the account pool above, so they need no separate key.
                    {ai.providers.find((p) => p.id === "huggingface")?.problem && (
                      <span className="block text-danger mt-1">{ai.providers.find((p) => p.id === "huggingface")?.problem}</span>
                    )}
                  </p>
                )}
                {ai?.providers.filter((p) => p.key_source === "env").map((p) => (
                  <div key={p.id}>
                    <label className="label justify-between" htmlFor={`key-${p.id}`}>
                      <span>{p.label} API key</span>
                      <code className={p.configured ? "" : "!text-danger"}>{p.configured ? p.preview : "Not set"}</code>
                    </label>
                    <input
                      id={`key-${p.id}`}
                      type="password"
                      className="input"
                      autoComplete="off"
                      value={aiKeys[p.id as keyof typeof aiKeys] ?? ""}
                      onChange={(e) => setAiKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                      placeholder={p.configured ? "Paste a new key to replace it" : "Paste your key"}
                    />
                    {p.problem && <p className="text-[12px] text-danger mt-1">{p.problem}</p>}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-5">
                <button className="btn btn-ghost" onClick={testAi} disabled={aiTesting || !aiProvider}>
                  {aiTesting ? <Spinner /> : <ShieldCheck className="ic" />}<span>{aiTesting ? "Testing" : "Test selected"}</span>
                </button>
                <button className="btn btn-primary" onClick={saveAi}><Save className="ic" /><span>Save Caption AI</span></button>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="card">
              <div className="card-head"><h3 className="card-title"><Activity className="ic" />Connected Services</h3></div>
              <div className="space-y-3">
                {services.map((s) => (
                  <div key={s.name} className="flex items-center gap-3.5 p-3.5 rounded-md bg-surface-2 border border-line">
                    <span className="grid place-items-center w-10 h-10 rounded-md bg-surface-3 text-muted"><s.icon className="ic" /></span>
                    <div className="flex-1 min-w-0">
                      <strong className="block text-[14px]">{s.name}</strong>
                      <span className="block text-[12px] text-dim truncate">{s.desc}</span>
                    </div>
                    <span className={`font-mono text-[12px] max-w-[160px] truncate ${s.ok ? "text-success" : "text-danger"}`}>{s.ok ? s.text || "Configured" : "Not configured"}</span>
                  </div>
                ))}
              </div>
              <p className="hint mt-4">Tokens are stored locally in your <code>.env</code> file.</p>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
