import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { Check, CheckSquare, Download, FolderInput, FolderOpen, Image as ImageIcon, Send, Trash2, Video } from "lucide-react";
import { api } from "../api/client";
import Segmented from "../components/ui/Segmented";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import { useApp } from "../context/AppContext";
import { useConfirm } from "../context/ConfirmContext";
import { useStudio } from "../context/StudioContext";
import { useToast } from "../context/ToastContext";
import type { GalleryFile, GalleryListing } from "../api/types";
import { fileToResult } from "../utils/media";
import InstagramPosts from "../components/studio/InstagramPosts";
import MediaViewer from "../components/studio/MediaViewer";

type Filter = "all" | "video" | "image";
type Source = "vault" | "instagram";

export default function Gallery() {
  const { gallery, health, unassignedCount, unlinkedFolders, refreshAll, refreshGallery } = useApp();
  const { loadMedia } = useStudio();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [source, setSource] = useState<Source>("vault");

  // Which folder is shown: "" = the active account (kept up to date by the app), an account id, or "unassigned"
  const accounts = health?.keys.instagram.official_accounts ?? [];
  const activeId = (accounts.find((a) => a.default) ?? accounts[0])?.id ?? "";
  const [view, setView] = useState("");
  const [other, setOther] = useState<GalleryListing | null>(null);
  const [moving, setMoving] = useState<GalleryFile[] | null>(null);
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);
  const accName = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `@${a.username ?? a.id}` : id;
  };

  const loadOther = useCallback(async () => {
    if (!view) return setOther(null);
    try {
      setOther(await api.gallery(view));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [view, toast]);
  useEffect(() => {
    loadOther();
  }, [loadOther, gallery]);
  useEffect(() => {
    setView("");                                   // switching the active account in the top bar shows its folder
  }, [activeId]);

  const shown = view ? other?.files ?? [] : gallery;
  const customFolder = view.startsWith("folder:") ? view.slice(7) : "";
  const folderLabel = view === "unassigned" ? "Unassigned" : customFolder ? customFolder : accName(view || activeId);
  const [linkTo, setLinkTo] = useState("");
  useEffect(() => {
    setLinkTo(activeId);
  }, [customFolder, activeId]);
  const link = async () => {
    if (!customFolder || !linkTo) return;
    setBusy(true);
    try {
      await api.setIgAccountFolder(linkTo, customFolder);
      toast(`${customFolder} is now the folder of ${accName(linkTo)}`, "success");
      await refreshAll();
      setView(linkTo === activeId ? "" : linkTo);
      await refreshGallery();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const reloadAll = async () => {
    await refreshGallery();
    await loadOther();
  };

  const files = useMemo(
    () => shown.filter((f) => (filter === "video" ? f.is_video : filter === "image" ? !f.is_video : true)),
    [shown, filter],
  );

  // multi-select
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pickedFiles = useMemo(() => files.filter((f) => picked.has(f.path)), [files, picked]);
  useEffect(() => {
    setPicked(new Set());                         // a different folder or account starts a fresh selection
  }, [view, activeId]);
  useEffect(() => {
    setPicked((p) => {                            // forget files that no longer exist (moved, deleted)
      const keep = new Set([...p].filter((x) => files.some((f) => f.path === x)));
      return keep.size === p.size ? p : keep;
    });
  }, [files]);
  const toggle = (f: GalleryFile) =>
    setPicked((p) => {
      const n = new Set(p);
      if (!n.delete(f.path)) n.add(f.path);
      return n;
    });
  const endSelect = () => {
    setSelecting(false);
    setPicked(new Set());
  };

  // full view (the list it steps through is whatever is on screen: this folder, with the Reels / Images filter applied)
  const [viewing, setViewing] = useState<number | null>(null);
  const closeViewer = useCallback(() => setViewing(null), []);
  useEffect(() => {
    setViewing(null);
  }, [view, activeId, filter, source]);

  const open = (f: GalleryFile) => {
    loadMedia(fileToResult(f));
    navigate("/post");
  };

  const removeMany = async (items: GalleryFile[]) => {
    const ok = await confirm({
      title: `Delete ${items.length} file${items.length === 1 ? "" : "s"}?`,
      text: "They will be permanently removed from the output folder. This cannot be undone.",
    });
    if (!ok) return;
    setBusy(true);
    const results = await Promise.allSettled(items.map((f) => api.deleteMedia(f.path)));
    const failed = results.filter((r) => r.status === "rejected").length;
    toast(failed ? `${items.length - failed} deleted, ${failed} could not be deleted` : `${items.length} file${items.length === 1 ? "" : "s"} deleted`, failed ? "error" : "info");
    setBusy(false);
    setPicked(new Set());
    reloadAll();
  };

  const remove = async (f: GalleryFile) => {
    const ok = await confirm({ title: "Delete this file?", text: `${f.filename} will be permanently removed from the output folder.` });
    if (!ok) return;
    try {
      await api.deleteMedia(f.path);
      toast("File deleted", "info");
      reloadAll();
    } catch (e) {
      toast("Error deleting: " + (e as Error).message, "error");
    }
  };

  const startMove = (items: GalleryFile[]) => {
    setDest(view === "unassigned" ? activeId : "unassigned");
    setMoving(items);
  };
  const doMove = async () => {
    if (!moving || !dest) return;
    setBusy(true);
    try {
      const r = await api.moveMedia(moving.map((f) => f.path), dest);
      toast(`${r.moved} file${r.moved === 1 ? "" : "s"} moved to ${dest === "unassigned" ? "Unassigned" : accName(dest)}`, "success");
      setMoving(null);
      setPicked(new Set());
      await reloadAll();
    } catch (e) {
      toast("Could not move: " + (e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const destOptions = [
    ...accounts.map((a) => ({ value: a.id, label: `@${a.username ?? a.id}`, hint: a.default ? "Active account" : undefined })),
    { value: "unassigned", label: "Unassigned", hint: "Not tied to any account" },
  ].filter((o) => o.value !== (view || activeId));

  return (
    <div>
      <div className="flex justify-center mb-6">
        <Segmented<Source>
          value={source}
          onChange={setSource}
          options={[
            { value: "vault", label: "Vault files" },
            { value: "instagram", label: <><Send className="ic-sm w-4 h-4" />On Instagram</> },
          ]}
        />
      </div>

      {source === "instagram" ? <InstagramPosts /> : <>
      <div className="section-head">
        <div>
          <h2>Media Vault</h2>
          <p>
            {customFolder
              ? "A folder in the output folder that is not linked to any account yet."
              : view === "unassigned"
              ? "Older files that are not in any account folder. Move them to the account they belong to."
              : accounts.length
              ? <>Files saved in the folder of <strong className="text-fg font-semibold">{folderLabel}</strong>. Send to Post, move, download, or delete.</>
              : "Outputs from the output folder. Send to Post, download, or delete."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {accounts.length > 0 && (
          <Select
            variant="pill"
            ariaLabel="Folder to show"
            value={view || activeId}
            onChange={(v) => setView(v === activeId ? "" : v)}
            alignRight
            menuMinWidth={230}
            options={[
              ...accounts.map((a) => ({ value: a.id, label: `@${a.username ?? a.id}`, hint: a.default ? "Active account" : undefined })),
              { value: "unassigned", label: "Unassigned", hint: unassignedCount ? `${unassignedCount} older files` : "No files here" },
              ...unlinkedFolders.map((f) => ({ value: `folder:${f.name}`, label: f.name, hint: `${f.count} file${f.count === 1 ? "" : "s"}, not linked to an account` })),
            ]}
            renderValue={() => <span className="inline-flex items-center gap-2"><FolderOpen className="w-4 h-4" />{folderLabel}</span>}
          />
        )}
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "video", label: <><Video className="ic-sm w-4 h-4" />Reels</> },
            { value: "image", label: <><ImageIcon className="ic-sm w-4 h-4" />Images</> },
          ]}
        />
        {files.length > 0 && (
          <button className={selecting ? "btn btn-sm btn-primary" : "btn btn-sm btn-soft"} onClick={() => (selecting ? endSelect() : setSelecting(true))} aria-pressed={selecting}>
            <CheckSquare className="ic-sm w-4 h-4" /><span>{selecting ? "Done" : "Select"}</span>
          </button>
        )}
        </div>
      </div>

      {selecting && (
        <div className="sticky top-20 z-20 flex flex-wrap items-center gap-3 mb-5 px-4 py-3 rounded-md glass border border-line">
          <strong className="text-[13px]">{picked.size ? `${picked.size} selected` : "Tap files to select them"}</strong>
          <button className="btn btn-sm btn-ghost" onClick={() => setPicked(picked.size === files.length ? new Set() : new Set(files.map((f) => f.path)))}>
            {picked.size === files.length ? "Clear" : `Select all (${files.length})`}
          </button>
          <span className="flex-1" />
          {accounts.length > 0 && (
            <button className="btn btn-sm btn-soft" disabled={!picked.size || busy} onClick={() => startMove(pickedFiles)}>
              <FolderInput className="ic-sm w-4 h-4" /><span>Move</span>
            </button>
          )}
          <button className="btn btn-sm btn-danger" disabled={!picked.size || busy} onClick={() => removeMany(pickedFiles)}>
            {busy ? <Spinner /> : <Trash2 className="ic-sm w-4 h-4" />}<span>Delete</span>
          </button>
        </div>
      )}

      {customFolder && (
        <div className="flex flex-wrap items-center gap-3 mb-5 px-4 py-3 rounded-md bg-surface-2 border border-line">
          <span className="text-[13px] text-muted flex-1 min-w-[200px]">
            <strong className="text-fg">{customFolder}</strong> is not the folder of any account, so it only shows here. Link it to an account to make it that account&apos;s folder.
          </span>
          <div className="w-[220px]">
            <Select ariaLabel="Account to link" value={linkTo} onChange={setLinkTo} options={accounts.map((a) => ({ value: a.id, label: `@${a.username ?? a.id}`, hint: a.default ? "Active account" : undefined }))} />
          </div>
          <button className="btn btn-sm btn-primary" onClick={link} disabled={busy || !linkTo}>
            {busy ? <Spinner /> : <FolderOpen className="ic-sm w-4 h-4" />}<span>Link folder</span>
          </button>
        </div>
      )}

      {accounts.length > 0 && view !== "unassigned" && unassignedCount > 0 && (
        <button className="w-full text-left mb-5 px-4 py-3 rounded-md bg-surface-2 border border-line text-[13px] text-muted hover:border-primary-400/60 transition" onClick={() => setView("unassigned")}>
          <strong className="text-fg">{unassignedCount} older file{unassignedCount === 1 ? "" : "s"}</strong> are not in any account folder. Open Unassigned to move them.
        </button>
      )}
      {view === "unassigned" && shown.length > 0 && activeId && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 px-4 py-3 rounded-md bg-surface-2 border border-line">
          <span className="text-[13px] text-muted">These files were made before account folders existed.</span>
          <button className="btn btn-sm btn-soft" onClick={() => startMove(shown)}><FolderInput className="ic-sm w-4 h-4" /><span>Move all ({shown.length})</span></button>
        </div>
      )}

      {files.length === 0 ? (
        <div className="card">
          <EmptyState image="empty-gallery.svg" title="No media found" text={customFolder ? "This folder has no pictures or videos." : accounts.length ? `Nothing saved for ${folderLabel} yet. New generations are saved in the folder of the active account.` : "Head to the Studio and create your first AI generation."} action={<button className="btn btn-primary btn-sm" onClick={() => navigate("/studio")}>Open Studio</button>} />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
          <AnimatePresence>
            {files.map((f, i) => (
              <motion.div
                key={f.path}
                layout
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.4) }}
                onClick={(e) => {
                  if (selecting) return toggle(f);
                  if (!(e.target as HTMLElement).closest("button, a")) setViewing(i);   // the hover buttons keep their own action
                }}
                className={clsx(
                  "group bg-surface border rounded-lg overflow-hidden shadow-1 hover:shadow-3 hover:-translate-y-1 transition-[transform,box-shadow] duration-300 cursor-pointer",
                  picked.has(f.path) ? "border-primary-400 ring-2 ring-primary-400/70" : "border-line",
                )}
              >
                <div className="relative aspect-[3/4] bg-surface-2 overflow-hidden">
                  {selecting && (
                    <span
                      className={clsx(
                        "absolute top-3 right-3 z-20 grid place-items-center w-6 h-6 rounded-full border-2",
                        picked.has(f.path) ? "bg-primary-400 border-primary-400 text-neutral-950" : "bg-neutral-950/50 border-white/80 text-transparent",
                      )}
                      aria-hidden
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </span>
                  )}
                  <span className="absolute top-3 left-3 z-10 badge bg-neutral-950/65 text-white backdrop-blur">
                    {f.is_video ? <Video className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    {f.is_video ? "Reel" : "Image"}
                  </span>
                  {f.is_video ? (
                    <video src={f.url} muted loop playsInline className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" onMouseOver={(e) => e.currentTarget.play()} onMouseOut={(e) => e.currentTarget.pause()} />
                  ) : (
                    <img src={f.url} alt={f.filename} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  )}
                  <div className={clsx("absolute inset-x-0 bottom-0 flex gap-2 p-3 bg-gradient-to-t from-neutral-950/85 to-transparent translate-y-full group-hover:translate-y-0 focus-within:translate-y-0 transition-transform duration-300", selecting && "hidden")}>
                    <button className="btn btn-sm btn-glass flex-1" onClick={() => open(f)}><Send className="ic-sm w-4 h-4" /><span>Post</span></button>
                    {accounts.length > 0 && <button className="btn btn-sm btn-glass" onClick={() => startMove([f])} aria-label="Move to another folder"><FolderInput className="ic-sm w-4 h-4" /></button>}
                    <a className="btn btn-sm btn-glass" href={f.url} download={f.filename} aria-label="Download"><Download className="ic-sm w-4 h-4" /></a>
                    <button className="btn btn-sm btn-glass hover:!bg-danger" onClick={() => remove(f)} aria-label="Delete"><Trash2 className="ic-sm w-4 h-4" /></button>
                  </div>
                </div>
                <div className="p-4">
                  <strong className="block text-[13px] truncate" title={f.filename}>{f.filename}</strong>
                  <div className="flex justify-between text-[11px] text-dim mt-1">
                    <span>{f.size_mb} MB</span>
                    <span>{f.created_at}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      </>}

      <MediaViewer
        files={files}
        index={viewing}
        onIndex={setViewing}
        onClose={closeViewer}
        onPost={open}
        onMove={accounts.length > 0 ? (f) => startMove([f]) : undefined}
        onDelete={remove}
      />

      <Modal
        open={!!moving}
        onClose={() => !busy && setMoving(null)}
        title="Move to another folder"
        subtitle={moving ? `${moving.length} file${moving.length === 1 ? "" : "s"} selected` : undefined}
        icon={FolderInput}
        size="sm"
      >
        <span className="label">Destination</span>
        <Select ariaLabel="Destination folder" value={dest} onChange={setDest} options={destOptions} placeholder="Choose a folder" />
        <p className="hint mt-3">Scheduled posts that use these files keep working.</p>
        <div className="flex justify-end gap-2.5 mt-6">
          <button className="btn btn-ghost" onClick={() => setMoving(null)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={doMove} disabled={busy || !dest}>
            {busy ? <Spinner /> : <FolderInput className="ic" />}<span>Move</span>
          </button>
        </div>
      </Modal>
    </div>
  );
}
