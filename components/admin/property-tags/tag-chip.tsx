import { X } from "lucide-react";
import { tagChipStyle } from "@/lib/properties/tags";
import { cn } from "@/lib/utils";

export function TagChip({
  name,
  color,
  onRemove,
  className,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      style={tagChipStyle(color)}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar etiqueta ${name}`}
          className="-mr-0.5 rounded-full p-0.5 opacity-70 transition hover:opacity-100"
        >
          <X size={11} strokeWidth={2.25} />
        </button>
      )}
    </span>
  );
}
