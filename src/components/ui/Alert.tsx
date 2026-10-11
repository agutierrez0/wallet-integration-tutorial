import type { ReactNode } from "react";
import "./ui.css";

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

const ICON: Record<AlertVariant, string> = {
  error: "!",
  warning: "!",
  info: "i",
  success: "✓",
};

export function Alert({ variant, title, message, hint, error, onRetry, onDismiss }: AlertProps) {
  const v: AlertVariant = variant ?? (error ? "error" : "info");
  const t = title ?? error?.title;
  const m = message ?? error?.message;
  const h = hint ?? error?.hint;
  const canRetry = !!onRetry && (error ? error.retryable : true);

  return (
    <div
      className={`ui-alert ui-alert-${v}`}
      role={v === "error" ? "alert" : "status"}
      aria-live={v === "error" ? "assertive" : "polite"}
    >
      <span className="ui-alert-icon" aria-hidden="true">
        {ICON[v]}
      </span>
      <div className="ui-alert-body">
        {t && <strong className="ui-alert-title">{t}</strong>}
        {m && <div className="ui-alert-message">{m}</div>}
        {h && <div className="ui-alert-hint">{h}</div>}
        {(canRetry || onDismiss) && (
          <div className="ui-alert-actions">
            {canRetry && (
              <button type="button" className="ui-btn ui-btn-secondary" onClick={onRetry}>
                Retry
              </button>
            )}
            {onDismiss && (
              <button type="button" className="ui-btn ui-btn-ghost" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
