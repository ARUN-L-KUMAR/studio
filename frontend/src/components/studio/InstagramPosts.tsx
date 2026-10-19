import { useCallback, useEffect, useState } from "react";
import { Expand, Film, GalleryHorizontal, Heart, Image as ImageIcon, MessageCircle, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { IgPost } from "../../api/types";
import { useApp } from "../../context/AppContext";
import EmptyState from "../ui/EmptyState";
import Spinner from "../ui/Spinner";
import PostPreview from "./PostPreview";

const KIND = {
  photo: { label: "Photo", icon: ImageIcon },
  carousel: { label: "Carousel", icon: GalleryHorizontal },
  reel: { label: "Reel", icon: Film },
  video: { label: "Video", icon: Film },
} as const;

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Posts already published on the active Instagram account, read from Instagram itself. */
export default function InstagramPosts() {
  const { health } = useApp();
  const accounts = health?.keys.instagram.official_accounts ?? [];
  const active = accounts.find((a) => a.default) ?? accounts[0];

  const [posts, setPosts] = useState<IgPost[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<IgPost | null>(null);

  const load = useCallback(
    async (more = false) => {
      if (!active) return;
      setLoading(true);
      setError("");
      try {
        const d = await api.igPosts(active.id, more && next ? next : "");
        setPosts((p) => (more ? [...p, ...d.posts] : d.posts));
        setNext(d.next);
        setLoaded(true);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [active, next],
  );

  // reload whenever the active account changes
  useEffect(() => {
    setPosts([]);
    setNext(null);
    setLoaded(false);
    if (active) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  if (!active) {
    return (
      <div className="card">
        <EmptyState
          image="empty-gallery.svg"
          title="No Instagram account connected"
          text="Connect an account with an access token in Settings to see its posts here."
          action={<Link to="/settings" className="btn btn-primary btn-sm">Open Settings</Link>}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-[13px] text-muted">
          Posts on <strong className="text-fg">@{active.username ?? active.id}</strong>. Switch the account in the top bar to see another one.
        </p>
        <button className="btn btn-sm btn-ghost" onClick={() => load(false)} disabled={loading}>
          {loading ? <Spinner className="ic-sm w-4 h-4" /> : <RefreshCw className="ic-sm w-4 h-4" />}<span>Refresh</span>
        </button>
      </div>

      {error && <p className="text-[13px] text-danger mb-4">{error}</p>}

      {loaded && posts.length === 0 && !error ? (
        <div className="card">
          <EmptyState image="empty-gallery.svg" title="No posts yet" text="Nothing has been published on this account. Posts you publish appear here." />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
          {posts.map((p) => {
            const K = KIND[p.kind];
            return (
              <article key={p.id} className="group bg-surface border border-line rounded-lg overflow-hidden shadow-1 hover:shadow-3 hover:-translate-y-1 transition-[transform,box-shadow] duration-300">
                <button type="button" onClick={() => setOpen(p)} className="relative block w-full aspect-[4/5] bg-surface-2 overflow-hidden text-left" title="Preview">
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-dim"><ImageIcon className="w-8 h-8" /></div>
                  )}
                  <span className="absolute top-3 left-3 badge bg-neutral-950/65 text-white backdrop-blur">
                    <K.icon className="w-3.5 h-3.5" />
                    {K.label}{p.items ? ` · ${p.items}` : ""}
                  </span>
                  <span className="absolute top-3 right-3 grid place-items-center w-8 h-8 rounded-full bg-neutral-950/65 text-white opacity-0 group-hover:opacity-100 transition">
                    <Expand className="w-4 h-4" />
                  </span>
                </button>
                <div className="p-4">
                  <p className="text-[13px] line-clamp-2 min-h-[2.6em]">{p.caption || <span className="text-dim">No caption</span>}</p>
                  <div className="flex items-center justify-between mt-2.5 text-[11px] text-dim">
                    <span>{when(p.timestamp)}</span>
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />{p.likes ?? "-"}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{p.comments ?? "-"}</span>
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <PostPreview post={open} account={active.username ?? active.id} onClose={() => setOpen(null)} />

      {next && (
        <div className="flex justify-center mt-6">
          <button className="btn btn-secondary" onClick={() => load(true)} disabled={loading}>
            {loading ? <Spinner /> : null}<span>{loading ? "Loading" : "Load more"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
