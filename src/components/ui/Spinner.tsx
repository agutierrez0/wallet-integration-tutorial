import { LoadingOutlined } from "@ant-design/icons";

interface SpinnerProps {
  size?: number;
  label?: string; // screen-reader text; omit when a visible label sits next to it
}

export function Spinner({ size = 16, label }: SpinnerProps) {
  const style = { fontSize: size };
  if (label) return <LoadingOutlined spin style={style} role="status" aria-label={label} />;
  return <LoadingOutlined spin style={style} aria-hidden="true" />;
}
