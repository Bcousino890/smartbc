"use client";

import { TAG_COLORS, isValidColor } from "@/lib/properties/tags";
import { cn } from "@/lib/utils";

export function TagColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          style={{ backgroundColor: c }}
          className={cn(
            "h-5 w-5 rounded-full border-2 transition",
            value.toLowerCase() === c.toLowerCase()
              ? "border-ink"
              : "border-white shadow-sm hover:scale-110",
          )}
        />
      ))}
      <label className="ml-1 inline-flex cursor-pointer items-center gap-1 text-xs text-ink/55">
        <input
          type="color"
          value={isValidColor(value) ? value : "#B8913E"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-5 w-6 cursor-pointer rounded border border-ink/15 bg-transparent p-0"
        />
        Otro
      </label>
    </div>
  );
}
