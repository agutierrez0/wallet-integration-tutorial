import { describe, expect, it } from "vitest";
import { stripAutofilled } from "./autofill";

describe("stripAutofilled", () => {
  it("removes the fields a wallet fills itself and keeps everything else", () => {
    const tx = {
      TransactionType: "Payment",
      Account: "r1",
      Sequence: 5,
      Fee: "12",
      LastLedgerSequence: 9,
    };
    expect(stripAutofilled(tx)).toEqual({ TransactionType: "Payment", Account: "r1" });
    expect(tx.Sequence).toBe(5); // input is not mutated
  });

  it("keeps Sequence 0 and Sequence alongside a TicketSequence", () => {
    expect(stripAutofilled({ Sequence: 0, Fee: "12" })).toEqual({ Sequence: 0 });
    expect(stripAutofilled({ Sequence: 0, TicketSequence: 3 })).toEqual({
      Sequence: 0,
      TicketSequence: 3,
    });
  });
});
