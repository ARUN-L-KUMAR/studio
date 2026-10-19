import type { GalleryFile, GenerationResult, InstaTrack } from "../api/types";

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
