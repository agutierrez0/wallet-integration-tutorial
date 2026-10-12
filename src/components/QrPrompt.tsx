import { Button, Flex, Image, Modal, Typography } from "antd";
import { useEffect, useState } from "react";
import type { WalletPrompt } from "../wallets/types";
import { Alert, Spinner } from "./ui";

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

// Modal shown while an out-of-band approval (QR code) is pending. It is an antd Modal, so the
// page behind it is inert for keyboard users, Tab stays inside, and Escape cancels.
export function QrPrompt({ prompt, walletName, onCancel }: Props) {
  const [left, setLeft] = useState(() => remainingSeconds(prompt.expiresAt));
  const [imgFailed, setImgFailed] = useState(false);
  const expired = left !== null && left <= 0;
  // Remember who had focus when the prompt opened, and give it back on close.
  const [opener] = useState(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );

  useEffect(() => {
    setLeft(remainingSeconds(prompt.expiresAt));
    const t = setInterval(() => setLeft(remainingSeconds(prompt.expiresAt)), 1000);
    return () => clearInterval(t);
  }, [prompt.expiresAt]);

  useEffect(() => {
    modalOpened();
    return () => {
      modalClosed();
      opener?.focus?.();
    };
  }, [opener]);

  return (
    <Modal
      open
      centered
      width={360}
      title={prompt.title}
      closable={false}
      mask={{ closable: false }}
      keyboard
      onCancel={onCancel}
      footer={
        <Flex justify="flex-end" gap="small" wrap>
          {prompt.deeplink && !expired && (
            <Button type="primary" href={prompt.deeplink}>
              Open in {walletName}
            </Button>
          )}
          <Button type={expired ? "primary" : "default"} onClick={onCancel}>
            {expired ? "Close" : "Cancel"}
          </Button>
        </Flex>
      }
    >
      <Flex vertical align="center" gap="middle">
        <Typography.Text type="secondary" role="status" aria-live="polite">
          {expired
            ? "This request expired. Close this and try again."
            : `Waiting for approval in ${walletName}…`}
        </Typography.Text>

        {expired ? (
          <Alert
            variant="warning"
            title="Expired"
            message={`${walletName} can no longer approve this request. Close this window, then start again.`}
          />
        ) : prompt.qrPng && !imgFailed ? (
          <Image
            src={prompt.qrPng}
            alt={`QR code. Scan it with the ${walletName} app to approve this request.`}
            width={240}
            height={240}
            preview={false}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <Typography.Text type="secondary">
            The QR code couldn't be loaded. Use the button below on your phone instead.
          </Typography.Text>
        )}

        {!expired && (
          <>
            <Flex align="center" gap="small">
              <Spinner />
              <Typography.Text type="secondary" aria-hidden="true">
                {left === null ? "Waiting…" : `Expires in ${formatCountdown(left)}`}
              </Typography.Text>
              <span className="ui-sr-only">
                {left !== null
                  ? `This request expires in about ${Math.ceil(left / 60)} minute(s).`
                  : ""}
              </span>
            </Flex>
            <Typography.Text type="secondary" style={{ textAlign: "center" }}>
              Cancel withdraws the request so it disappears from your phone.
            </Typography.Text>
          </>
        )}
      </Flex>
    </Modal>
  );
}
