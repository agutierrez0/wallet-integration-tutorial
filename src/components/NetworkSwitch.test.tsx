// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NetworkId } from "../lib/networks";
import { NetworkSwitch } from "./NetworkSwitch";

afterEach(() => cleanup());

function setup(props: { value?: NetworkId; disabled?: boolean; reason?: string } = {}) {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState<NetworkId>(props.value ?? "testnet");
    return (
      <NetworkSwitch
        value={value}
        disabled={props.disabled}
        disabledReason={props.reason}
        onChange={(id) => {
          onChange(id);
          setValue(id);
        }}
      />
    );
  }
  render(<Harness />);
  const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
  return { onChange, radio };
}

describe("NetworkSwitch", () => {
  it("offers the three networks as one labelled group and shows the current one", () => {
    const { radio } = setup({ value: "devnet" });
    expect(screen.getByRole("radiogroup", { name: "Network" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Testnet",
      "Devnet",
      "Mainnet",
    ]);
    expect(radio("Devnet").checked).toBe(true);
    expect(radio("Testnet").checked).toBe(false);
  });

  it("selects immediately, with no confirmation, mainnet included", () => {
    const { onChange, radio } = setup();
    fireEvent.click(radio("Mainnet"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("mainnet");
    expect(radio("Mainnet").checked).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("choosing the current network does not fire onChange", () => {
    const { onChange, radio } = setup();
    fireEvent.click(radio("Testnet"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is locked while disabled, explains why, and never changes", () => {
    const reason = "Finish or cancel the current action to switch networks.";
    const { onChange, radio } = setup({ disabled: true, reason });
    expect(radio("Devnet").disabled).toBe(true);
    expect(
      screen.getByRole("radiogroup", { name: "Network" }).getAttribute("aria-describedby"),
    ).toBe(screen.getByText(reason).id);
    fireEvent.click(radio("Devnet"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
