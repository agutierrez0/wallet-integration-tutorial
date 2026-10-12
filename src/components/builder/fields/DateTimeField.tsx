import { Skeleton } from "antd";
import { Suspense, lazy } from "react";
import { type FieldProps, FieldShell, Hint } from "./FieldShell";

// The antd DatePicker is a large dependency that only a few transaction types need.
const UtcDatePicker = lazy(() => import("./UtcDatePicker"));

export function utcValueAfter(ms: number, now = Date.now()): string {
  return new Date(now + ms).toISOString().slice(0, 19);
}

function localEquivalent(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v.length === 16 ? `${v}:00` : v}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

// Always UTC: values are parsed and shown as UTC digits, never converted to local time.
export function DateTimeField({
  def,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: FieldProps<string>) {
  const v = typeof value === "string" ? value : "";
  const local = localEquivalent(v);

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <>
          <Suspense fallback={<Skeleton.Input active block aria-busy="true" />}>
            <UtcDatePicker
              id={id}
              value={v}
              disabled={disabled}
              invalid={invalid}
              required={required}
              describedBy={describedBy}
              onChange={onChange}
              onBlur={onBlur}
            />
          </Suspense>
          <Hint>
            {local
              ? `Time is UTC, not your local time. In your timezone: ${local}.`
              : "Time is UTC, not your local time."}
          </Hint>
        </>
      )}
    </FieldShell>
  );
}
