// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeoutError } from "xrpl";
import type { HistoryEntry } from "../lib/historyTypes";
import { HistoryPanel, describeStatus } from "./HistoryPanel";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("../lib/history", async (orig) => ({
  ...(await orig<typeof import("../lib/history")>()),
  lookupTx: lookup,
}));

beforeEach(() => {
  localStorage.clear();
  lookup.mockReset();
});
afterEach(() => cleanup());

const HASH = (n: number) => n.toString(16).toUpperCase().padStart(64, "0");

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now() - 5 * 60_000,
    network: "testnet",
    walletId: "fake",
    account: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    txType: "AccountSet",
    tx: { TransactionType: "AccountSet" },
    hash: HASH(1),
    status: "signed",
    ...over,
  };
}

const setup = (
  entries: HistoryEntry[],
  props: Partial<React.ComponentProps<typeof HistoryPanel>> = {},
) => {
  const handlers = { onRestore: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() };
  render(<HistoryPanel entries={entries} {...handlers} {...props} />);
  return handlers;
};

describe("HistoryPanel", () => {
  it("shows a friendly empty state", () => {
    setup([]);
    expect(screen.getByText(/Nothing here yet/)).toBeTruthy();
    expect(screen.getByText("Stored in this browser only")).toBeTruthy();
  });

  it("says so when browser storage is blocked", () => {
    setup([], { available: false });
    expect(screen.getByRole("status").textContent).toContain("History unavailable");
  });

  it("lists entries with type, network and status, and loads one into the editor", () => {
    const e = entry({ network: "mainnet" });
    const { onRestore } = setup([e]);
    expect(screen.getByText("History (1)")).toBeTruthy();
    expect(screen.getAllByText("AccountSet").length).toBeGreaterThan(0);
    expect(screen.getByText("mainnet")).toBeTruthy();
    expect(screen.getByText("Signed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Load AccountSet/ }));
    expect(onRestore).toHaveBeenCalledWith(e);
  });

  it("shows which wallet signed each entry and the signing account", () => {
    setup([
      entry({ walletId: "crossmark", hash: HASH(1) }),
      entry({ walletId: "xaman", hash: HASH(2) }),
    ]);
    expect(screen.getByText("Crossmark")).toBeTruthy();
    expect(screen.getByText("Xaman")).toBeTruthy();
    expect(screen.getAllByText("rPT1S…pAYe")).toHaveLength(2);
  });

  it("offers an explorer link only for transactions that reached the ledger", () => {
    setup([
      entry({ hash: HASH(1), status: "signed" }),
      entry({ hash: HASH(2), status: "submitted", engineResult: "tesSUCCESS" }),
    ]);
    const links = screen.getAllByRole("link", { name: "View on explorer" });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toContain(HASH(2));
    expect(links[0].getAttribute("rel")).toContain("noopener");
    expect(screen.getAllByRole("button", { name: "Check on-chain" })).toHaveLength(1);
  });

  it("checks an unsubmitted transaction on-chain and reports what it found", async () => {
    lookup.mockResolvedValue({ found: true, validated: true, engineResult: "tesSUCCESS" });
    setup([entry()]);
    fireEvent.click(screen.getByRole("button", { name: "Check on-chain" }));
    expect(await screen.findByText("Found: tesSUCCESS")).toBeTruthy();
    expect(lookup).toHaveBeenCalledWith("testnet", HASH(1));
  });

  it("explains a transaction that is not on the ledger", async () => {
    lookup.mockResolvedValue({ found: false });
    setup([entry()]);
    fireEvent.click(screen.getByRole("button", { name: "Check on-chain" }));
    expect(await screen.findByText(/Not found on Testnet/)).toBeTruthy();
  });

  it("shows an error with a retry when the lookup fails", async () => {
    lookup.mockRejectedValueOnce(new TimeoutError("timed out"));
    setup([entry()]);
    fireEvent.click(screen.getByRole("button", { name: "Check on-chain" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    lookup.mockResolvedValueOnce({ found: false });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/Not found on Testnet/)).toBeTruthy();
  });

  it("failed rows can also be re-checked", () => {
    setup([entry({ status: "failed" })]);
    expect(screen.getByText("Submit failed, outcome unknown")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check on-chain" })).toBeTruthy();
  });

  it("uses the parent's check when given, instead of looking up itself", async () => {
    const onCheckStatus = vi.fn().mockResolvedValue(undefined);
    setup([entry()], { onCheckStatus });
    fireEvent.click(screen.getByRole("button", { name: "Check on-chain" }));
    await waitFor(() => expect(onCheckStatus).toHaveBeenCalledTimes(1));
    expect(lookup).not.toHaveBeenCalled();
  });

  it("removes a single entry", () => {
    const e = entry();
    const { onRemove } = setup([e]);
    fireEvent.click(screen.getByRole("button", { name: "Remove AccountSet from history" }));
    expect(onRemove).toHaveBeenCalledWith(e.id);
  });

  it("asks before clearing everything", async () => {
    const { onClear } = setup([entry({ hash: HASH(1) }), entry({ hash: HASH(2) })]);
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClear).not.toHaveBeenCalled();
    expect(await screen.findByText("Clear all 2?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("caps the list at 25 rows and shows more on request", () => {
    const many = Array.from({ length: 30 }, (_, i) => entry({ hash: HASH(i + 1) }));
    setup(many);
    expect(screen.getAllByRole("button", { name: /^Load / })).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: "Show more (5)" }));
    expect(screen.getAllByRole("button", { name: /^Load / })).toHaveLength(30);
  });

  it("hides and shows the list, and remembers the choice", () => {
    setup([entry()]);
    const toggle = screen.getByRole("button", { name: /History \(1\)/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(toggle.getAttribute("aria-controls") ?? "")?.hidden).toBe(true);
    expect(localStorage.getItem("xrpl-wallet-sandbox:history-open:v1")).toBe("0");
  });

  it("starts collapsed when the saved choice says so", () => {
    localStorage.setItem("xrpl-wallet-sandbox:history-open:v1", "0");
    setup([entry()]);
    expect(
      screen.getByRole("button", { name: /History \(1\)/ }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("disables loading while an action is in flight", () => {
    setup([entry()], { disabled: true });
    expect((screen.getByRole("button", { name: /^Load / }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe("describeStatus", () => {
  it("maps results to tones", () => {
    expect(describeStatus(entry({ status: "signed" }))).toEqual({
      tone: "neutral",
      label: "Signed",
    });
    expect(describeStatus(entry({ status: "submitted", engineResult: "tesSUCCESS" })).tone).toBe(
      "success",
    );
    expect(
      describeStatus(entry({ status: "submitted", engineResult: "tecUNFUNDED_PAYMENT" })).tone,
    ).toBe("warning");
    expect(describeStatus(entry({ status: "submitted", engineResult: "terQUEUED" })).label).toBe(
      "Queued terQUEUED",
    );
    expect(describeStatus(entry({ status: "submitted", engineResult: "temMALFORMED" })).tone).toBe(
      "error",
    );
    expect(describeStatus(entry({ status: "failed" })).label).toBe("Failed");
  });
});
