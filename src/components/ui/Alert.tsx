import { Alert as AntAlert, Button, Space } from "antd";
import type { ReactNode } from "react";

export type AlertVariant = "error" | "warning" | "info" | "success";

// Structural match for the UserError produced by src/lib/errors.ts.
export interface UserErrorLike {
  title: string;
  message: string;
  hint?: string;
  retryable: boolean;
}

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  message?: ReactNode;
  hint?: string;
  error?: UserErrorLike; // fills title/message/hint and shows Retry when retryable
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function Alert({ variant, title, message, hint, error, onRetry, onDismiss }: AlertProps) {
  const v: AlertVariant = variant ?? (error ? "error" : "info");
  const t = title ?? error?.title;
  const m = message ?? error?.message;
  const h = hint ?? error?.hint;
  const canRetry = !!onRetry && (error ? error.retryable : true);

  const description =
    m || h ? (
      <>
        {m && <div>{m}</div>}
        {h && <div style={{ opacity: 0.75 }}>{h}</div>}
      </>
    ) : undefined;

  return (
    <AntAlert
      type={v}
      showIcon
      role={v === "error" ? "alert" : "status"}
      aria-live={v === "error" ? "assertive" : "polite"}
      title={t}
      description={description}
      action={
        canRetry || onDismiss ? (
          <Space size="small">
            {canRetry && (
              <Button size="small" onClick={onRetry}>
                Retry
              </Button>
            )}
            {onDismiss && (
              <Button size="small" type="text" onClick={onDismiss}>
                Dismiss
              </Button>
            )}
          </Space>
        ) : undefined
      }
    />
  );
}
