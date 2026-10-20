import { Check, Upload } from "lucide-react";
import type { GalleryFile } from "../../api/types";

/**
 * The marks a Vault file can carry, as small round icons: a green tick when it was posted to Instagram, a white
 * upload arrow when you uploaded it yourself. A generated file that was never posted has neither and shows nothing.
 */
export default function StatusBadges({ file, size = "md" }: { file: Pick<GalleryFile, "posted" | "posted_at" | "uploaded">; size?: "md" | "sm" }) {
  if (!file.posted && !file.uploaded) return null;
  const box = size === "sm" ? "w-5 h-5" : "w-7 h-7";                // "sm" is for the small thumbnails on the Post page
  const icon = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  return (
    <>
      {file.posted && (
        <span
          role="img"
          aria-label="Posted"
          title={file.posted_at ? `Posted ${file.posted_at}` : "Posted"}
          className={`grid place-items-center ${box} rounded-full bg-success text-neutral-950 shadow-md ring-2 ring-neutral-950/40`}
        >
          <Check className={icon} strokeWidth={3.5} />
        </span>
      )}
      {file.uploaded && (
        <span
          role="img"
          aria-label="Uploaded"
          title="You uploaded this file"
          className={`grid place-items-center ${box} rounded-full bg-white text-neutral-900 shadow-md ring-2 ring-neutral-950/40`}
        >
          <Upload className={icon} strokeWidth={2.75} />
        </span>
      )}
    </>
  );
}
