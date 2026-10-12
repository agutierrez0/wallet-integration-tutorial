import { Flex, Select, Typography, theme } from "antd";
import type { RefSelectProps } from "antd";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Category, CategoryId, TxSchema } from "../../lib/txSchemaTypes";

export interface TypeSelectorProps {
  schemas: TxSchema[];
  categories: Category[];
  // Selected TransactionType.
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

interface TypeOption {
  value: string;
  label: string;
  schema: TxSchema;
}

const toOption = (schema: TxSchema): TypeOption => ({
  value: schema.type,
  label: schema.label,
  schema,
});

export function TypeSelector({
  schemas,
  categories,
  value,
  onSelect,
  disabled,
}: TypeSelectorProps) {
  const uid = useId();
  const id = `${uid}-type`;
  const { token } = theme.useToken();
  const selectRef = useRef<RefSelectProps>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = value ? schemas.find((s) => s.type === value) : undefined;

  // Searching gives one ranked list (filterSchemas); browsing groups by category.
  const options = useMemo(() => {
    if (query.trim()) return filterSchemas(schemas, query).map(toOption);
    return categories
      .map((c) => ({
        label: c.label,
        options: schemas.filter((s) => s.category === c.id).map(toOption),
      }))
      .filter((g) => g.options.length > 0);
  }, [schemas, categories, query]);

  // `/` jumps to the search field from anywhere that isn't a text input.
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.documentElement.dataset.modalOpen) return; // a modal (e.g. the QR prompt) owns the keyboard
      e.preventDefault();
      selectRef.current?.focus();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [disabled]);

  return (
    <Flex vertical gap={token.marginXS}>
      <Typography.Text strong>
        <label htmlFor={id}>Transaction type</label>
      </Typography.Text>
      <Select<string>
        ref={selectRef}
        id={id}
        size="large"
        showSearch
        style={{ width: "100%" }}
        value={value}
        placeholder="Search or choose a transaction type (press / to focus)"
        options={options}
        filterOption={false}
        searchValue={query}
        onSearch={setQuery}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        virtual={false}
        disabled={disabled}
        notFoundContent="No matching transaction types"
        optionRender={(opt) => {
          const s = (opt.data as TypeOption).schema;
          return (
            <Flex vertical>
              <span>
                <Typography.Text strong>{s.label}</Typography.Text>{" "}
                <Typography.Text type="secondary" code>
                  {s.type}
                </Typography.Text>
              </span>
              <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {s.description}
              </Typography.Text>
            </Flex>
          );
        }}
        onChange={(next) => onSelect(next)}
      />
      {selected && (
        <Typography.Text type="secondary">
          <Typography.Text code>{selected.type}</Typography.Text> {selected.description}
        </Typography.Text>
      )}
    </Flex>
  );
}
