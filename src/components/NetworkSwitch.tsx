import { useEffect, useId, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import { NETWORK_NAMES } from "../lib/networkStore";
import type { NetworkId } from "../lib/networks";
import "./network.css";

const ORDER: NetworkId[] = ["testnet", "devnet", "mainnet"];

interface Props {
  value: NetworkId;
  onChange: (id: NetworkId) => void;
  disabled?: boolean;
  // Shown as a tooltip and read out by screen readers while disabled.
  disabledReason?: string;
}

// A compact listbox: the pill shows the current network, the menu lists all three.
// Choosing takes effect immediately; mainnet is marked, not confirmed.
export function NetworkSwitch({ value, onChange, disabled = false, disabledReason }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(ORDER.indexOf(value));
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const listId = `${uid}-list`;
  const whyId = `${uid}-why`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  // A busy app closes the menu rather than leaving it open on a locked control.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setActive(ORDER.indexOf(value));
    setOpen(true);
  };

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const choose = (i: number) => {
    const id = ORDER[i];
    if (id !== undefined && id !== value) onChange(id);
    close(true);
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu();
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => (a + 1) % ORDER.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => (a - 1 + ORDER.length) % ORDER.length);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(ORDER.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  const onListBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <div className="net-switch" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`net-pill net-pill--${value}`}
        aria-label={`Network: ${NETWORK_NAMES[value]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled && disabledReason ? whyId : undefined}
        title={disabled ? disabledReason : undefined}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
      >
        <span className="net-dot" aria-hidden="true" />
        <span>{NETWORK_NAMES[value]}</span>
        <span className="net-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {disabled && disabledReason && (
        <span id={whyId} className="ui-sr-only">
          {disabledReason}
        </span>
      )}
      {open && (
        <div
          ref={listRef}
          id={listId}
          className="net-menu"
          role="listbox"
          tabIndex={-1}
          aria-label="Select network"
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKeyDown}
          onBlur={onListBlur}
        >
          {ORDER.map((id, i) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handling lives on the listbox (aria-activedescendant); the option itself is not focusable
            <div
              key={id}
              id={optionId(i)}
              role="option"
              tabIndex={-1}
              aria-selected={id === value}
              className={`net-option net-option--${id}${i === active ? " is-active" : ""}`}
              // keep focus on the listbox so the blur handler doesn't close it before the click lands
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span className="net-dot" aria-hidden="true" />
              <span>{NETWORK_NAMES[id]}</span>
              {id === "mainnet" && <span className="net-real">real XRP</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
