import { Loader2 } from "lucide-react";

export default function Spinner({ className = "ic" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} />;
}
