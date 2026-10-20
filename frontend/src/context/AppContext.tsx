import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { AppConfig, FolderInfo, GalleryFile, GalleryListing, Health, QueueJob } from "../api/types";
import { useToast } from "./ToastContext";

interface AppState {
  health: Health | null;
  config: AppConfig | null;
  queue: QueueJob[];
  gallery: GalleryFile[];
  /** Account whose files `gallery` holds, and how many files belong to no account yet */
  galleryAccount: string | null;
  unassignedCount: number;
  /** Custom folders in output/ (made here or by hand) that belong to no account */
  unlinkedFolders: FolderInfo[];
  /** Folder name, PIN state and the rest of the last listing of the active account's folder */
  galleryMeta: GalleryListing | null;
  /** False until the first vault listing has arrived (so the dashboard can show skeletons) */
  galleryLoaded: boolean;
  online: boolean;
  /** Quiet refresh of health and queue, for pages that poll */
  refreshLive: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshQueue: () => Promise<void>;
  refreshGallery: () => Promise<void>;
  setConfig: (c: AppConfig) => void;
  toggleDryRun: () => Promise<void>;
}

const Ctx = createContext<AppState>(null as unknown as AppState);

export function AppProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [health, setHealth] = useState<Health | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [queue, setQueue] = useState<QueueJob[]>([]);
  const [gallery, setGallery] = useState<GalleryFile[]>([]);
  const [galleryAccount, setGalleryAccount] = useState<string | null>(null);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [unlinkedFolders, setUnlinkedFolders] = useState<FolderInfo[]>([]);
  const [galleryMeta, setGalleryMeta] = useState<GalleryListing | null>(null);
  const [online, setOnline] = useState(true);
  const [galleryLoaded, setGalleryLoaded] = useState(false);

  const refreshAll = useCallback(async () => {
    try {
      const [h, c] = await Promise.all([api.health(), api.config()]);
      setHealth(h);
      setConfig(c);
      setOnline(true);
    } catch (e) {
      setOnline(false);
      toast("Server connection error: " + (e as Error).message, "error");
    }
  }, [toast]);

  const refreshQueue = useCallback(async () => {
    try {
      setQueue((await api.queue()).jobs ?? []);
    } catch {
      /* surfaced by health check */
    }
  }, []);

  const refreshGallery = useCallback(async () => {
    try {
      const g = await api.gallery();
      setGallery(g.files ?? []);
      setGalleryAccount(g.account);
      setUnassignedCount(g.unassigned_count ?? 0);
      setUnlinkedFolders(g.folders ?? []);
      setGalleryMeta(g);
    } catch {
      /* surfaced by health check */
    } finally {
      setGalleryLoaded(true);
    }
  }, []);

  const refreshLive = useCallback(async () => {
    try {
      setHealth(await api.health());
      setOnline(true);
    } catch {
      setOnline(false);
    }
    await refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    refreshAll();
    refreshQueue();
    refreshGallery();
  }, [refreshAll, refreshQueue, refreshGallery]);

  // the vault shows the active account's files, so it reloads whenever the active account changes
  const activeAccountId = health?.keys.instagram.official_accounts?.find((a) => a.default)?.id ?? null;
  useEffect(() => {
    if (activeAccountId) refreshGallery();
  }, [activeAccountId, refreshGallery]);

  const toggleDryRun = useCallback(async () => {
    if (!config) return;
    const next = !config.instagram.dry_run;
    try {
      const res = await api.saveConfig({ instagram: { dry_run: next } });
      setConfig(res.config);
      setHealth((h) => (h ? { ...h, dry_run: next } : h));
      toast(next ? "Switched to safe dry-run mode" : "Live publishing is now enabled", next ? "info" : "error");
    } catch {
      toast("Failed to update mode", "error");
    }
  }, [config, toast]);

  const value = useMemo(
    () => ({ health, config, queue, gallery, galleryAccount, unassignedCount, unlinkedFolders, galleryMeta, galleryLoaded, online, refreshAll, refreshLive, refreshQueue, refreshGallery, setConfig, toggleDryRun }),
    [health, config, queue, gallery, galleryAccount, unassignedCount, unlinkedFolders, galleryMeta, galleryLoaded, online, refreshAll, refreshLive, refreshQueue, refreshGallery, toggleDryRun],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
