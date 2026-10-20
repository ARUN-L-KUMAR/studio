import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { Check, CheckCircle2, CheckSquare, Download, Unlink, FolderInput, FolderOpen, FolderPlus, Image as ImageIcon, KeyRound, Lock, LockOpen, Send, Trash2, Upload, UploadCloud, Video } from "lucide-react";
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
import { LockedCard, NewFolderModal, PinModal } from "../components/studio/FolderDialogs";
import UploadModal from "../components/vault/UploadModal";
import StatusBadges from "../components/vault/StatusBadges";

type Filter = "all" | "video" | "image";
type StatusFilter = "all" | "unposted" | "posted" | "uploaded";
type Source = "vault" | "instagram";

export default function Gallery() {
  const { gallery, galleryMeta, health, unassignedCount, unlinkedFolders, refreshAll, refreshGallery } = useApp();
  const { loadMedia, setTask, setUpload } = useStudio();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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

  const current = view ? (other && other.scope === view ? other : null) : galleryMeta;     // ignore a listing of the folder we just left
  const shown = view ? current?.files ?? [] : gallery;
  const curFolder = current?.folder ?? "";                // real folder name; "" for Unassigned
  const isProtected = !!current?.protected;
  const isLocked = !!current?.locked;
  const locks = galleryMeta?.locks ?? {};
  // "folder Taniyaa" for an account that uses a linked custom folder
  const linkedNote = (id: string) => {
    const f = galleryMeta?.account_folders?.[id];
    return f?.linked ? `folder ${f.folder}` : "";
  };
  const lockIcon = (key: string) =>
    locks[key] ? (locks[key] === "locked" ? <Lock className="w-3.5 h-3.5 shrink-0 text-muted" /> : <LockOpen className="w-3.5 h-3.5 shrink-0 text-primary-400" />) : undefined;
  const [pinOpen, setPinOpen] = useState(false);
  const [newFolder, setNewFolder] = useState<null | "page" | "move">(null);   // "move": opened from the Move dialog
  const customFolder = view.startsWith("folder:") ? view.slice(7) : "";
  const folderLabel = view === "unassigned" ? "Unassigned" : customFolder ? customFolder : accName(view || activeId);
  const [linkTo, setLinkTo] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  useEffect(() => {
    setLinkTo(activeId);
    setLinkOpen(false);
  }, [customFolder, activeId]);
  const link = async () => {
    if (!customFolder || !linkTo) return;
    setBusy(true);
    try {
      await api.setIgAccountFolder(linkTo, customFolder);
      toast(`${customFolder} is now the folder of ${accName(linkTo)}`, "success");
      setLinkOpen(false);
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

  const lockNow = async () => {
    if (!curFolder) return;
    try {
      await api.lockFolder(curFolder);
      endSelect();
      await reloadAll();
      toast(`${curFolder} is locked`, "info");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  // undo "Link folder": the account goes back to its own folder; this one is a plain custom folder again
  const unlink = async () => {
    const id = current?.account_id;
    if (!id) return;
    const who = accName(id);
    const ok = await confirm({
      title: "Unlink this folder?",
      text: `“${curFolder}” stops being the folder of ${who}. Its files stay exactly where they are and it becomes a custom folder again. ${who} goes back to saving new files in its own folder${current?.default_folder ? ` (“${current.default_folder}”)` : ""}.`,
      confirmLabel: "Unlink",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.unlinkIgAccountFolder(id);
      await refreshAll();
      await refreshGallery();
      setView(`folder:${r.previous}`);               // keep looking at the folder that was just freed
      toast(`Unlinked. “${r.previous}” is a custom folder again, and ${who} now uses “${r.folder}”.`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const folderCreated = async (name: string) => {
    await refreshGallery();
    if (newFolder === "move") setDest(`folder:${name}`);
    else setView(`folder:${name}`);
    setNewFolder(null);
  };
  const deleteFolder = async () => {
    if (!customFolder) return;
    const ok = await confirm({ title: "Delete this folder?", text: `“${customFolder}” is empty and will be removed.` });
    if (!ok) return;
    try {
      await api.deleteFolder(customFolder);
      toast("Folder deleted", "info");
      setView("");
      await refreshGallery();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  // what the Reels / Images filter leaves, then the Posted / Uploaded filter on top of it
  const byType = useMemo(() => shown.filter((f) => (filter === "video" ? f.is_video : filter === "image" ? !f.is_video : true)), [shown, filter]);
  const statusCount = useMemo(
    () => ({ all: byType.length, unposted: byType.filter((f) => !f.posted).length, posted: byType.filter((f) => f.posted).length, uploaded: byType.filter((f) => f.uploaded).length }),
    [byType],
  );
  const files = useMemo(
    () => byType.filter((f) => (statusFilter === "unposted" ? !f.posted : statusFilter === "posted" ? f.posted : statusFilter === "uploaded" ? f.uploaded : true)),
    [byType, statusFilter],
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

  // label files as posted / not posted by hand (pictures that were posted before the Vault kept track)
  const markMany = async (items: GalleryFile[], posted: boolean) => {
    setBusy(true);
    try {
      const r = await api.markPosted(items.map((f) => f.path), posted);
      toast(`${r.changed} file${r.changed === 1 ? "" : "s"} marked as ${posted ? "posted" : "not posted"}`, "success");
      setPicked(new Set());
      await reloadAll();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
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
      toast(`${r.moved} file${r.moved === 1 ? "" : "s"} moved to ${dest === "unassigned" ? "Unassigned" : dest.startsWith("folder:") ? dest.slice(7) : accName(dest)}`, "success");
      setMoving(null);
      setPicked(new Set());
      await reloadAll();
    } catch (e) {
      toast("Could not move: " + (e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const allDestinations = [
    ...accounts.map((a) => ({
      value: a.id, label: `@${a.username ?? a.id}`, leading: lockIcon(a.id),
      hint: locks[a.id] === "locked" ? "Locked: unlock it first" : [a.default ? "Active account" : "", linkedNote(a.id)].filter(Boolean).join(" · ") || undefined, disabled: locks[a.id] === "locked",
    })),
    ...unlinkedFolders.map((f) => ({
      value: `folder:${f.name}`, label: f.name, leading: lockIcon(`folder:${f.name}`),
      hint: locks[`folder:${f.name}`] === "locked" ? "Locked: unlock it first" : "Custom folder", disabled: locks[`folder:${f.name}`] === "locked",
    })),
    { value: "unassigned", label: "Unassigned", hint: "Not tied to any account" },
  ];
  const destOptions = allDestinations.filter((o) => o.value !== (view || activeId));

  // upload pictures / videos into the Vault: from the Upload button, or by dropping files anywhere on the page
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const openUpload = (files: File[] = []) => {
    setUploadFiles(files);
    setUploadOpen(true);
  };
  const uploadScope = view || (accounts.length ? activeId : "unassigned");
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  // "Generate": send the picture or clip to the Studio as the input of a new generation
  const useAsInput = async (f: GalleryFile) => {
    try {
      const blob = await (await fetch(f.url)).blob();
      setUpload(f.is_video ? "video" : "image", new File([blob], f.filename, { type: blob.type }));
      setTask(f.is_video ? "video_to_video" : "image_to_video");
      navigate("/studio");
    } catch {
      toast("Could not open this file in the Studio.", "error");
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (source !== "vault" || isLocked || !hasFiles(e)) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDragging(false);
      }}
      onDrop={(e) => {
        if (source !== "vault" || isLocked || !hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        openUpload(Array.from(e.dataTransfer.files));
      }}
    >
      {dragging && (
        <div aria-hidden className="pointer-events-none fixed inset-3 z-[80] grid place-items-center rounded-2xl border-4 border-dashed border-primary-400 bg-primary-950/70 backdrop-blur-sm text-center">
          <div>
            <UploadCloud className="w-14 h-14 mx-auto text-primary-300" />
            <strong className="block text-[20px] mt-3 text-white">Drop to add to {allDestinations.find((d) => d.value === (view || activeId))?.label ?? folderLabel}</strong>
            <span className="text-[14px] text-white/80">Pictures and videos</span>
          </div>
        </div>
      )}
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
              ? "A custom folder. Move files into it from any other folder, and protect it with a PIN if you like."
              : view === "unassigned"
              ? "Older files that are not in any account folder. Move them to the account they belong to."
              : accounts.length
              ? <>Files saved in the folder of <strong className="text-fg font-semibold">{folderLabel}</strong>. Send to Post, move, download, or delete.</>
              : "Outputs from the output folder. Send to Post, download, or delete."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full">
        {files.length > 0 && (
          <button
            className={selecting ? "btn btn-sm btn-primary !px-2.5" : "btn btn-sm btn-soft !px-2.5"}
            onClick={() => (selecting ? endSelect() : setSelecting(true))}
            aria-pressed={selecting}
            aria-label={selecting ? "Done selecting" : "Select files"}
            title={selecting ? "Done selecting" : "Select files"}
          >
            <CheckSquare className="ic-sm w-4 h-4" />
          </button>
        )}
        {accounts.length > 0 && (
          <Select
            variant="pill"
            ariaLabel="Folder to show"
            value={view || activeId}
            onChange={(v) => setView(v === activeId ? "" : v)}
            menuMinWidth={230}
            options={[
              ...accounts.map((a) => ({
                value: a.id, label: `@${a.username ?? a.id}`, leading: lockIcon(a.id),
                hint: locks[a.id] === "locked" ? "Locked · PIN needed" : [a.default ? "Active account" : "", linkedNote(a.id)].filter(Boolean).join(" · ") || undefined,
              })),
              { value: "unassigned", label: "Unassigned", hint: unassignedCount ? `${unassignedCount} older files` : "No files here" },
              ...unlinkedFolders.map((f) => ({
                value: `folder:${f.name}`, label: f.name, leading: lockIcon(`folder:${f.name}`),
                hint: locks[`folder:${f.name}`] === "locked" ? "Locked · PIN needed" : `Custom folder · ${f.count} file${f.count === 1 ? "" : "s"}`,
              })),
            ]}
            renderValue={() => (
              <span className="inline-flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />{folderLabel}
                {isProtected && (isLocked ? <Lock className="w-3.5 h-3.5 text-muted" /> : <LockOpen className="w-3.5 h-3.5 text-primary-400" />)}
              </span>
            )}
          />
        )}
        <button className="btn btn-sm btn-primary" onClick={() => openUpload()} disabled={isLocked} title={isLocked ? "Unlock this folder first" : "Add pictures or videos to the Vault"}>
          <Upload className="ic-sm w-4 h-4" /><span>Upload</span>
        </button>
        {accounts.length > 0 && (
          <button className="btn btn-sm btn-soft" onClick={() => setNewFolder("page")}>
            <FolderPlus className="ic-sm w-4 h-4" /><span>New folder</span>
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
        {customFolder && accounts.length > 0 && (
          // used to be a banner above the pictures, which pushed them down; now a button whose tooltip says the same
          <span className="relative group inline-flex">
            <button className="btn btn-sm btn-soft" onClick={() => setLinkOpen(true)} aria-label="Link to account">
              <FolderOpen className="ic-sm w-4 h-4" /><span>Link</span>
            </button>
            <span role="tooltip" className="pointer-events-none absolute left-0 top-full mt-2 z-30 w-72 px-3 py-2 rounded-md glass border border-line text-[12.5px] leading-snug text-fg opacity-0 -translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition duration-150">
              <strong>{customFolder}</strong> is a custom folder. Link it to an account to make it that account&apos;s folder, so new generations are saved in it.
            </span>
          </span>
        )}
        {current?.linked && current.account_id && (
          <button className="btn btn-sm btn-soft" onClick={unlink} disabled={busy} aria-label="Unlink folder" title={`Stop using “${curFolder}” as the folder of ${accName(current.account_id)}`}>
            <Unlink className="ic-sm w-4 h-4" /><span>Unlink</span>
          </button>
        )}
        {curFolder && !isProtected && (
          <button className="btn btn-sm btn-soft !px-2.5" onClick={() => setPinOpen(true)} aria-label="Add PIN" title="Add PIN: ask for a PIN before this folder opens">
            <Lock className="ic-sm w-4 h-4" />
          </button>
        )}
        {curFolder && isProtected && !isLocked && (
          <>
            <button className="btn btn-sm btn-soft !px-2.5" onClick={lockNow} aria-label="Lock now" title="Lock now"><Lock className="ic-sm w-4 h-4" /></button>
            <button className="btn btn-sm btn-soft" onClick={() => setPinOpen(true)} aria-label="Change or remove PIN" title="Change or remove PIN"><KeyRound className="ic-sm w-4 h-4" /></button>
          </>
        )}
        <Segmented<Filter>
          ariaLabel="Show by type"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "video", label: <><Video className="ic-sm w-4 h-4" />Reels</> },
            { value: "image", label: <><ImageIcon className="ic-sm w-4 h-4" />Images</> },
          ]}
        />
        <Select
          variant="box"
          ariaLabel="Show by status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          alignRight
          menuMinWidth={210}
          options={[
            { value: "all", label: "All files", hint: `${statusCount.all}` },
            { value: "unposted", label: "Not posted yet", hint: `${statusCount.unposted}` },
            { value: "posted", label: "Posted", hint: `${statusCount.posted}` },
            { value: "uploaded", label: "Uploaded by you", hint: `${statusCount.uploaded}` },
          ]}
          renderValue={(o) => <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="ic-sm w-4 h-4" />{o?.label ?? "All files"}</span>}
        />
        </div>
        </div>
      </div>

      {selecting && (
        <div className="sticky top-20 z-20 flex flex-wrap items-center gap-3 mb-5 px-4 py-3 rounded-md glass border border-line">
          <strong className="text-[13px]">{picked.size ? `${picked.size} selected` : "Tap files to select them"}</strong>
          <button className="btn btn-sm btn-ghost" onClick={() => setPicked(picked.size === files.length ? new Set() : new Set(files.map((f) => f.path)))}>
            {picked.size === files.length ? "Clear" : `Select all (${files.length})`}
          </button>
          <span className="flex-1" />
          <button className="btn btn-sm btn-soft" disabled={!picked.size || busy} onClick={() => markMany(pickedFiles, true)} title="Label the selected files as posted">
            <CheckCircle2 className="ic-sm w-4 h-4" /><span>Mark posted</span>
          </button>
          <button className="btn btn-sm btn-soft" disabled={!picked.size || busy} onClick={() => markMany(pickedFiles, false)} title="Remove the Posted label from the selected files">
            <span>Not posted</span>
          </button>
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

      {view === "unassigned" && shown.length > 0 && activeId && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 px-4 py-3 rounded-md bg-surface-2 border border-line">
          <span className="text-[13px] text-muted">These files were made before account folders existed.</span>
          <button className="btn btn-sm btn-soft" onClick={() => startMove(shown)}><FolderInput className="ic-sm w-4 h-4" /><span>Move all ({shown.length})</span></button>
        </div>
      )}

      {isLocked ? (
        <LockedCard folder={curFolder} onUnlocked={reloadAll} />
      ) : files.length === 0 && shown.length > 0 ? (
        <div className="card text-center py-12">
          <strong className="block text-[16px]">No files match this filter</strong>
          <p className="text-[14px] text-muted mt-1 mb-4">{shown.length} file{shown.length === 1 ? "" : "s"} in this folder are hidden by the {statusFilter !== "all" ? "status" : "type"} filter.</p>
          <button className="btn btn-soft btn-sm" onClick={() => { setStatusFilter("all"); setFilter("all"); }}>Show all files</button>
        </div>
      ) : files.length === 0 ? (
        <div className="card">
          <EmptyState
            image="empty-gallery.svg"
            title="No media found"
            text={customFolder ? "This folder has no pictures or videos. Select files in another folder and use Move to bring them here." : accounts.length ? `Nothing saved for ${folderLabel} yet. New generations are saved in the folder of the active account.` : "Head to the Studio and create your first AI generation."}
            action={
              <div className="flex flex-wrap justify-center gap-2.5">
                <button className="btn btn-primary btn-sm" onClick={() => openUpload()}><Upload className="ic-sm w-4 h-4" /><span>Upload pictures</span></button>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate("/studio")}>Open Studio</button>
                {customFolder && shown.length === 0 && <button className="btn btn-ghost btn-sm" onClick={deleteFolder}><Trash2 className="ic-sm w-4 h-4" /><span>Delete folder</span></button>}
              </div>
            }
          />
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
                  {/* Posted / Uploaded icons: top-right corner (just below the tick circle while selecting) */}
                  <div className={clsx("absolute right-3 z-10 flex flex-col items-end gap-1.5", selecting ? "top-12" : "top-3")}>
                    <StatusBadges file={f} />
                  </div>
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
        onUse={useAsInput}
        onDelete={remove}
      />

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        initialFiles={uploadFiles}
        scope={uploadScope}
        destinations={allDestinations}
        onUploaded={() => reloadAll()}
      />

      <Modal
        open={!!moving && newFolder !== "move"}
        onClose={() => !busy && setMoving(null)}
        title="Move to another folder"
        subtitle={moving ? `${moving.length} file${moving.length === 1 ? "" : "s"} selected` : undefined}
        icon={FolderInput}
        size="sm"
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="label !mb-0">Destination</span>
          <button className="btn btn-sm btn-ghost !px-2" onClick={() => setNewFolder("move")} disabled={busy}>
            <FolderPlus className="ic-sm w-4 h-4" /><span>New folder</span>
          </button>
        </div>
        <Select ariaLabel="Destination folder" value={dest} onChange={setDest} options={destOptions} placeholder="Choose a folder" />
        <p className="hint mt-3">Scheduled posts that use these files keep working.</p>
        <div className="flex justify-end gap-2.5 mt-6">
          <button className="btn btn-ghost" onClick={() => setMoving(null)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={doMove} disabled={busy || !dest}>
            {busy ? <Spinner /> : <FolderInput className="ic" />}<span>Move</span>
          </button>
        </div>
      </Modal>

      <Modal
        open={linkOpen && !!customFolder}
        onClose={() => !busy && setLinkOpen(false)}
        title="Link folder to an account"
        subtitle={customFolder}
        icon={FolderOpen}
        size="sm"
      >
        <span className="label">Account</span>
        <Select ariaLabel="Account to link" value={linkTo} onChange={setLinkTo} options={accounts.map((a) => ({ value: a.id, label: `@${a.username ?? a.id}`, hint: a.default ? "Active account" : undefined }))} />
        <p className="hint mt-3">New generations for that account are saved in this folder. Its files stay where they are, and you can unlink it again any time.</p>
        <div className="flex justify-end gap-2.5 mt-6">
          <button className="btn btn-ghost" onClick={() => setLinkOpen(false)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={link} disabled={busy || !linkTo}>
            {busy ? <Spinner /> : <FolderOpen className="ic" />}<span>Link folder</span>
          </button>
        </div>
      </Modal>

      <NewFolderModal open={newFolder !== null} onClose={() => setNewFolder(null)} onCreated={folderCreated} />
      <PinModal
        open={pinOpen && !!curFolder}
        onClose={() => setPinOpen(false)}
        folder={curFolder}
        isProtected={isProtected}
        onDone={async () => {
          setPinOpen(false);
          await reloadAll();
        }}
      />
    </div>
  );
}
