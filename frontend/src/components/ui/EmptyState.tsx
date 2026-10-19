import type { ReactNode } from "react";

interface Props {
  /** SVG illustration file inside public/images */
  image: string;
  title: string;
  text: string;
  action?: ReactNode;
}

export default function EmptyState({ image, title, text, action }: Props) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-4">
      <img src={`/images/${image}`} alt="" className="w-60 h-40 object-contain mb-5" />
      <strong className="text-[16px]">{title}</strong>
      <p className="text-[13px] text-muted mt-1 mb-5 max-w-sm">{text}</p>
      {action}
    </div>
  );
}
