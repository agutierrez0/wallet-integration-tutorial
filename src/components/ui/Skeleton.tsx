import "./ui.css";
import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  className?: string;
}

export function Skeleton({ width = "100%", height = 14, className }: SkeletonProps) {
  return (
    <span
      className={`ui-skeleton${className ? ` ${className}` : ""}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

interface SkeletonBlockProps {
  lines?: number;
  label?: string;
}

// Placeholder for a pending output panel (e.g. while signing).
export function SkeletonBlock({ lines = 4, label = "Loading" }: SkeletonBlockProps) {
  return (
    <div className="ui-skeleton-block" role="status" aria-live="polite" aria-busy="true">
      <span className="ui-sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative placeholder, never reordered
        <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}
