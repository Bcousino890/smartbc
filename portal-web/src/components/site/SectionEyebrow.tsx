import { type ReactNode } from "react";

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-4">
      <span className="gold-line" />
      <p className="eyebrow">{children}</p>
      <span className="gold-line" />
    </div>
  );
}
