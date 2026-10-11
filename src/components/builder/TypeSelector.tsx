import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Category, CategoryId, TxSchema } from "../../lib/txSchemaTypes";
import "./builder.css";

export interface TypeSelectorProps {
  schemas: TxSchema[];
  categories: Category[];
  // Selected TransactionType. When set the picker collapses to a chip.
  value?: string;
  onSelect: (type: string) => void;
  disabled?: boolean;
}

// True if every character of `needle` appears in `hay` in order.
function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}

// Lower is better; Infinity means no match. Every whitespace-separated token must match.
function scoreSchema(schema: TxSchema, tokens: string[]): number {
  const label = schema.label.toLowerCase();
  const type = schema.type.toLowerCase();
  const desc = schema.description.toLowerCase();
  let total = 0;
  for (const t of tokens) {
    let best = Infinity;
    if (label.startsWith(t) || type.startsWith(t)) best = 0;
    else if (label.includes(t) || type.includes(t)) best = 1;
    else if (desc.includes(t)) best = 2;
    else if (isSubsequence(t, label) || isSubsequence(t, type)) best = 3;
    if (best === Infinity) return Infinity;
    total += best;
  }
  return total;
}

// With an empty query the original order is kept; otherwise results are ranked by match quality.
export function filterSchemas(
  schemas: TxSchema[],
  query: string,
  category: CategoryId | "all" = "all",
): TxSchema[] {
  const inCategory = category === "all" ? schemas : schemas.filter((s) => s.category === category);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return inCategory;
  return inCategory
    .map((schema, index) => ({ schema, index, score: scoreSchema(schema, tokens) }))
    .filter((r) => r.score !== Infinity)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((r) => r.schema);
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function TypeSelector({ schemas, categories, value, onSelect, disabled }: TypeSelectorProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (type: string) => `${uid}-opt-${type}`;

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(!value);

  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const focusInputNext = useRef(false);

  const selected = value ? schemas.find((s) => s.type === value) : undefined;
  const searching = query.trim().length > 0;
  const results = useMemo(
    () => filterSchemas(schemas, query, category),
    [schemas, query, category],
  );

  // Sections only while browsing; a ranked search is one flat list.
  const sections = useMemo(() => {
    if (searching) return [{ id: "results", label: "", items: results }];
    return categories
      .map((c) => ({ id: c.id as string, label: c.label, items: results.filter((s) => s.category === c.id) }))
      .filter((s) => s.items.length > 0);
  }, [categories, results, searching]);

  // Display order, which is also the keyboard order.
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const activeSchema = flat[Math.min(activeIndex, Math.max(flat.length - 1, 0))];

  // biome-ignore lint/correctness/useExhaustiveDependencies: query and category are triggers that reset the highlighted card
  useEffect(() => {
    setActiveIndex(0);
  }, [query, category]);

  // Follow the controlled value: setting it from outside (e.g. restoring from history)
  // collapses the picker to the chip, clearing it re-opens the picker.
  useEffect(() => {
    setOpen(!value);
  }, [value]);

  // Focus the search field once the expanded region is no longer inert.
  useEffect(() => {
    if (open && focusInputNext.current) {
      focusInputNext.current = false;
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const expand = useCallback(() => {
    focusInputNext.current = true;
    setOpen(true);
  }, []);

  // `/` jumps to the search field from anywhere that isn't a text input.
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.documentElement.dataset.modalOpen) return; // a modal (e.g. the QR prompt) owns the keyboard
      e.preventDefault();
      if (open) inputRef.current?.focus();
      else expand();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [disabled, open, expand]);

  const choose = (type: string) => {
    if (disabled) return;
    onSelect(type);
    setOpen(false);
    setQuery("");
    setCategory("all");
    // Hand focus to the Change button so keyboard users aren't dropped.
    requestAnimationFrame(() => changeRef.current?.focus());
  };

  // Next item in the given vertical direction, closest column first.
  const moveVertical = (dir: 1 | -1) => {
    const cur = itemRefs.current[activeIndex];
    if (!cur) return;
    const c = cur.getBoundingClientRect();
    let best = -1;
    let bestRow = Infinity;
    let bestDx = Infinity;
    itemRefs.current.forEach((el, i) => {
      if (!el || i === activeIndex) return;
      const r = el.getBoundingClientRect();
      const dy = (r.top - c.top) * dir;
      if (dy <= 4) return;
      const dx = Math.abs(r.left - c.left);
      if (dy < bestRow - 4 || (Math.abs(dy - bestRow) <= 4 && dx < bestDx)) {
        best = i;
        bestRow = dy;
        bestDx = dx;
      }
    });
    if (best >= 0) setActiveIndex(best);
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const last = flat.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveVertical(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveVertical(-1);
        break;
      // Left/Right/Home/End only steer the grid while the field is empty, so the caret still works.
      case "ArrowRight":
        if (query) return;
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, last));
        break;
      case "ArrowLeft":
        if (query) return;
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        if (query) return;
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        if (query) return;
        e.preventDefault();
        setActiveIndex(Math.max(last, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (activeSchema) choose(activeSchema.type);
        break;
      case "Escape":
        if (query || category !== "all") {
          e.preventDefault();
          setQuery("");
          setCategory("all");
        } else if (selected) {
          e.preventDefault();
          setOpen(false);
          requestAnimationFrame(() => changeRef.current?.focus());
        }
        break;
    }
  };

  itemRefs.current.length = flat.length;
  let flatIndex = -1;

  return (
    <div className="ts" data-open={open} data-disabled={disabled || undefined}>
      <div className="ts-chip-wrap" aria-hidden={open} inert={open || undefined}>
        <div className="ts-chip-clip">
          {selected && (
            <div className="ts-chip">
              <span className="ts-icon" aria-hidden="true">{selected.icon}</span>
              <span className="ts-chip-text">
                <span className="ts-chip-title">
                  {selected.label} <code>{selected.type}</code>
                </span>
                <span className="ts-chip-desc">{selected.description}</span>
              </span>
              <button
                ref={changeRef}
                type="button"
                className="ts-change"
                aria-expanded={open}
                aria-controls={listId}
                disabled={disabled}
                onClick={expand}
              >
                Change
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="ts-picker-wrap" aria-hidden={!open} inert={!open || undefined}>
        <div className="ts-picker-clip">
          <div className="ts-picker">
            <div className="ts-search">
              <svg className="ts-search-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-label="Search transaction types"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeSchema ? optionId(activeSchema.type) : undefined}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Search transaction types…"
                value={query}
                disabled={disabled}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
              />
              {query ? (
                <button
                  type="button"
                  className="ts-clear"
                  aria-label="Clear search"
                  disabled={disabled}
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  ×
                </button>
              ) : (
                <span className="ts-kbd" aria-hidden="true">/</span>
              )}
            </div>

            {/* biome-ignore lint/a11y/useSemanticElements: labelled filter-chip strip; a <fieldset> would add a border/legend box that breaks the chip layout */}
            <div className="ts-chips" role="group" aria-label="Filter by category">
              {[{ id: "all" as const, label: "All" }, ...categories].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="ts-cat"
                  aria-pressed={category === c.id}
                  disabled={disabled}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="ts-status" role="status" aria-live="polite">
              {flat.length === 0
                ? "No matching transaction types"
                : `${flat.length} transaction type${flat.length === 1 ? "" : "s"}`}
            </div>

            <div id={listId} role="listbox" aria-label="Transaction types" className="ts-list">
              {flat.length === 0 && (
                <div className="ts-empty">
                  <p>
                    Nothing matches{searching ? <> “{query.trim()}”</> : null}.
                  </p>
                  <button
                    type="button"
                    className="ts-cat"
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                      inputRef.current?.focus();
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              )}
              {sections.map((section) => (
                // biome-ignore lint/a11y/useSemanticElements: labelled option group inside a listbox; <fieldset> is not valid inside role=listbox
                <div
                  key={section.id}
                  role="group"
                  aria-label={section.label || "Results"}
                  className="ts-section"
                >
                  {section.label && <h3 className="ts-section-title">{section.label}</h3>}
                  <div className="ts-grid">
                    {section.items.map((s) => {
                      flatIndex += 1;
                      const index = flatIndex;
                      return (
                        // biome-ignore lint/a11y/useFocusableInteractive: options are not focusable by design; focus stays in the search input and the active option is exposed via aria-activedescendant
                        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard selection (arrows/Enter) is handled on the search input that owns focus
                        <div
                          key={s.type}
                          id={optionId(s.type)}
                          ref={(el) => {
                            itemRefs.current[index] = el;
                          }}
                          role="option"
                          aria-selected={s.type === value}
                          data-active={index === activeIndex || undefined}
                          className="ts-card"
                          onClick={() => choose(s.type)}
                          onMouseMove={() => index !== activeIndex && setActiveIndex(index)}
                        >
                          <span className="ts-icon" aria-hidden="true">{s.icon}</span>
                          <span className="ts-card-text">
                            <span className="ts-card-title">{s.label}</span>
                            <span className="ts-card-desc">{s.description}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
