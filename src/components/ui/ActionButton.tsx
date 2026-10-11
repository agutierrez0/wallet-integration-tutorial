import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";
import "./ui.css";

export type ButtonVariant = "primary" | "secondary" | "ghost";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: ReactNode; // replaces children while loading
}

export function ActionButton({
  variant = "primary",
  loading = false,
  loadingLabel,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ActionButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`ui-btn ui-btn-${variant}${className ? ` ${className}` : ""}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <Spinner />}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
}
