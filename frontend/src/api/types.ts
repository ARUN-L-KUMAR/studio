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
  /** Real posts recorded by the server (dry runs are not counted); `days` = last 7 days, oldest first */
  published?: { total: number; today: number; days: number[]; recent?: { at: string; kind: string; account: string | null; url: string | null }[] };
  /** Service health worked out by the server */
  services?: ServiceStatus[];
  /** Real timings of finished runs, per pipeline: typical (median) seconds, number of runs kept, and when it last ran */
  usage?: Record<string, { median_seconds: number; runs: number; last_used: string | null }>;
  active_generation?: { is_generating: boolean; progress: number; current_step: string };
}

export type ServiceState = "connected" | "degraded" | "disconnected" | "auth_required";

export interface ServiceStatus {
  id: string;
  label: string;
  state: ServiceState;
  detail: string;
  /** Page that fixes it (null when connected) */
  action: string | null;
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
  schedule: { daily_times?: string[]; run_in_server?: boolean };
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
  created_at?: string;
  finished_at?: string;
  posted?: boolean;
  /** Files attached to a job that starts from a photo, video or face (null when the file is not in the input folder) */
  input_urls?: Partial<Record<"image" | "video" | "face", string | null>>;
  /** Set when a daily automation made this job */
  automation?: string;
  automation_name?: string;
}

/** A daily automation: make a pipeline's output at set times and post it. */
export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  pipeline: string;
  /** Account id; "" = whichever account is active when it posts */
  account: string;
  times: string[];
  /** 0 = Monday ... 6 = Sunday; empty = every day */
  days: number[];
  start_date: string | null;
  end_date: string | null;
  prompt_mode: "list" | "ai";
  prompts: string[];
  theme: string;
  /** "own" automations: the folder that is posted from */
  input_folder: string;
  /** "generate": make something new with the pipeline; "own": post the files of the folder as they are */
  source: "generate" | "own";
  /** "own" only: start over when every file has been posted */
  loop: boolean;
  /** "own" only: files in the folder that have not been posted yet */
  unused_count?: number;
  /** Pipelines that start from files: where each input ("image", "face", "video") comes from */
  inputs: Record<string, { mode: "file" | "folder"; folder: string; file_name: string; file_ok: boolean; count: number | null }>;
  /** Upcoming run times, "YYYY-MM-DD HH:MM", for the next week */
  next_runs: string[];
  /** "own" automations: photos and videos in the folder */
  file_count: number | null;
  state: { runs: number; last_run_at: string | null; last_status: "queued" | "error" | "waiting" | null; last_error: string | null; next_prompt: number; run_now: boolean };
}

export interface AutomationInput {
  name: string;
  enabled: boolean;
  pipeline: string;
  account: string;
  times: string[];
  days: number[];
  start_date: string | null;
  end_date: string | null;
  prompt_mode: "list" | "ai";
  prompts: string[];
  theme: string;
  /** "own" automations: the folder to post from */
  input_folder: string;
  /** Pipelines that start from files: each input is one uploaded file (empty `file` keeps the saved one) or a Vault folder */
  inputs: Record<string, { mode: "file" | "folder"; folder: string; file: string }>;
  source: "generate" | "own";
  loop: boolean;
}

export interface AutomationFolder {
  name: string;
  account: string | null;
  locked: boolean;
  images: number;
  videos: number;
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
  /** It was posted to Instagram (and when) */
  posted: boolean;
  posted_at: string | null;
  /** You uploaded this file yourself */
  uploaded: boolean;
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
  /** Folders in the output folder that no account uses yet (custom folders) */
  folders?: FolderInfo[];
  /** This folder has a PIN, and it has not been entered in this browser: `files` is empty */
  locked?: boolean;
  /** This folder has a PIN (entered or not) */
  protected?: boolean;
  /** Every folder with a PIN, keyed by account id or "folder:<name>" */
  locks?: Record<string, "locked" | "open">;
  /** When an account's folder is shown: which account, whether a custom folder is linked to it, and its own default name */
  account_id?: string;
  linked?: boolean;
  default_folder?: string;
  /** Every account's folder; `linked` means a custom folder is linked to that account */
  account_folders?: Record<string, { folder: string; linked: boolean }>;
}

export interface FolderInfo {
  name: string;
  count: number;
  locked: boolean;
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
