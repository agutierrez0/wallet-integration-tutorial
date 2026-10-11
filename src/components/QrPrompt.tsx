import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { WalletPrompt } from "../wallets/types";
import { ActionButton, Spinner } from "./ui";

interface Props {
  prompt: WalletPrompt;
  walletName: string;
  onCancel: () => void;
}

function remainingSeconds(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) ? Math.max(0, Math.round((t - Date.now()) / 1000)) : null;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal shown while an out-of-band approval (QR code) is pending.
export function QrPrompt({ prompt, walletName, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(() => remainingSeconds(prompt.expiresAt));
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setLeft(remainingSeconds(prompt.expiresAt));
    const t = setInterval(() => setLeft(remainingSeconds(prompt.expiresAt)), 1000);
    return () => clearInterval(t);
  }, [prompt.expiresAt]);

  // Move focus into the dialog and give it back on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="qr-backdrop">
      <div
        ref={dialogRef}
        className="qr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-title"
        onKeyDown={onKeyDown}
      >
        <h2 id="qr-title">{prompt.title}</h2>
        <p className="muted" role="status" aria-live="polite">
          Waiting for approval in {walletName}…
        </p>

        {prompt.qrPng && !imgFailed ? (
          <img
            className="qr-image"
            src={prompt.qrPng}
            alt={`QR code. Scan it with the ${walletName} app to approve this request.`}
            width={240}
            height={240}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <p className="muted">
            The QR code couldn't be loaded. Use the button below on your phone instead.
          </p>
        )}

        <div className="qr-meta">
          <Spinner />
          <span aria-hidden="true">
            {left === null ? "Waiting…" : left > 0 ? `Expires in ${fmt(left)}` : "Expired"}
          </span>
          <span className="ui-sr-only">
            {left !== null && left > 0
              ? `This request expires in about ${Math.ceil(left / 60)} minute(s).`
              : ""}
          </span>
        </div>

        <div className="row wrap qr-actions">
          {prompt.deeplink && (
            <a className="ui-btn ui-btn-primary" href={prompt.deeplink}>
              Open in {walletName}
            </a>
          )}
          <ActionButton variant="secondary" onClick={onCancel}>
            Cancel
          </ActionButton>
        </div>
        <p className="muted">
          Cancel withdraws the request so it disappears from your phone.
        </p>
      </div>
    </div>
  );
}
