import { useState } from "react";

interface Props {
  label: string;
  value: string;
}

export function CopyBlock({ label, value }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="copy-block">
      <div className="copy-head">
        <span>{label}</span>
        <button type="button" className="small" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{value}</pre>
    </div>
  );
}
