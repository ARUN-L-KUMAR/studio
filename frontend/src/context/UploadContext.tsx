import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { useApp } from "./AppContext";

/** How many files are sent at the same time. One at a time wastes most of a good connection; many at once starve each other. */
const CONCURRENCY = 3;

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "cancelled";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  scope: string;
  /** Name of the folder it goes to, for messages */
  dest: string;
  status: UploadStatus;
  /** Bytes sent so far */
  loaded: number;
  message?: string;
}

interface Ctx {
  items: UploadItem[];
  /** True while any file is waiting or being sent */
  active: boolean;
  enqueue: (files: File[], scope: string, dest: string) => void;
  cancelAll: () => void;
  /** Clears the finished list from the tray */
  dismiss: () => void;
}

const UploadCtx = createContext<Ctx>({ items: [], active: false, enqueue: () => {}, cancelAll: () => {}, dismiss: () => {} });
export const useUploads = () => useContext(UploadCtx);

const busy = (s: UploadStatus) => s === "queued" || s === "uploading";

/**
 * Uploads to the Vault that keep running in the background: the dialog closes as soon as you press Upload, you carry on
 * using the app (any page), and a small tray shows the count and the result. Files are sent a few at a time.
 * (They continue while you move between pages; reloading or closing the tab stops them, and the browser warns you first.)
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const { refreshAll, refreshGallery } = useApp();
  const [items, setView] = useState<UploadItem[]>([]);
  const list = useRef<UploadItem[]>([]);                    // the same list, readable from callbacks without going stale
  const files = useRef(new Map<string, File>());
  const aborts = useRef(new Map<string, AbortController>());
  const running = useRef(0);
  const announced = useRef(true);                           // true = nothing new to announce (no batch in progress)
  const counter = useRef(0);
  const refresh = useRef({ refreshAll, refreshGallery });
  refresh.current = { refreshAll, refreshGallery };

  const commit = (next: UploadItem[]) => {
    list.current = next;
    setView(next);
  };
  const patch = (id: string, p: Partial<UploadItem>) => commit(list.current.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const finish = () => {
    announced.current = true;
    // the tray shows the result, so there is no toast on top of it
    const done = list.current.filter((i) => i.status === "done").length;
    if (done) {
      refresh.current.refreshAll().catch(() => {});
      refresh.current.refreshGallery().catch(() => {});
      window.dispatchEvent(new Event("vault-uploaded"));       // the Vault page reloads whatever folder it is showing
    }
  };

  const run = (item: UploadItem) => {
    const file = files.current.get(item.id);
    if (!file) return patch(item.id, { status: "error", message: "The file is no longer available." });
    running.current++;
    const ac = new AbortController();
    aborts.current.set(item.id, ac);
    patch(item.id, { status: "uploading", loaded: 0 });
    api
      .uploadToVault(file, item.scope, { signal: ac.signal, onProgress: (loaded) => patch(item.id, { loaded }) })
      .then((r) => {
        if (r.uploaded.length) patch(item.id, { status: "done", loaded: item.size, message: r.uploaded[0].note });
        else patch(item.id, { status: "error", message: r.rejected[0]?.reason ?? "The server did not accept this file." });
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return patch(item.id, { status: "cancelled", message: "Stopped" });
        patch(item.id, { status: "error", message: e.message });
        if (/locked|PIN/i.test(e.message)) {
          // every other file for that folder would be refused the same way
          commit(list.current.map((i) => (i.status === "queued" && i.scope === item.scope ? { ...i, status: "error", message: "The folder is locked. Unlock it in the Vault first." } : i)));
        }
      })
      .finally(() => {
        running.current--;
        files.current.delete(item.id);
        aborts.current.delete(item.id);
        pump();
      });
  };

  const pump = () => {
    while (running.current < CONCURRENCY) {
      const next = list.current.find((i) => i.status === "queued");
      if (!next) break;
      run(next);
    }
    if (running.current === 0 && list.current.length && !announced.current && !list.current.some((i) => busy(i.status))) finish();
  };

  const enqueue = useCallback((picked: File[], scope: string, dest: string) => {
    if (!picked.length) return;
    // a finished list from before is replaced by the new batch
    if (!list.current.some((i) => busy(i.status))) commit([]);
    announced.current = false;
    const added: UploadItem[] = picked.map((f) => {
      const id = `u${++counter.current}`;
      files.current.set(id, f);
      return { id, name: f.name, size: f.size, scope, dest, status: "queued", loaded: 0 };
    });
    commit([...list.current, ...added]);
    pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelAll = useCallback(() => {
    commit(list.current.map((i) => (i.status === "queued" ? { ...i, status: "cancelled", message: "Stopped" } : i)));
    aborts.current.forEach((a) => a.abort());
    pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(() => {
    if (list.current.some((i) => busy(i.status))) return;
    commit([]);
  }, []);

  const active = items.some((i) => busy(i.status));
  // closing or reloading the tab would lose the files that are still waiting
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const value = useMemo(() => ({ items, active, enqueue, cancelAll, dismiss }), [items, active, enqueue, cancelAll, dismiss]);
  return <UploadCtx.Provider value={value}>{children}</UploadCtx.Provider>;
}
