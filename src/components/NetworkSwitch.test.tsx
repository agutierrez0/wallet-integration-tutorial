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
  return { onChange, button: () => screen.getByRole("button", { name: /^Network:/ }) };
}

describe("NetworkSwitch", () => {
  it("shows the current network and starts closed", () => {
    const { button } = setup({ value: "devnet" });
    expect(button().getAttribute("aria-label")).toBe("Network: Devnet");
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens with ArrowDown, with the current network active and the list focused", () => {
    const { button } = setup({ value: "devnet" });
    fireEvent.keyDown(button(), { key: "ArrowDown" });
    const list = screen.getByRole("listbox", { name: "Select network" });
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(list);
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Testnet", "Devnet", "Mainnetreal XRP"]);
    expect(list.getAttribute("aria-activedescendant")).toBe(options[1]?.id);
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("moves with the arrow keys, wraps, and Home/End jump", () => {
    const { button } = setup();
    fireEvent.click(button());
    const list = screen.getByRole("listbox");
    const options = () => screen.getAllByRole("option");
    fireEvent.keyDown(list, { key: "ArrowUp" }); // wraps from testnet to mainnet
    expect(list.getAttribute("aria-activedescendant")).toBe(options()[2]?.id);
    fireEvent.keyDown(list, { key: "ArrowDown" }); // wraps back to testnet
    expect(list.getAttribute("aria-activedescendant")).toBe(options()[0]?.id);
    fireEvent.keyDown(list, { key: "End" });
    expect(list.getAttribute("aria-activedescendant")).toBe(options()[2]?.id);
    fireEvent.keyDown(list, { key: "Home" });
    expect(list.getAttribute("aria-activedescendant")).toBe(options()[0]?.id);
  });

  it("Enter selects immediately, with no confirmation, closes and returns focus", () => {
    const { onChange, button } = setup();
    fireEvent.click(button());
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "End" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("mainnet");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(button().getAttribute("aria-label")).toBe("Network: Mainnet");
    expect(document.activeElement).toBe(button());
  });

  it("clicking an option selects it", () => {
    const { onChange, button } = setup();
    fireEvent.click(button());
    fireEvent.click(screen.getByRole("option", { name: /Devnet/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("devnet");
    expect(button().getAttribute("aria-label")).toBe("Network: Devnet");
  });

  it("choosing the current network does not fire onChange", () => {
    const { onChange, button } = setup();
    fireEvent.click(button());
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape closes without changing and returns focus to the button", () => {
    const { onChange, button } = setup();
    fireEvent.click(button());
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button());
  });

  it("closes when focus leaves", () => {
    const { button } = setup();
    fireEvent.click(button());
    fireEvent.blur(screen.getByRole("listbox"), { relatedTarget: document.body });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("marks mainnet with its own red pill class", () => {
    const { button } = setup({ value: "mainnet" });
    expect(button().className).toContain("net-pill--mainnet");
  });

  it("is locked while disabled, explains why, and never opens", () => {
    const reason = "Finish or cancel the current action to switch networks.";
    const { onChange, button } = setup({ disabled: true, reason });
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect(button().getAttribute("title")).toBe(reason);
    expect(button().getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(reason)).toBeTruthy();
    fireEvent.click(button());
    fireEvent.keyDown(button(), { key: "ArrowDown" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
