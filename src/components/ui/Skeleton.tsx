import { Skeleton as AntSkeleton } from "antd";
import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  className?: string;
}

export function Skeleton({ width = "100%", height = 14, className }: SkeletonProps) {
  return (
    <span aria-hidden="true" className={className} style={{ display: "block", width }}>
      <AntSkeleton.Input active block size="small" style={{ height, minWidth: 0 }} />
    </span>
  );
}

interface SkeletonBlockProps {
  lines?: number;
  label?: string;
}

// Placeholder for a pending output panel (e.g. while signing).
export function SkeletonBlock({ lines = 4, label = "Loading" }: SkeletonBlockProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <AntSkeleton active title={false} paragraph={{ rows: lines }} aria-hidden="true" />
    </div>
  );
}
