// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QrPrompt, isModalOpen } from "./QrPrompt";

afterEach(() => cleanup());

const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const base = {
  title: "Sign in with Xaman",
  qrPng: "https://example.test/qr.png",
  deeplink: "https://xaman.app/sign/abc",
};

describe("QrPrompt", () => {
  it("is a labelled modal with the QR code, deeplink and countdown", () => {
    render(
      <QrPrompt
        prompt={{ ...base, expiresAt: future(5 * 60_000) }}
        walletName="Xaman"
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Sign in with Xaman" })).toBeTruthy();
    expect(screen.getByText("Waiting for approval in Xaman…")).toBeTruthy();
    expect(screen.getByAltText(/QR code\. Scan it with the Xaman app/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Open in Xaman" });
    expect(link.getAttribute("href")).toBe("https://xaman.app/sign/abc");
    expect(screen.getByText(/Expires in [45]:\d\d/)).toBeTruthy();
  });

  it("Cancel and Escape both call onCancel", () => {
    const onCancel = vi.fn();
    render(
      <QrPrompt
        prompt={{ ...base, expiresAt: future(60_000) }}
        walletName="Xaman"
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", keyCode: 27 });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("sets the modal flag while open and clears it on close", () => {
    const { unmount } = render(<QrPrompt prompt={base} walletName="Xaman" onCancel={() => {}} />);
    expect(isModalOpen()).toBe(true);
    expect(document.documentElement.dataset.modalOpen).toBe("true");
    unmount();
    expect(isModalOpen()).toBe(false);
    expect(document.documentElement.dataset.modalOpen).toBeUndefined();
  });

  it("returns focus to whatever opened it", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<QrPrompt prompt={base} walletName="Xaman" onCancel={() => {}} />);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("an expired request shows a clear message, no QR or deeplink, and a Close button", () => {
    const onCancel = vi.fn();
    render(
      <QrPrompt
        prompt={{ ...base, expiresAt: new Date(Date.now() - 1000).toISOString() }}
        walletName="Xaman"
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.queryByAltText(/QR code/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Open in Xaman" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("falls back to the deeplink text when there is no QR code", () => {
    render(
      <QrPrompt
        prompt={{ title: "Sign", deeplink: "https://xaman.app/sign/abc" }}
        walletName="Xaman"
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/QR code couldn't be loaded/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in Xaman" })).toBeTruthy();
  });
});
