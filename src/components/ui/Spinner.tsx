import "./ui.css";

interface SpinnerProps {
  size?: number;
  label?: string; // screen-reader text; omit when a visible label sits next to it
}

export function Spinner({ size = 16, label }: SpinnerProps) {
  const style = { width: size, height: size };
  if (label) return <span className="ui-spinner" style={style} role="status" aria-label={label} />;
  return <span className="ui-spinner" style={style} aria-hidden="true" />;
}
