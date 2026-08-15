"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyLinkButton({
  url,
  label = "Copiar enlace",
  className,
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia el enlace:", url);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition",
        copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-ink/15 bg-white text-ink/75 hover:border-gold/55 hover:text-ink",
        className,
      )}
    >
      {copied ? (
        <Check size={11} strokeWidth={2.5} />
      ) : (
        <Copy size={11} strokeWidth={1.75} className="text-gold-dark" />
      )}
      {copied ? "Copiado" : label}
    </button>
  );
}
