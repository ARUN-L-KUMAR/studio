import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Film, FolderOpen, Image as ImageIcon, Instagram, Smartphone, Sliders, Video, X, Zap } from "lucide-react";
import clsx from "clsx";
import PhoneSimulator from "../components/studio/PhoneSimulator";
import CaptionStudio from "../components/studio/CaptionStudio";
import PostOptions from "../components/studio/PostOptions";
import ScheduleModal from "../components/studio/ScheduleModal";
import Reveal from "../components/ui/Reveal";
import Select from "../components/ui/Select";
import { useApp } from "../context/AppContext";
import { useStudio, type PostOptions as Opts } from "../context/StudioContext";
import { useToast } from "../context/ToastContext";
import { api } from "../api/client";
import type { GalleryFile, GalleryListing } from "../api/types";
import StatusBadges from "../components/vault/StatusBadges";
import { fileToResult } from "../utils/media";

const MAX_ITEMS = 10;

export default function Post() {
  const { media, showMedia, setCaption, setSong, postOpts, setPostOpts } = useStudio();
  const { gallery, galleryMeta, config, health, unlinkedFolders, unassignedCount } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const dry = config?.instagram.dry_run ?? true;
  const sessionExpired = !!health?.keys.instagram.session_expired;
  const official = !!health?.keys.instagram.official_api;
  const accountList = health?.keys.instagram.official_accounts ?? [];
  const igReady = official || (!!health?.keys.instagram.configured && !sessionExpired);
  const files = postOpts.files;

  // Which Vault folder the pictures below come from: "" = the active account's folder, an account id, "folder:<name>" or "unassigned"
  const activeId = (accountList.find((a) => a.default) ?? accountList[0])?.id ?? "";
  const [pickScope, setPickScope] = useState("");
  const [other, setOther] = useState<GalleryListing | null>(null);
  useEffect(() => {
    setPickScope("");                               // switching the active account starts from its folder again
  }, [activeId]);
  useEffect(() => {
    if (!pickScope) return setOther(null);
    let live = true;
    api.gallery(pickScope).then((l) => live && setOther(l)).catch(() => live && setOther(null));
    return () => {
      live = false;
    };
  }, [pickScope, gallery]);
  const folderFiles = pickScope ? (other && other.scope === pickScope ? other.files : []) : gallery;
  const folderLocked = pickScope ? !!other?.locked : !!galleryMeta?.locked;
  const locks = galleryMeta?.locks ?? {};
  const accFolder = (id: string) => (galleryMeta?.account_folders?.[id]?.folder ? `folder ${galleryMeta.account_folders[id].folder}` : undefined);
  const folderOptions = [
    ...accountList.filter((a) => a.id === activeId).map((a) => ({ value: "", label: `@${a.username ?? a.id}`, hint: ["Active account", accFolder(a.id)].filter(Boolean).join(" · "), disabled: locks[a.id] === "locked" })),
    ...accountList.filter((a) => a.id !== activeId).map((a) => ({ value: a.id, label: `@${a.username ?? a.id}`, hint: locks[a.id] === "locked" ? "Locked: unlock it in the Vault" : accFolder(a.id), disabled: locks[a.id] === "locked" })),
    ...(unassignedCount ? [{ value: "unassigned", label: "Unassigned", hint: `${unassignedCount} older file${unassignedCount === 1 ? "" : "s"}` }] : []),
    ...unlinkedFolders.map((f) => ({
      value: `folder:${f.name}`, label: f.name, disabled: locks[`folder:${f.name}`] === "locked",
      hint: locks[`folder:${f.name}`] === "locked" ? "Locked: unlock it in the Vault" : `Custom folder · ${f.count} file${f.count === 1 ? "" : "s"}`,
    })),
  ];
  const folderLabel = folderOptions.find((o) => o.value === pickScope)?.label ?? "this folder";

  // pictures that are selected but live in another folder than the one being listed (they stay selected when you switch folders)
  const outside = files.filter((f) => !folderFiles.some((g) => g.url === f.url));
  const strip = [...outside, ...folderFiles];
  const outsideNote = outside.length ? ` ${outside.length === 1 ? "1 is" : `${outside.length} are`} from another folder, shown first.` : "";

  // Arriving from the Studio / Vault / Queue with one item: start with it selected
  useEffect(() => {
    if (files.length || !media) return;
    const match = gallery.find((f) => f.url === media.media_url);
    if (match) setPostOpts({ files: [match] });
  }, [media, gallery, files.length, setPostOpts]);

  const toggle = (f: GalleryFile) => {
    const has = files.some((x) => x.url === f.url);
    if (!has && files.length >= MAX_ITEMS) return toast(`Instagram allows up to ${MAX_ITEMS} items in one post`, "info");
    const next = has ? files.filter((x) => x.url !== f.url) : [...files, f];
    applySelection(next);
  };

  const applySelection = (next: GalleryFile[]) => {
    const patch: Partial<Opts> = { files: next };
    // Keep the options consistent with what is selected
    if (next.some((x) => x.is_video) && postOpts.format === "slideshow") patch.format = "carousel";
    if (next.length > 1 && (patch.format ?? postOpts.format) === "carousel" && postOpts.audio !== "none") patch.audio = "none";
    // a carousel can only hold pictures
    if (next.length > 1 && next.some((x) => x.is_video) && (patch.format ?? postOpts.format) === "carousel") {
      if (!official) toast("Videos in a carousel need the Instagram API. Set it up in Settings, or use pictures only.", "info");
    }
    setPostOpts(patch);
    if (next[0]) {
      const r = fileToResult(next[0]);
      if (!media) {
        setCaption(r.caption);
        setSong(r.song);
      }
      if (media?.media_url !== r.media_url) showMedia(r);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= files.length) return;
    const next = [...files];
    [next[i], next[j]] = [next[j], next[i]];
    applySelection(next);
  };

  const trySchedule = () => {
    if (!media) return toast("Please choose media first", "error");
    if (postOpts.audio !== "none") {
      return toast("A scheduled post can't have a song. Set Sound to No sound, or use Publish Now.", "info");
    }
    if (files.length > 1 && postOpts.format === "slideshow") {
      return toast("Scheduled posts of several items are posted as a carousel. Switch Post as to Carousel.", "info");
    }
    setScheduleOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Status strip */}
      <Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={clsx("card !p-4 flex items-center gap-3.5", igReady ? "" : "!border-danger/40")}>
            <span className={clsx("grid place-items-center w-10 h-10 rounded-md", igReady ? "bg-primary-600/15 text-primary-400" : "bg-danger/15 text-danger")}>
              <Instagram className="ic" />
            </span>
            <div className="flex-1 min-w-0">
              <strong className="block text-[14px]">{official ? "Instagram API connected" : igReady ? "Instagram connected" : sessionExpired ? "Instagram session expired" : "Instagram not connected"}</strong>
              <span className="block text-[12px] text-dim truncate">{official ? (accountList.length > 1 ? "Posts go to the active account (top bar). Pick another here for this post only. Songs post to the browser-login account." : "Posts photos, Reels and carousels with your access token. Songs use your browser session.") : igReady ? health?.keys.instagram.preview : sessionExpired ? "Instagram logged you out. Paste a fresh session ID in Settings." : "Add your login or session ID before publishing."}</span>
            </div>
            {!igReady && <Link to="/settings" className="btn btn-sm btn-secondary">{sessionExpired ? "Reconnect" : "Connect"}</Link>}
            {official && accountList.length > 0 && (
              <Select
                ariaLabel="Post to account"
                className="!w-[190px] !py-2 text-[13px]"
                alignRight
                menuMinWidth={230}
                value={postOpts.account || accountList.find((a) => a.default)?.id || ""}
                onChange={(v) => setPostOpts({ account: v })}
                options={accountList.map((a) => ({
                  value: a.id,
                  label: `@${a.username ?? a.id}`,
                  hint: a.default ? "Active account" : "This post only",
                }))}
              />
            )}
          </div>
          <div className="card !p-4 flex items-center gap-3.5">
            <span className={clsx("grid place-items-center w-10 h-10 rounded-md", dry ? "bg-primary-600/15 text-primary-400" : "bg-danger/15 text-danger")}>
              {dry ? <CheckCircle2 className="ic" /> : <AlertTriangle className="ic" />}
            </span>
            <div className="flex-1 min-w-0">
              <strong className="block text-[14px]">{dry ? "Dry run is on" : "Live publishing is on"}</strong>
              <span className="block text-[12px] text-dim">{dry ? "Publish Now only tests the flow. Nothing is posted." : "Publish Now will post to your real account."}</span>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Media picker (multi-select) */}
      <Reveal>
        <div className="card">
          <div className="card-head !mb-4">
            <div>
              <h3 className="card-title"><Film className="ic" />Choose media</h3>
              <p className="card-sub">
                {files.length > 1
                  ? `${files.length} items selected. They are posted in this order.${outsideNote}`
                  : `Tap items to select. Choose several to make one carousel or slideshow.${outsideNote}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {accountList.length > 0 && (
                <Select
                  variant="pill"
                  ariaLabel="Folder to pick pictures from"
                  value={pickScope}
                  onChange={setPickScope}
                  options={folderOptions}
                  alignRight
                  menuMinWidth={250}
                  renderValue={() => <span className="inline-flex items-center gap-2"><FolderOpen className="w-4 h-4" />{folderLabel}</span>}
                />
              )}
              {files.length > 0 && (
                <button className="btn btn-sm btn-ghost" onClick={() => setPostOpts({ files: [] })}>Clear</button>
              )}
              <button className="btn btn-sm btn-soft" onClick={() => navigate("/studio")}>
                <Zap className="ic-sm w-4 h-4" /><span>Open Studio</span>
              </button>
            </div>
          </div>

          {strip.length === 0 ? (
            folderLocked ? (
              <p className="text-[13px] text-muted py-6 text-center">
                This folder is locked. <button className="underline text-primary-400" onClick={() => navigate("/gallery")}>Open the Vault</button> and enter its PIN to use its files.
              </p>
            ) : (
              <p className="text-[13px] text-muted py-6 text-center">
                {pickScope ? `There are no pictures in ${folderLabel} yet. Upload some in the Vault, or choose another folder.` : "The vault is empty. Generate your first image or Reel in the Studio."}
              </p>
            )
          ) : (
            // extra room around the row, so a chosen picture's glow and slight enlargement are not cut off at the edges
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-3 px-3 -mt-2 pt-3 pb-3" aria-label="Pictures to choose from">
              {strip.map((f, i) => {
                const order = files.findIndex((x) => x.url === f.url);
                const active = order > -1;
                return (
                  <Fragment key={f.path}>
                    {i === outside.length && outside.length > 0 && folderFiles.length > 0 && <div aria-hidden className="w-px self-stretch bg-line mx-1 shrink-0" />}
                  <button
                    onClick={() => toggle(f)}
                    title={f.filename}
                    aria-pressed={active}
                    className={clsx(
                      "relative shrink-0 w-[92px] h-[128px] rounded-md overflow-hidden border-2 transition",
                      active ? "border-primary-500 shadow-glow scale-[1.03]" : "border-transparent hover:border-primary-500/50",
                    )}
                  >
                    {f.is_video ? (
                      <video src={f.url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                    ) : (
                      <img src={f.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    )}
                    {/* Posted / Uploaded icons, top-right (below the selection number when the picture is chosen) */}
                    <div className={clsx("absolute right-1.5 flex flex-col items-end gap-1", active ? "top-8" : "top-1.5")}>
                      <StatusBadges file={f} size="sm" />
                    </div>
                    <span className="absolute top-1.5 left-1.5 grid place-items-center w-5 h-5 rounded-full bg-neutral-950/70 text-white">
                      {f.is_video ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                    </span>
                    {active && (
                      <span className="absolute top-1.5 right-1.5 grid place-items-center min-w-[22px] h-[22px] px-1 rounded-full bg-brand text-neutral-950 text-[11px] font-bold shadow-glow">
                        {order + 1}
                      </span>
                    )}
                  </button>
                  </Fragment>
                );
              })}
            </div>
          )}

          {files.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={f.url} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 pl-3 pr-1 py-1 text-[12px]">
                  <strong className="text-primary-400">{i + 1}</strong>
                  <span className="max-w-[110px] truncate text-muted">{f.filename}</span>
                  <button className="p-1 rounded-full hover:bg-surface-3 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier"><ArrowLeft className="w-3.5 h-3.5" /></button>
                  <button className="p-1 rounded-full hover:bg-surface-3 disabled:opacity-30" disabled={i === files.length - 1} onClick={() => move(i, 1)} aria-label="Move later"><ArrowRight className="w-3.5 h-3.5" /></button>
                  <button className="p-1 rounded-full hover:bg-danger/20 hover:text-danger" onClick={() => toggle(f)} aria-label="Remove"><X className="w-3.5 h-3.5" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Reveal>

      {/* Format and sound */}
      <Reveal>
        <div className="card" id="format-sound">
          <div className="card-head !mb-4">
            <div>
              <h3 className="card-title"><Sliders className="ic" />Format and sound</h3>
              <p className="card-sub">Choose how several items are posted and add a song.</p>
            </div>
          </div>
          <PostOptions />
        </div>
      </Reveal>

      {/* Preview and publish */}
      <Reveal>
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title"><Smartphone className="ic" />Preview and Post</h3>
              <p className="card-sub">See exactly how it looks, edit the caption, then publish or schedule.</p>
            </div>
            {media && (
              <span className="badge badge-primary hidden sm:inline-flex">
                {files.length > 1 ? `${files.length} items` : media.is_video ? "Reel" : "Photo"}
              </span>
            )}
          </div>
          <div className="flex flex-col md:flex-row gap-8 items-stretch">
            <PhoneSimulator />
            <CaptionStudio onSchedule={trySchedule} />
          </div>
        </div>
      </Reveal>

      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </div>
  );
}
