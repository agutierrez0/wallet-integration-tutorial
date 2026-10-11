import type { ReactNode } from "react";
import "./ui.css";

export type PillTone = "neutral" | "success" | "error" | "warning" | "pending";

interface StatusPillProps {
  tone?: PillTone;
  children: ReactNode;
}

export function StatusPill({ tone = "neutral", children }: StatusPillProps) {
  return (
    <span className={`ui-pill ui-pill-${tone}`}>
      {tone === "pending" && <span className="ui-pill-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
