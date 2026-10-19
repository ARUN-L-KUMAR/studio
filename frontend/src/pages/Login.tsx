import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Eye, EyeOff, LockKeyhole, Play, ShieldAlert, Terminal } from "lucide-react";
import Backdrop from "../components/layout/Backdrop";
import Spinner from "../components/ui/Spinner";
import { useAuth } from "../context/AuthContext";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function Login() {
  const { status, login } = useAuth();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const locked = !!status?.locked;

  useEffect(() => {
    if (!locked) input.current?.focus();
  }, [locked]);

  // count down while sign-in is paused after too many wrong tries
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => window.clearInterval(t);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy || wait > 0) return;
    setBusy(true);
    setError("");
    const r = await login(password);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      if (r.retryAfter) setWait(r.retryAfter);
      setPassword("");
      input.current?.focus();
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <Backdrop />
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[420px]"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <span className="relative grid place-items-center w-16 h-16 rounded-2xl bg-brand shadow-glow text-neutral-950">
            <span className="absolute inset-0 rounded-2xl bg-brand animate-ring-out" />
            <Play className="relative w-7 h-7 fill-current ml-0.5" />
          </span>
          <h1 className="mt-5 text-[28px] font-display">InstaStudio</h1>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-[.22em] text-dim">AI Content Engine</span>
        </div>

        <div className="card !p-7 sm:!p-8">
          {locked ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="grid place-items-center w-10 h-10 rounded-md bg-secondary-500/15 text-secondary-400"><ShieldAlert className="ic" /></span>
                <div>
                  <h2 className="text-[17px]">This server is locked</h2>
                  <p className="text-[12px] text-muted">No password has been set yet.</p>
                </div>
              </div>
              <p className="text-[13px] text-muted leading-relaxed mb-4">
                For safety, a server that people can reach from other places stays closed until it has a password. On the machine that runs the app, open a terminal in the project folder and run:
              </p>
              <div className="flex items-center gap-2.5 rounded-md bg-surface-2 border border-line px-3.5 py-3 font-mono text-[13px]">
                <Terminal className="w-4 h-4 text-primary-400 shrink-0" />
                python set_password.py
              </div>
              <p className="hint mt-3">Then reload this page and sign in.</p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <h2 className="text-[19px] mb-1">Welcome back</h2>
              <p className="text-[13px] text-muted mb-6">Enter your password to open the studio.</p>

              {/* lets a password manager save the sign-in */}
              <input type="text" name="username" autoComplete="username" value="studio" readOnly hidden />

              <label className="label" htmlFor="pw"><LockKeyhole className="ic" />Password</label>
              <div className="relative">
                <input
                  ref={input}
                  id="pw"
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  className="input !pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  disabled={busy || wait > 0}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-sm text-muted hover:text-fg hover:bg-surface-3 transition"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="flex items-start gap-2 text-[13px] text-danger mt-3 leading-snug">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{wait > 0 ? `Too many wrong attempts. You can try again in ${mmss(wait)}.` : error}</span>
                </motion.p>
              )}

              <button type="submit" className="btn btn-primary btn-lg btn-shine w-full mt-6" disabled={!password || busy || wait > 0}>
                {busy ? <Spinner /> : <LockKeyhole className="ic" />}
                <span>{busy ? "Signing in" : wait > 0 ? `Wait ${mmss(wait)}` : "Sign in"}</span>
              </button>
            </form>
          )}
        </div>

        {!locked && <p className="text-center text-[11px] text-dim mt-6">Your session stays signed in for 14 days on this device.</p>}
      </motion.div>
    </div>
  );
}
