import { SyncOutlined } from "@ant-design/icons";
import { Tag } from "antd";
import type { ReactNode } from "react";

export type PillTone = "neutral" | "success" | "error" | "warning" | "pending";

interface StatusPillProps {
  tone?: PillTone;
  children: ReactNode;
}

const COLOR: Record<PillTone, string> = {
  neutral: "default",
  success: "success",
  error: "error",
  warning: "warning",
  pending: "processing",
};

export function StatusPill({ tone = "neutral", children }: StatusPillProps) {
  return (
    <Tag
      color={COLOR[tone]}
      icon={tone === "pending" ? <SyncOutlined spin aria-hidden="true" /> : undefined}
      style={{ marginInlineEnd: 0 }}
    >
      {children}
    </Tag>
  );
}
