import { Eye, EyeOff } from "lucide-react";
import type { AiProvider } from "../../api/types";
import Select from "./Select";

interface Props {
  providers: AiProvider[];
  provider: string;
  model: string;
  /** Last model chosen for each provider, used when switching provider */
  saved: Record<string, string>;
  onChange: (provider: string, model: string) => void;
}

/** Provider + model dropdowns for the caption AI, with a note on what the model can do. */
export default function CaptionAiPicker({ providers, provider, model, saved, onChange }: Props) {
  const current = providers.find((p) => p.id === provider) ?? providers[0];
  if (!current) return null;

  const models = current.models.some((m) => m.id === model) || !model
    ? current.models
    : [...current.models, { id: model, label: model, vision: true, tested: false, note: "Custom model" }];
  const info = models.find((m) => m.id === model);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Select
          ariaLabel="Caption AI provider"
          className="!py-2 text-[13px]"
          value={current.id}
          onChange={(v) => {
            const p = providers.find((x) => x.id === v);
            if (p) onChange(p.id, saved[p.id] ?? p.default_model);
          }}
          options={providers.map((p) => ({
            value: p.id,
            label: p.label,
            hint: p.configured ? undefined : "No key saved",
            disabled: !p.configured,
          }))}
        />
        <Select
          ariaLabel="Caption AI model"
          className="!py-2 text-[13px]"
          menuMinWidth={260}
          value={model}
          onChange={(v) => onChange(current.id, v)}
          options={models.map((m) => ({
            value: m.id,
            label: m.label,
            hint: m.vision ? (m.tested ? "Sees the picture, tested" : "Sees the picture") : "Text only: reads your prompt, not the picture",
          }))}
        />
      </div>
      {info && (
        <p className="hint mt-2 flex items-start gap-1.5 leading-snug">
          {info.vision ? <Eye className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary-400" /> : <EyeOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <span>{info.vision ? "Looks at the picture. " : "Reads your prompt only, not the picture. "}{info.note}</span>
        </p>
      )}
      {current.problem && <p className="text-[12px] text-danger mt-1.5">{current.problem}</p>}
    </div>
  );
}
