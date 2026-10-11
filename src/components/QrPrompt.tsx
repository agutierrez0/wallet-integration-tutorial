import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { WalletPrompt } from "../wallets/types";
import { ActionButton, Spinner } from "./ui";
import "./qrprompt.css";

interface Props {
  prompt: WalletPrompt;
  walletName: string;
  onCancel: () => void;
}

export function remainingSeconds(expiresAt?: string, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) ? Math.max(0, Math.round((t - now) / 1000)) : null;
}

export const formatCountdown = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// Modal flag. While a modal prompt is open, <html data-modal-open="true"> is set.
// Global keyboard shortcuts (TypeSelector's "/") should call isModalOpen() and bail out.
// A counter keeps it correct if two modals ever overlap.
// ---------------------------------------------------------------------------

let openModals = 0;

export function modalOpened(): void {
  openModals += 1;
  if (typeof document !== "undefined") document.documentElement.dataset.modalOpen = "true";
}

export function modalClosed(): void {
  openModals = Math.max(0, openModals - 1);
  if (openModals === 0 && typeof document !== "undefined") {
    delete document.documentElement.dataset.modalOpen;
  }
}

export function isModalOpen(): boolean {
  return openModals > 0;
}

// Modal shown while an out-of-band approval (QR code) is pending. It is a native <dialog>
// opened with showModal(), so the rest of the page is inert and Tab stays inside it.
export function QrPrompt({ prompt, walletName, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [left, setLeft] = useState(() => remainingSeconds(prompt.expiresAt));
  const [imgFailed, setImgFailed] = useState(false);
  const expired = left !== null && left <= 0;

  useEffect(() => {
    setLeft(remainingSeconds(prompt.expiresAt));
    const t = setInterval(() => setLeft(remainingSeconds(prompt.expiresAt)), 1000);
    return () => clearInterval(t);
  }, [prompt.expiresAt]);

  // Open as a modal, remember who had focus, and give it back on close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    }
    modalOpened();
    if (!dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    }
    return () => {
      modalClosed();
      if (dialog.open) dialog.close();
      opener?.focus?.();
    };
  }, []);

  // Escape fires "cancel" on the dialog. Let the parent decide so state stays in sync.
  const onDialogCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onCancel();
  };

  // A click on the backdrop lands on the <dialog> itself. Stop it from moving focus to <body>.
  const onMouseDown = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) e.preventDefault();
  };

  return (
    <dialog
      ref={dialogRef}
      className="qr-modal"
      aria-labelledby="qr-title"
      onCancel={onDialogCancel}
      onMouseDown={onMouseDown}
    >
      <div className="qr-dialog">
        <h2 id="qr-title">{prompt.title}</h2>
        <p className="muted" role="status" aria-live="polite">
          {expired
            ? `This request expired. Close this and try again.`
            : `Waiting for approval in ${walletName}…`}
        </p>

        {prompt.qrPng && !imgFailed && !expired ? (
          <img
            className="qr-image"
            src={prompt.qrPng}
            alt={`QR code. Scan it with the ${walletName} app to approve this request.`}
            width={240}
            height={240}
            onError={() => setImgFailed(true)}
          />
        ) : expired ? null : (
          <p className="muted">
            The QR code couldn't be loaded. Use the button below on your phone instead.
          </p>
        )}

        {expired ? (
          <p className="qr-expired">
            Expired. {walletName} can no longer approve this request. Close this window, then start
            again.
          </p>
        ) : (
          <div className="qr-meta">
            <Spinner />
            <span aria-hidden="true">
              {left === null ? "Waiting…" : `Expires in ${formatCountdown(left)}`}
            </span>
            <span className="ui-sr-only">
              {left !== null
                ? `This request expires in about ${Math.ceil(left / 60)} minute(s).`
                : ""}
            </span>
          </div>
        )}

        <div className="row wrap qr-actions">
          {prompt.deeplink && !expired && (
            <a className="ui-btn ui-btn-primary" href={prompt.deeplink}>
              Open in {walletName}
            </a>
          )}
          <ActionButton variant={expired ? "primary" : "secondary"} onClick={onCancel}>
            {expired ? "Close" : "Cancel"}
          </ActionButton>
        </div>
        {!expired && (
          <p className="muted">Cancel withdraws the request so it disappears from your phone.</p>
        )}
      </div>
    </dialog>
  );
}
