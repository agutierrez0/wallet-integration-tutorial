import { useEffect, useMemo, useRef, useState } from "react";
import {
  DROPPED_KEYS,
  getSchema,
  defaultValues,
  validateValues,
  valuesFromTx,
} from "../lib/txSchemas";
import type { FormValues } from "../lib/txSchemaTypes";
import { TxBuilder, buildText } from "./builder/TxBuilder";
import { ActionButton, Alert } from "./ui";

interface Props {
  // Tx JSON text: the source of truth for signing. Empty until a type is chosen.
  value: string;
  signing: boolean;
  // Another operation (e.g. a submission) is in flight: the editor is read-only until it settles.
  busy?: boolean;
  signLabel: string;
  signingLabel: string;
  // Connected wallet address, used for the form's "Use my address" and the built tx.
  account?: string;
  // Why signing is unavailable right now (e.g. no wallet). Shown as a hint.
  disabledReason?: string;
  // Replaces the form and raw state with this tx text whenever `nonce` changes
  // (used to load a transaction from history). Ignored on first render.
  loadRequest?: { nonce: number; text: string };
  onChange: (v: string) => void;
  onSign: () => void;
  onCancel: () => void;
}

// Returns a message if the text can't be signed as-is, else null.
export function validateTxText(text: string): string | null {
  if (!text.trim()) return "Enter a transaction as JSON.";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return `Invalid JSON: ${e instanceof Error ? e.message : "could not parse"}`;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "The transaction must be a JSON object.";
  }
  if (typeof (parsed as Record<string, unknown>).TransactionType !== "string") {
    return 'Missing "TransactionType".';
  }
  return null;
}

// Map existing tx text back onto a form, if its type has a schema.
interface FormFromText {
  type: string;
  values: FormValues;
  dropped: string[];
}

function formFromText(text: string): FormFromText | null {
  if (!text.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const r = valuesFromTx(parsed as Record<string, unknown>);
    return r ? { type: r.schema.type, values: r.values, dropped: r.dropped } : null;
  } catch {
    return null;
  }
}

const QUIET_KEYS = new Set<string>(DROPPED_KEYS);

export interface DroppedNote {
  // Fields the form can't show and that mean the user's input changed: shown loudly.
  loud: string | null;
  // Fields filled in automatically (Fee, Sequence, ...): a quiet reminder.
  quiet: string | null;
}

export function describeDropped(dropped: string[] | undefined): DroppedNote {
  const list = dropped ?? [];
  const loud = list.filter((k) => !QUIET_KEYS.has(k));
  const quiet = list.filter((k) => QUIET_KEYS.has(k));
  return {
    loud: loud.length
      ? `These fields can't be shown in the form and were dropped: ${loud.join(", ")}.`
      : null,
    quiet: quiet.length
      ? quiet.includes("Account") && quiet.length === 1
        ? "Account is taken from the connected wallet."
        : `${quiet.join(", ")} ${quiet.length === 1 ? "is" : "are"} filled in automatically, so ${
            quiet.length === 1 ? "it was" : "they were"
          } left out of the form.`
      : null,
  };
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function TxEditor({
  value,
  signing,
  busy = false,
  signLabel,
  signingLabel,
  account = "",
  disabledReason,
  loadRequest,
  onChange,
  onSign,
  onCancel,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const handledNonce = useRef(loadRequest?.nonce ?? 0);
  const [initial] = useState(() => formFromText(value));
  const [type, setType] = useState<string | undefined>(initial?.type);
  const [values, setValues] = useState<FormValues>(initial?.values ?? {});
  // Text we can't show as a form (e.g. a custom tx) starts in raw mode.
  const [raw, setRaw] = useState(() => !!value.trim() && !initial);
  const [rawNotice, setRawNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [note, setNote] = useState<DroppedNote>(() => describeDropped(initial?.dropped));
  // Bumped on every history restore so touched/error state resets even for the same type.
  const [resetKey, setResetKey] = useState(0);

  const locked = signing || busy;
  const schema = type ? getSchema(type) : undefined;
  const errors = useMemo(
    () => (schema ? validateValues(schema, values, { account: account || undefined }) : {}),
    [schema, values, account],
  );
  const firstError = schema
    ? (schema.fields.map((f) => errors[f.name]).find(Boolean) ?? Object.values(errors)[0])
    : undefined;
  const errorCount = Object.keys(errors).length;
  const preview = useMemo(
    () => (schema ? buildText(schema, values, account) : ""),
    [schema, values, account],
  );

  // Keep the signed text in step with the connected account.
  // biome-ignore lint/correctness/useExhaustiveDependencies: must fire only when the account changes, not on every edit
  useEffect(() => {
    if (raw || !schema) return;
    if (preview !== value) onChange(preview);
  }, [account]);

  // Load a transaction handed over from outside (history). Falls back to raw mode
  // when its type has no form or it can't be represented.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the request nonce only (handledNonce guards repeats)
  useEffect(() => {
    if (!loadRequest || loadRequest.nonce === handledNonce.current) return;
    handledNonce.current = loadRequest.nonce;
    const r = formFromText(loadRequest.text);
    const s = r ? getSchema(r.type) : undefined;
    setShowAll(false);
    setResetKey(loadRequest.nonce);
    if (r && s) {
      setType(r.type);
      setValues(r.values);
      setRaw(false);
      setRawNotice(null);
      setNote(describeDropped(r.dropped));
      onChange(buildText(s, r.values, account));
    } else {
      setRaw(true);
      setRawNotice("Custom transaction: shown as JSON because it has no form.");
      setNote({ loud: null, quiet: null });
      onChange(loadRequest.text);
    }
    const el = rootRef.current;
    if (el) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
      el.focus({ preventScroll: true });
    }
  }, [loadRequest]);

  const selectType = (t: string) => {
    if (t === type) return;
    const s = getSchema(t);
    if (!s) return;
    const v = defaultValues(s);
    setType(t);
    setValues(v);
    setShowAll(false);
    setNote({ loud: null, quiet: null });
    onChange(buildText(s, v, account));
  };

  const changeValues = (v: FormValues) => {
    setValues(v);
    if (schema) onChange(buildText(schema, v, account));
  };

  const leaveRaw = () => {
    if (!value.trim()) {
      if (schema) onChange(preview);
      setRaw(false);
      setRawNotice(null);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setRawNotice("Fix the JSON before going back to the form.");
      return;
    }
    const r =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? valuesFromTx(parsed as Record<string, unknown>)
        : null;
    if (!r) {
      setRawNotice("Custom transaction: can't be shown as a form. Keep editing the JSON.");
      return;
    }
    setType(r.schema.type);
    setValues(r.values);
    setShowAll(false);
    setRaw(false);
    setRawNotice(null);
    setNote(describeDropped(r.dropped));
    onChange(buildText(r.schema, r.values, account));
  };

  // Raw JSON that still names an earlier wallet's account would be autofilled and signed for
  // the wrong account, so it blocks signing until the user fixes it.
  const rawTx = raw ? tryParseObject(value) : null;
  const staleAccount =
    raw && account && rawTx && typeof rawTx.Account === "string" && rawTx.Account !== account
      ? rawTx.Account
      : null;
  const useConnectedAccount = () => {
    if (rawTx) onChange(JSON.stringify({ ...rawTx, Account: account }, null, 2));
  };

  const rawError = raw ? validateTxText(value) : null;
  const needsType = !raw && !schema;
  // Hard-disabled: nothing a click could fix. Form errors are "soft": the click reveals them.
  const hardBlocked = !!rawError || needsType || !!disabledReason || !!staleAccount || busy;
  const softBlocked = !raw && !!schema && errorCount > 0;

  const handleSign = () => {
    if (softBlocked) {
      setShowAll(true);
      requestAnimationFrame(() => {
        rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    onSign();
  };

  let hint: { tone: "bad" | "muted"; text: string };
  if (staleAccount) {
    hint = { tone: "bad", text: "The JSON names a different account than the connected wallet." };
  } else if (raw && rawError) hint = { tone: "bad", text: rawError };
  else if (raw && rawNotice) hint = { tone: "bad", text: rawNotice };
  else if (needsType) hint = { tone: "muted", text: "Choose a transaction type to get started." };
  else if (softBlocked && firstError) {
    hint = {
      tone: showAll ? "bad" : "muted",
      text:
        errorCount > 1
          ? `${firstError} (and ${errorCount - 1} more to fix before signing)`
          : firstError,
    };
  } else if (disabledReason) hint = { tone: "muted", text: disabledReason };
  else {
    hint = {
      tone: "muted",
      text: "Account is filled in from the connected wallet. Sequence, Fee and LastLedgerSequence are autofilled from the selected network.",
    };
  }

  // The live region only changes when the editor moves between these states, so typing in a
  // field doesn't re-announce the hint on every keystroke.
  const sigState = staleAccount
    ? "stale"
    : raw && (rawError || rawNotice)
      ? "raw-invalid"
      : needsType
        ? "needs-type"
        : softBlocked
          ? "invalid"
          : disabledReason
            ? "disabled"
            : "ready";
  const ANNOUNCE: Record<string, string> = {
    stale: "The JSON names a different account than the connected wallet.",
    "raw-invalid": "The JSON can't be signed yet.",
    "needs-type": "",
    invalid: "The form has errors to fix before signing.",
    disabled: "Signing is unavailable.",
    ready: "Ready to sign.",
  };

  return (
    <section className="card" ref={rootRef} tabIndex={-1} aria-label="Transaction">
      <div className="card-head">
        <h2>Build and sign</h2>
        <button
          type="button"
          className="small"
          disabled={locked}
          aria-pressed={raw}
          onClick={() => (raw ? leaveRaw() : (setRaw(true), setRawNotice(null)))}
        >
          {raw ? "Back to form" : "Edit raw JSON"}
        </button>
      </div>

      {raw ? (
        <textarea
          aria-label="Transaction JSON"
          aria-invalid={rawError ? true : undefined}
          aria-describedby="tx-hint"
          spellCheck={false}
          rows={12}
          value={value}
          readOnly={locked}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <TxBuilder
          schema={schema}
          values={values}
          errors={errors}
          account={account}
          signing={locked}
          showAllErrors={showAll}
          resetKey={resetKey}
          preview={preview}
          onSelectType={selectType}
          onChange={changeValues}
        />
      )}

      {staleAccount && (
        <div className="row wrap">
          <span className="bad inline-msg">
            This JSON is for <code>{staleAccount}</code>, but <code>{account}</code> is connected.
          </span>
          <ActionButton variant="secondary" disabled={locked} onClick={useConnectedAccount}>
            Use connected account
          </ActionButton>
        </div>
      )}
      {!raw && note.loud && <Alert variant="warning" message={note.loud} />}
      {!raw && note.quiet && <p className="muted">{note.quiet}</p>}
      <div className="ui-sr-only" role="status" aria-live="polite">
        {ANNOUNCE[sigState]}
      </div>
      <p id="tx-hint" className={hint.tone === "bad" ? "bad inline-msg" : "muted"}>
        {hint.text}
      </p>
      {busy && !signing && <p className="muted">Locked while a submission is in progress.</p>}
      <div className="row wrap">
        <ActionButton
          loading={signing}
          loadingLabel={signingLabel}
          disabled={hardBlocked}
          aria-disabled={softBlocked || undefined}
          className={softBlocked ? "is-soft-disabled" : undefined}
          onClick={handleSign}
        >
          {signLabel}
        </ActionButton>
        {signing && (
          <ActionButton variant="ghost" onClick={onCancel}>
            Cancel
          </ActionButton>
        )}
      </div>
      {signing && (
        <p className="muted">
          Cancel stops waiting and ignores the result. Close any wallet popup that is still open.
        </p>
      )}
    </section>
  );
}
