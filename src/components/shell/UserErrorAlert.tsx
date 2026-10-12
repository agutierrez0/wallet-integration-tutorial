import { Alert, Button } from "antd";
import type { UserError } from "../../lib/errors";

interface Props {
  error: Pick<UserError, "title" | "message" | "hint" | "retryable">;
  onRetry?: () => void;
  onDismiss?: () => void;
}

// A failed action as an antd Alert: title, plain-language message, optional hint, and a
// Retry button only when the error is worth retrying.
export function UserErrorAlert({ error, onRetry, onDismiss }: Props) {
  return (
    <Alert
      type="error"
      showIcon
      title={error.title}
      description={
        <>
          <div>{error.message}</div>
          {error.hint && <div>{error.hint}</div>}
        </>
      }
      closable={onDismiss ? { onClose: onDismiss, "aria-label": "Dismiss" } : false}
      action={
        error.retryable && onRetry ? (
          <Button size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    />
  );
}
