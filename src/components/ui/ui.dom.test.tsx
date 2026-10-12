// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionButton, Alert, SkeletonBlock, Spinner, StatusPill, Steps, stepsAt } from "./index";

afterEach(() => cleanup());

describe("ActionButton", () => {
  it("is a real button whose name is its children", () => {
    const onClick = vi.fn();
    render(<ActionButton onClick={onClick}>Sign</ActionButton>);
    const b = screen.getByRole("button", { name: "Sign" }) as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    expect(b.getAttribute("type")).toBe("button");
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("while loading is disabled, busy, shows the loading label and keeps a clean name", () => {
    const onClick = vi.fn();
    render(
      <ActionButton loading loadingLabel="Signing…" onClick={onClick}>
        Sign
      </ActionButton>,
    );
    const b = screen.getByRole("button", { name: "Signing…" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("stays disabled when asked, and passes through aria-label", () => {
    render(
      <ActionButton disabled aria-label="Do it">
        Go
      </ActionButton>,
    );
    expect((screen.getByRole("button", { name: "Do it" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("supports the three variants", () => {
    render(
      <>
        <ActionButton variant="primary">A</ActionButton>
        <ActionButton variant="secondary">B</ActionButton>
        <ActionButton variant="ghost">C</ActionButton>
      </>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});

describe("Alert", () => {
  const error = {
    title: "Wallet locked",
    message: "Unlock it.",
    hint: "Then retry.",
    retryable: true,
  };

  it("renders a UserError as an alert with a retry and dismiss", () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(<Alert error={error} onRetry={onRetry} onDismiss={onDismiss} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Wallet locked")).toBeTruthy();
    expect(screen.getByText("Unlock it.")).toBeTruthy();
    expect(screen.getByText("Then retry.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("hides Retry for a non-retryable error", () => {
    render(<Alert error={{ ...error, retryable: false }} onRetry={() => {}} />);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("non-error variants are polite status messages, not alerts", () => {
    render(<Alert variant="info" title="Heads up" message="Just so you know." />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Heads up");
  });
});

describe("StatusPill, Spinner, SkeletonBlock", () => {
  it("shows the pill text for every tone", () => {
    render(
      <>
        <StatusPill>neutral</StatusPill>
        <StatusPill tone="success">ok</StatusPill>
        <StatusPill tone="error">bad</StatusPill>
        <StatusPill tone="warning">hmm</StatusPill>
        <StatusPill tone="pending">wait</StatusPill>
      </>,
    );
    for (const t of ["neutral", "ok", "bad", "hmm", "wait"])
      expect(screen.getByText(t)).toBeTruthy();
  });

  it("a labelled spinner is a status; an unlabelled one is hidden from assistive tech", () => {
    const { rerender } = render(<Spinner label="Loading data" />);
    expect(screen.getByRole("status", { name: "Loading data" })).toBeTruthy();
    rerender(<Spinner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a skeleton block announces its label as a busy status", () => {
    render(<SkeletonBlock lines={3} label="Waiting for the ledger" />);
    const s = screen.getByRole("status");
    expect(s.getAttribute("aria-busy")).toBe("true");
    expect(s.textContent).toContain("Waiting for the ledger");
  });
});

describe("Steps", () => {
  it("marks the current step and spells out each state for screen readers", () => {
    const { container } = render(<Steps steps={stepsAt(2)} />);
    expect(screen.getByRole("navigation", { name: "Progress" })).toBeTruthy();
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("Sign");
    const text = container.textContent ?? "";
    expect(text).toContain("Connect: done");
    expect(text).toContain("Sign: in progress");
    expect(text).toContain("Submit: not started");
  });

  it("reports a failed step", () => {
    const { container } = render(<Steps steps={stepsAt(1, true)} />);
    expect(container.textContent).toContain("Build: failed");
  });

  it("stepsAt builds the four default steps", () => {
    expect(stepsAt(0).map((s) => s.label)).toEqual(["Connect", "Build", "Sign", "Submit"]);
    expect(stepsAt(4).every((s) => s.state === "done")).toBe(true);
  });
});
