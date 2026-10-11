import "./ui.css";

interface SpinnerProps {
  size?: number;
  label?: string; // screen-reader text; omit when a visible label sits next to it
}

export function Spinner({ size = 16, label }: SpinnerProps) {
  return (
    <span
      className="ui-spinner"
      style={{ width: size, height: size }}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
