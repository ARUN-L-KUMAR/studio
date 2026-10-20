import type { GalleryFile, GenerationResult, InstaTrack, QueueJob } from "../api/types";
import { TASKS } from "../data/tasks";

export const DEFAULT_CAPTION = "Automated content created with InstaStudio AI\n\n#reels #viral #explore #aesthetic";

/** Turns a media-vault file into the shape the Post page works with. */
export function fileToResult(f: GalleryFile): GenerationResult {
  return {
    media_url: f.url,
    media_path: f.url,
    filename: f.filename,
    is_video: f.is_video,
    caption: DEFAULT_CAPTION,
    song: "",
    prompt: f.filename,
    task: f.is_video ? "text_to_video" : "text_to_image",
  };
}

/** A Vault-style file entry for an /output/... address (for pictures that are not in the folder being shown). */
export function fileFromUrl(url: string): GalleryFile {
  const clean = url.split("?")[0];
  let rel = clean.replace(/^\/output\//, "");
  try {
    rel = decodeURIComponent(rel);
  } catch {
    /* keep the address as it is */
  }
  const name = rel.split("/").pop() ?? rel;
  return {
    filename: name, path: rel, folder: rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "", url: clean, size_mb: 0,
    is_video: /\.(mp4|mov|m4v|webm)$/i.test(name), created_at: "", timestamp: 0, posted: false, posted_at: null, uploaded: false, labels: [],
  };
}

/**
 * What the Post page needs to show a queued job: the first item with its caption, every item of a carousel in order,
 * and whether it is a carousel. Returns null when the job has no media yet (for example a prompt waiting to run).
 */
export function jobForPost(job: QueueJob) {
  const urls = job.media_urls && job.media_urls.length > 1 ? job.media_urls : job.media_url ? [job.media_url] : [];
  if (!urls.length) return null;
  const files = urls.map(fileFromUrl);
  const result: GenerationResult = {
    media_url: urls[0],
    media_path: job.media ?? urls[0],
    filename: files[0].filename,
    is_video: files[0].is_video,
    caption: job.caption ?? "",
    song: "",
    task: job.task,
    prompt: job.prompt,
  };
  return { result, files, carousel: urls.length > 1 };
}

/** Which pipeline made a vault file, read from its name (for example "image_to_video_1792.mp4"). */
export function pipelineLabel(filename: string, isVideo: boolean): string {
  const name = filename.toLowerCase();
  const task = TASKS.find((t) => name.startsWith(t.key));
  if (task) return task.title;
  if (name.includes("slideshow")) return "Slideshow";
  return isVideo ? "Reel" : "Image";
}

/** "9:16", "1:1" ... for the closest common ratio, otherwise the pixel size. */
export function aspectLabel(w: number, h: number): string {
  if (!w || !h) return "";
  const r = w / h;
  const known: [string, number][] = [["9:16", 9 / 16], ["3:4", 3 / 4], ["4:5", 4 / 5], ["1:1", 1], ["4:3", 4 / 3], ["16:9", 16 / 9]];
  const best = known.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a));
  return Math.abs(best[1] - r) / best[1] < 0.04 ? best[0] : `${w}×${h}`;
}

/** "5 min ago", "2 h ago", "3 d ago" */
export function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** 45 -> "45 s", 200 -> "3 min" */
export function duration(sec: number): string {
  return sec < 90 ? `${Math.max(1, Math.round(sec))} s` : `${Math.round(sec / 60)} min`;
}

/** 83 -> "1:23" */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Instagram's suggested start for a song, and a clip length that fits inside it. */
export function clipDefaults(track: InstaTrack, wantedLen = 30) {
  const durSec = Math.floor(track.duration_ms / 1000);
  const clipLen = Math.min(wantedLen, durSec);
  const suggested = Math.floor((track.highlights?.[0] ?? 0) / 1000);
  return { clipLen, clipStart: Math.min(suggested, Math.max(0, durSec - clipLen)) };
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const NOISE = ["sped up", "speed up", "slowed", "reverb", "instrumental", "karaoke", "cover", "remix", "8d", "nightcore", "lofi", "tribute", "live", "acoustic"];

/**
 * Picks the Instagram search result that best matches an AI suggestion like "Billie Eilish - WILDFLOWER".
 * Prefers the original version (not sped up / slowed / karaoke ...) and returns null if nothing is close.
 */
export function pickBestTrack(query: string, tracks: InstaTrack[]): InstaTrack | null {
  const q = norm(query);
  const qWords = new Set(q.split(" ").filter((w) => w.length > 1));
  if (!qWords.size) return null;
  let best: { t: InstaTrack; score: number } | null = null;
  tracks.forEach((t, rank) => {
    const text = norm(`${t.title} ${t.artist}`);
    const words = new Set(text.split(" "));
    let hit = 0;
    qWords.forEach((w) => words.has(w) && hit++);
    let score = hit / qWords.size;                            // how much of the suggestion is covered
    for (const n of NOISE) if ((" " + text + " ").includes(" " + n + " ") && !(" " + q + " ").includes(" " + n + " ")) score -= 0.35;   // not the original recording
    score -= rank * 0.01;                                     // Instagram's own ranking breaks ties
    if (!best || score > best.score) best = { t, score };
  });
  return best && (best as { score: number }).score >= 0.5 ? (best as { t: InstaTrack }).t : null;
}
