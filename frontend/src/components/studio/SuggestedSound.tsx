import { useEffect, useRef, useState } from "react";
import { Check, Music, SearchX, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { api } from "../../api/client";
import { useApp } from "../../context/AppContext";
import { useStudio } from "../../context/StudioContext";
import { clipDefaults, pickBestTrack } from "../../utils/media";
import Spinner from "../ui/Spinner";

type Status = "idle" | "searching" | "matched" | "nomatch" | "error";

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function readAuto(): boolean {
  try {
    return localStorage.getItem("is-auto-song") !== "off";
  } catch {
    return true;
  }
}

/**
 * Shows the song the AI suggested and, when Instagram is connected, finds it on Instagram and
 * selects it automatically (with Instagram's suggested clip). A song you chose yourself is never replaced.
 */
export default function SuggestedSound() {
  const { song, postOpts: o, setPostOpts } = useStudio();
  const { health } = useApp();
  const igReady = !!health?.keys.instagram.configured;
  // Instagram has no way to put a song on a carousel (several pictures posted as one swipeable post)
  const songAllowed = !(o.files.length > 1 && o.format === "carousel");

  const [auto, setAuto] = useState(readAuto);
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState("");
  const lastQuery = useRef("");

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    try {
      localStorage.setItem("is-auto-song", next ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
  };

  // Whenever the AI suggests a (new) song, look it up on Instagram and select the best match
  useEffect(() => {
    const query = song.trim();
    if (!query || !auto || !igReady || !songAllowed) return;
    if (o.audio === "mp3") return;                              // the user chose their own audio file
    if (o.track && o.trackSource === "manual") return;          // the user picked a song, keep it
    if (lastQuery.current === query && o.track) return;         // already matched this suggestion

    let cancelled = false;
    lastQuery.current = query;
    setStatus("searching");
    api
      .musicSearch(query)
      .then(({ tracks }) => {
        if (cancelled) return;
        const best = pickBestTrack(query, tracks);
        if (!best) return setStatus("nomatch");
        setPostOpts({ audio: "instagram", track: best, trackSource: "auto", ...clipDefaults(best, o.clipLen) });
        setStatus("matched");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setErrMsg(e.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song, auto, igReady, songAllowed]);

  // If a song was chosen and the post then became a carousel, drop it so Publish does not fail
  useEffect(() => {
    if (!songAllowed && o.audio === "instagram") setPostOpts({ audio: "none" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songAllowed, o.audio]);

  const matched = songAllowed && o.audio === "instagram" && o.track;
  const shownStatus: Status = !songAllowed ? "idle" : matched ? "matched" : status;

  const change = () => {
    setPostOpts({ audio: "instagram" });
    document.getElementById("format-sound")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="p-3.5 rounded-md bg-secondary-500/10 border border-secondary-500/25 space-y-2.5">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-md bg-secondary-500/20 text-secondary-400 shrink-0"><Music className="ic" /></span>
        <div className="flex-1 min-w-0">
          <span className="block text-[11px] text-muted">AI suggested sound</span>
          <strong className="block text-[13px] truncate">{song || "Write a caption and the AI will suggest one"}</strong>
        </div>
        {shownStatus === "matched" && (
          <span className="flex items-end gap-[3px] h-4 shrink-0" aria-hidden>
            {[0, 0.2, 0.4, 0.1].map((d) => (
              <i key={d} className="w-[3px] h-full rounded-full bg-secondary-400 animate-eq" style={{ animationDelay: `${d}s` }} />
            ))}
          </span>
        )}
      </div>

      {/* What was found on Instagram */}
      {shownStatus === "searching" && (
        <p className="flex items-center gap-2 text-[12px] text-muted"><Spinner className="w-3.5 h-3.5" />Finding it on Instagram...</p>
      )}
      {shownStatus === "matched" && o.track && (
        <div className="flex items-center gap-2.5 rounded-md bg-primary-600/10 border border-primary-500/40 px-3 py-2">
          <Check className="ic-sm w-4 h-4 text-primary-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <strong className="block text-[12.5px] truncate">{o.track.title} · {o.track.artist}</strong>
            <span className="block text-[11px] text-muted">
              {o.trackSource === "auto" ? "Matched on Instagram" : "Your choice"} · clip {mmss(o.clipStart)} to {mmss(o.clipStart + o.clipLen)}
            </span>
          </div>
          <button className="btn btn-sm btn-ghost shrink-0" onClick={change}><Settings2 className="ic-sm w-4 h-4" /><span>Change</span></button>
        </div>
      )}
      {shownStatus === "nomatch" && (
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <SearchX className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">Not found on Instagram's music library.</span>
          <button className="btn btn-sm btn-ghost" onClick={change}>Search manually</button>
        </p>
      )}
      {shownStatus === "error" && (
        <p className="text-[12px] text-danger leading-snug">
          {errMsg || "Could not search Instagram right now."}{" "}
          {/logged|session|log in/i.test(errMsg) && <Link to="/settings" className="underline font-semibold">Reconnect in Settings</Link>}
        </p>
      )}
      {!songAllowed && (
        <p className="text-[12px] text-muted leading-snug rounded-md bg-surface-2 border border-line px-3 py-2">
          Instagram can't add a song to a carousel, so this post will have no sound. For a song, set <strong className="text-fg">Post as</strong> to Slideshow Reel, or post a single picture.
        </p>
      )}
      {!igReady && song && <p className="text-[12px] text-muted">Connect Instagram in Settings to attach this song automatically.</p>}

      <label className={clsx("flex items-center gap-2 text-[12px] cursor-pointer select-none w-fit", auto ? "text-fg" : "text-muted")}>
        <input type="checkbox" checked={auto} onChange={toggleAuto} className="accent-primary-600 w-3.5 h-3.5" />
        Pick the AI's song automatically
      </label>
    </div>
  );
}
