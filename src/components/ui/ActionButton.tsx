import { LoadingOutlined } from "@ant-design/icons";
import { Button } from "antd";
import type { ButtonProps } from "antd";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: ReactNode; // replaces children while loading
  type?: "button" | "submit" | "reset";
}

const ANT_TYPE = { primary: "primary", secondary: "default", ghost: "text" } as const;

export function ActionButton({
  variant = "primary",
  loading = false,
  loadingLabel,
  disabled,
  children,
  type = "button",
  ...rest
}: ActionButtonProps) {
  return (
    <Button
      {...(rest as ButtonProps)}
      htmlType={type}
      type={ANT_TYPE[variant]}
      // A custom, aria-hidden icon keeps antd's default "loading" label out of the button's name.
      loading={loading ? { icon: <LoadingOutlined spin aria-hidden="true" /> } : false}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </Button>
  );
}
