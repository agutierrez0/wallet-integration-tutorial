import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCountdown, isModalOpen, modalClosed, modalOpened, remainingSeconds } from "./QrPrompt";

describe("remainingSeconds", () => {
  const now = Date.parse("2030-01-01T00:00:00Z");

  it("counts down to the expiry and stops at zero", () => {
    expect(remainingSeconds("2030-01-01T00:05:00Z", now)).toBe(300);
    expect(remainingSeconds("2030-01-01T00:00:01Z", now)).toBe(1);
    expect(remainingSeconds("2030-01-01T00:00:00Z", now)).toBe(0);
    expect(remainingSeconds("2029-12-31T23:00:00Z", now)).toBe(0);
  });

  it("returns null with no usable expiry", () => {
    expect(remainingSeconds(undefined, now)).toBeNull();
    expect(remainingSeconds("not a date", now)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("formats m:ss", () => {
    expect(formatCountdown(300)).toBe("5:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(0)).toBe("0:00");
  });
});

describe("modal flag", () => {
  afterEach(() => {
    while (isModalOpen()) modalClosed();
    vi.unstubAllGlobals();
  });

  it("is open while at least one modal is, and sets the html data attribute", () => {
    const doc = { documentElement: { dataset: {} as Record<string, string> } };
    vi.stubGlobal("document", doc);

    expect(isModalOpen()).toBe(false);
    modalOpened();
    expect(isModalOpen()).toBe(true);
    expect(doc.documentElement.dataset.modalOpen).toBe("true");

    modalOpened(); // a second, overlapping modal
    modalClosed();
    expect(isModalOpen()).toBe(true);
    expect(doc.documentElement.dataset.modalOpen).toBe("true");

    modalClosed();
    expect(isModalOpen()).toBe(false);
    expect(doc.documentElement.dataset.modalOpen).toBeUndefined();
  });

  it("never goes negative when closed too often", () => {
    vi.stubGlobal("document", { documentElement: { dataset: {} } });
    modalClosed();
    modalClosed();
    expect(isModalOpen()).toBe(false);
    modalOpened();
    expect(isModalOpen()).toBe(true);
  });
});
