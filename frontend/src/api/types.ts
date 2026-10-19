export type TaskKey =
  | "text_to_video"
  | "image_to_video"
  | "text_to_image"
  | "face_swap"
  | "video_to_video"
  | "image_to_image";

export interface HfAccount {
  index: number;
  label: string;
  preview: string;
}

export interface AiModel {
  id: string;
  label: string;
  vision: boolean;
  tested: boolean;
  note: string;
}

export interface AiProvider {
  id: string;
  label: string;
  configured: boolean;
  preview: string;
  problem: string | null;
  /** "api" = chat API, "space" = Hugging Face Space */
  kind: "api" | "space";
  /** "env" = own API key, "hf_pool" = uses the Hugging Face account pool */
  key_source: "env" | "hf_pool";
  default_model: string;
  models: AiModel[];
}

export interface CaptionAi {
  provider: string;
  models: Record<string, string>;
  providers: AiProvider[];
}

export interface CaptionResult {
  caption: string;
  song: string;
  provider: string;
  model: string;
}

export interface Health {
  status: string;
  caption_ai: CaptionAi;
  dry_run: boolean;
  keys: {
    huggingface: {
      configured: boolean;
      preview: string;
      total_accounts: number;
      /** Accounts Hugging Face still accepts; null until the first background check finishes */
      valid_accounts: number | null;
      /** Per account: seconds until its free GPU quota is back (0 = available) */
      quota: { index: number; wait_seconds: number }[];
      has_failover: boolean;
      accounts: HfAccount[];
      primary: { configured: boolean; preview: string };
      backup: { configured: boolean; preview: string };
    };
    instagram: {
      mode: string;
      configured: boolean;
      username: string | null;
      session_cached: boolean;
      /** The official Instagram API (token + Cloudinary) is set up in .env */
      official_api?: boolean;
      /** Connected Instagram API accounts (never includes tokens) */
      official_accounts?: IgAccount[];
      /** Instagram rejected the saved login; it must be renewed in Settings */
      session_expired?: boolean;
      preview: string;
    };
    openai: { configured: boolean; preview: string };
    cloudinary: { configured: boolean; preview: string };
  };
  available_music_tracks: number;
  available_tasks: string[];
}

export interface TaskConfig {
  space?: string;
  api_name?: string;
  params?: Record<string, unknown>;
  pick?: string;
}

export interface AppConfig {
  tasks: Record<string, TaskConfig>;
  caption: {
    provider?: string;
    models?: Record<string, string>;
    model?: string;
    tone?: string;
    language?: string;
    max_hashtags?: number;
    my_hashtags?: string[];
  };
  music: { folder?: string; enabled?: boolean; volume?: number };
  instagram: { post_type?: string; dry_run: boolean };
  schedule: { daily_times?: string[] };
}

export interface QueueJob {
  id: number;
  task: string;
  prompt: string;
  status?: "pending" | "done" | "failed" | string;
  post_at?: string;
  media?: string;
  media_url?: string;
  /** Set for a scheduled carousel: every item, in posting order */
  media_urls?: string[];
  account?: string;
  /** Name of the account a scheduled post will go to */
  account_name?: string | null;
  caption?: string;
  error?: string;
}

export interface IgAccount {
  id: string;
  username: string | null;
  default: boolean;
  days_left: number | null;
}

export interface IgPostMedia {
  type: "image" | "video";
  url: string;
  thumb: string;
}

export interface IgPost {
  id: string;
  /** Every picture or video of the post (a carousel has several) */
  media: IgPostMedia[];
  caption: string;
  kind: "photo" | "carousel" | "reel" | "video";
  thumbnail: string;
  permalink: string;
  timestamp: string;
  likes: number | null;
  comments: number | null;
  /** Number of pictures/videos when the post is a carousel */
  items: number | null;
}

export interface IgAccountStatus {
  id: string | null;
  username: string | null;
  account_type: string | null;
  media_count: number | null;
  quota_used: number | null;
  quota_total: number | null;
  days_left: number | null;
  default: boolean;
  error: string | null;
}

export interface GalleryFile {
  filename: string;
  /** Location inside the output folder, for example "redmedia.inn/clip.mp4" */
  path: string;
  /** Account folder the file lives in ("" = not assigned to an account) */
  folder: string;
  url: string;
  size_mb: number;
  is_video: boolean;
  created_at: string;
  timestamp: number;
}

export interface GalleryListing {
  files: GalleryFile[];
  count: number;
  /** Account id that is shown, "unassigned", or "all" when no account is connected */
  scope: string;
  account: string | null;
  folder?: string;
  /** Files in the output folder that belong to no account yet */
  unassigned_count: number;
  /** Folders in the output folder that no account uses yet */
  folders?: { name: string; count: number }[];
}

export interface GenerationResult {
  media_path: string;
  media_url: string;
  filename: string;
  is_video: boolean;
  caption: string;
  song: string;
  task: string;
  prompt: string;
  completed_at?: string;
}

export interface GenerationStatus {
  is_generating: boolean;
  progress: number;
  current_step: string;
  result: GenerationResult | null;
  error: string | null;
}

export interface IgVerifyError {
  status: "error" | "2fa_required" | "challenge_required" | "version_error";
  message: string;
}

export interface InstaTrack {
  id: string;
  title: string;
  artist: string;
  duration_ms: number;
  explicit: boolean;
  cover: string;
  /** Audio preview URL (the full song), for listening before choosing */
  preview: string;
  /** Instagram's suggested start points, in milliseconds */
  highlights: number[];
}

export interface LocalTrack {
  name: string;
  size_mb: number;
  url: string;
}

export interface PostRequest {
  media_path: string;
  caption: string;
  is_video: boolean;
  media_paths?: string[];
  format?: "carousel" | "slideshow";
  seconds_per_image?: number;
  account?: string;
  track_id?: string;
  track_start_ms?: number;
  track_clip_ms?: number;
  local_track?: string;
}

export interface PostResponse {
  posted: boolean;
  dry_run: boolean;
  message: string;
  public_url?: string | null;
  /** Set when the server built a new video (slideshow, or your audio mixed in) */
  built_media_url?: string | null;
}
