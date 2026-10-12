// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Header } from "./Header";

afterEach(() => cleanup());

const noop = () => {};

describe("Header", () => {
  it("shows the app name and the network switch", () => {
    render(<Header networkId="testnet" onNetwork={noop} />);
    expect(screen.getByRole("heading", { name: "XRPL Wallet Sandbox" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Network: Testnet" })).toBeTruthy();
  });

  it("shows no banner on testnet or devnet", () => {
    const { rerender } = render(<Header networkId="testnet" onNetwork={noop} />);
    expect(screen.queryByText(/real XRP/)).toBeNull();
    rerender(<Header networkId="devnet" onNetwork={noop} />);
    expect(screen.queryByText(/real XRP/)).toBeNull();
  });

  it("shows the mainnet banner on mainnet", () => {
    render(<Header networkId="mainnet" onNetwork={noop} />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe("Mainnet — real XRP");
    expect(screen.getByRole("button", { name: "Network: Mainnet" }).className).toContain(
      "net-pill--mainnet",
    );
  });

  it("shows the wallet-reported network and where it came from", () => {
    render(
      <Header networkId="testnet" onNetwork={noop} networkHint="Testnet" hintNote="at sign-in" />,
    );
    expect(screen.getByText("Wallet: Testnet (at sign-in)")).toBeTruthy();
  });

  it("shows the mismatch as a strip under the header", () => {
    render(
      <Header
        networkId="devnet"
        onNetwork={noop}
        mismatch="Your wallet is on Testnet but the app is on Devnet."
      />,
    );
    const strip = screen.getByRole("alert");
    expect(strip.textContent).toContain("Your wallet is on Testnet but the app is on Devnet.");
  });

  it("locks the switch while busy", () => {
    render(<Header networkId="testnet" onNetwork={noop} busy />);
    expect(
      screen.getByRole("button", { name: "Network: Testnet" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });
});
