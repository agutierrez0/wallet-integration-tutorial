// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Header } from "./Header";

afterEach(() => cleanup());

const noop = () => {};
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("Header", () => {
  it("shows the app name and the network switch", () => {
    render(<Header networkId="testnet" onNetwork={noop} />);
    expect(screen.getByRole("heading", { name: "XRPL Wallet Sandbox" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Network" })).toBeTruthy();
    expect(radio("Testnet").checked).toBe(true);
  });

  it("shows no banner on testnet or devnet", () => {
    const { rerender } = render(<Header networkId="testnet" onNetwork={noop} />);
    expect(screen.queryByText(/real XRP/)).toBeNull();
    rerender(<Header networkId="devnet" onNetwork={noop} />);
    expect(screen.queryByText(/real XRP/)).toBeNull();
  });

  it("shows the mainnet banner on mainnet", () => {
    render(<Header networkId="mainnet" onNetwork={noop} />);
    expect(screen.getByRole("status").textContent).toContain("Mainnet — real XRP");
    expect(radio("Mainnet").checked).toBe(true);
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
    expect(radio("Devnet").disabled).toBe(true);
    expect(radio("Mainnet").disabled).toBe(true);
  });
});
