import type {
  AppConfig,
  CaptionResult,
  GalleryListing,
  GenerationStatus,
  Automation,
  AutomationFolder,
  AutomationInput,
  Health,
  IgVerifyError,
  IgAccount,
  IgAccountStatus,
  IgPost,
  InstaTrack,
  LocalTrack,
  PostRequest,
  PostResponse,
  QueueJob,
} from "./types";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (res.status === 401 && (body as { auth?: boolean } | null)?.auth) {
    window.dispatchEvent(new Event("auth-required"));
  }
  if (!res.ok) {
    const b = body as { detail?: string; message?: string } | null;
    throw new ApiError(b?.detail || b?.message || `Request failed (${res.status})`, res.status, body);
  }
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export const api = {
  health: () => request<Health>("/api/health"),
  config: () => request<AppConfig>("/api/config"),
  saveConfig: (patch: Partial<AppConfig> | Record<string, unknown>) =>
    request<{ status: string; config: AppConfig }>("/api/config", json("POST", patch)),

  startGeneration: (form: FormData) =>
    request<{ status: string }>("/api/generate", { method: "POST", body: form }),
  generationStatus: () => request<GenerationStatus>("/api/generate/status"),

  generateCaption: (data: {
    prompt: string;
    media_kind: string;
    tone?: string | null;
    media_url?: string | null;
    media_urls?: string[];
    provider?: string | null;
    model?: string | null;
  }) => request<CaptionResult>("/api/caption/generate", json("POST", data)),
  saveAiKeys: (keys: Partial<Record<"gemini" | "groq" | "openrouter" | "openai", string>>) =>
    request<{ message: string; warnings: string[] }>("/api/settings/ai_keys", json("POST", keys)),
  testCaptionAi: (provider: string, model: string) =>
    request<{ ms: number; sample: string; model: string }>("/api/caption/test", json("POST", { provider, model })),

  post: (data: PostRequest) => request<PostResponse>("/api/post", json("POST", data)),

  musicSearch: (q: string) =>
    request<{ tracks: InstaTrack[] }>(`/api/music/search?q=${encodeURIComponent(q)}`),
  localMusic: () => request<{ tracks: LocalTrack[] }>("/api/music/local"),
  uploadMusic: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ name: string; size_mb: number }>("/api/music/local", { method: "POST", body: form });
  },
  deleteMusic: (name: string) => request<{ status: string }>(`/api/music/local/${encodeURIComponent(name)}`, { method: "DELETE" }),

  queue: () => request<{ jobs: QueueJob[]; total: number }>("/api/queue"),
  igAccounts: () => request<{ cloudinary: boolean; accounts: IgAccount[] }>("/api/instagram/accounts"),
  igAccountStatus: (id: string) => request<IgAccountStatus>(`/api/instagram/accounts/${encodeURIComponent(id)}/status`),
  igPosts: (id: string, after = "") =>
    request<{ account: string | null; posts: IgPost[]; next: string | null }>(
      `/api/instagram/accounts/${encodeURIComponent(id)}/posts?limit=24${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    ),
  addIgAccount: (token: string) => request<{ message: string }>("/api/instagram/accounts", json("POST", { token })),
  removeIgAccount: (id: string) => request<{ status: string }>(`/api/instagram/accounts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setDefaultIgAccount: (id: string) => request<{ status: string }>(`/api/instagram/accounts/${encodeURIComponent(id)}/default`, { method: "POST" }),
  setIgAccountFolder: (id: string, folder: string) =>
    request<{ folder: string }>(`/api/instagram/accounts/${encodeURIComponent(id)}/folder`, json("POST", { folder })),
  /** Undo "link folder": the account returns to its own folder and the linked one becomes a custom folder again */
  unlinkIgAccountFolder: (id: string) =>
    request<{ previous: string; folder: string }>(`/api/instagram/accounts/${encodeURIComponent(id)}/folder`, { method: "DELETE" }),
  refreshIgAccount: (id: string) => request<{ message: string }>(`/api/instagram/accounts/${encodeURIComponent(id)}/refresh`, { method: "POST" }),
  saveCloudinary: (cloudinary_url: string) => request<{ message: string }>("/api/settings/instagram_api", json("POST", { cloudinary_url })),
  addToQueue: (job: {
    task: string;
    prompt: string;
    media?: string;
    media_paths?: string[];
    account?: string;
    caption?: string;
    post_at?: string;
  }) => request<{ status: string }>("/api/queue", json("POST", job)),
  addBatch: (task: string, prompts: string[], inputs: { image?: string; video?: string; face?: string } = {}) =>
    request<{ added_count: number }>("/api/queue/batch", json("POST", { task, prompts, ...inputs })),
  /** Uploads a photo or video to the input folder; `url` is what the queue refers to */
  uploadInput: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ url: string; filename: string }>("/api/upload", { method: "POST", body: form });
  },
  retryJob: (id: number) => request<{ status: string }>(`/api/queue/${id}/retry`, { method: "POST" }),
  deleteJob: (id: number) => request<{ status: string }>(`/api/queue/${id}`, { method: "DELETE" }),
  /** Runs the next due job(s). With `jobId`, runs exactly that job (even one scheduled for later). */
  runQueue: (limit = 1, jobId?: number) =>
    request<{ executed: number }>(`/api/queue/run?limit=${limit}${jobId != null ? `&job_id=${jobId}` : ""}`, { method: "POST" }),

  gallery: (scope = "") => request<GalleryListing>(`/api/gallery${scope ? `?scope=${encodeURIComponent(scope)}` : ""}`),
  deleteMedia: (path: string) =>
    request<{ status: string }>(`/api/gallery/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE" }),
  markPosted: (paths: string[], posted: boolean) =>
    request<{ changed: number }>("/api/gallery/mark", json("POST", { paths, posted })),
  moveMedia: (paths: string[], to: string) =>
    request<{ moved: number; skipped: number }>("/api/gallery/move", json("POST", { paths, to })),

  /** Adds one picture or video to a Vault folder (`scope` is named like the Vault's views: "", an account id, "folder:<name>" or "unassigned") */
  uploadToVault: (file: File, scope: string) => {
    const form = new FormData();
    form.append("files", file);
    form.append("scope", scope);
    return request<{ uploaded: { filename: string; path: string; url: string; size_mb: number; note?: string }[]; rejected: { name: string; reason: string }[] }>("/api/gallery/upload", { method: "POST", body: form });
  },
  createFolder: (name: string, pin = "") => request<{ name: string; locked: boolean }>("/api/folders", json("POST", { name, pin })),
  deleteFolder: (name: string) => request<{ status: string }>(`/api/folders/${encodeURIComponent(name)}`, { method: "DELETE" }),
  unlockFolder: (name: string, pin: string) =>
    request<{ status: string }>(`/api/folders/${encodeURIComponent(name)}/unlock`, json("POST", { pin })),
  lockFolder: (name: string) => request<{ status: string }>(`/api/folders/${encodeURIComponent(name)}/lock`, { method: "POST" }),
  setFolderPin: (name: string, pin: string, current = "") =>
    request<{ status: string }>(`/api/folders/${encodeURIComponent(name)}/pin`, json("POST", { new: pin, current })),
  removeFolderPin: (name: string, current: string) =>
    request<{ status: string }>(`/api/folders/${encodeURIComponent(name)}/pin/remove`, json("POST", { current })),

  automations: () => request<{ rules: Automation[] }>("/api/automations"),
  automationFolders: () => request<{ folders: AutomationFolder[] }>("/api/automations/folders"),
  createAutomation: (rule: AutomationInput) => request<{ rule: Automation }>("/api/automations", json("POST", rule)),
  updateAutomation: (id: string, rule: AutomationInput) => request<{ rule: Automation }>(`/api/automations/${id}`, json("PUT", rule)),
  deleteAutomation: (id: string) => request<{ status: string }>(`/api/automations/${id}`, { method: "DELETE" }),
  setAutomationEnabled: (id: string, enabled: boolean) => request<{ rule: Automation }>(`/api/automations/${id}/enabled`, json("POST", { enabled })),
  runAutomationNow: (id: string) => request<{ status: string }>(`/api/automations/${id}/run-now`, { method: "POST" }),

  saveHfTokens: (tokens: string[]) =>
    request<{ message: string }>("/api/settings/hf_tokens", json("POST", { tokens })),
  saveInstagram: (data: { username?: string; password?: string; verification_code?: string }) =>
    request<{ message: string }>("/api/settings/instagram", json("POST", data)),
  verifyInstagram: async (data: {
    username?: string;
    password?: string;
    verification_code?: string;
    session_id?: string;
  }): Promise<{ ok: true; message: string } | { ok: false; error: IgVerifyError }> => {
    const res = await fetch("/api/instagram/verify", json("POST", data));
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && body.auth) window.dispatchEvent(new Event("auth-required"));
    if (res.ok) return { ok: true, message: body.message };
    return {
      ok: false,
      error: { status: body.status || "error", message: body.message || body.detail || "Authentication failed" },
    };
  },
};
