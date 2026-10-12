import { DatePicker } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { type FieldProps, FieldShell, Hint } from "./FieldShell";

dayjs.extend(utc);

// The schema stores "YYYY-MM-DDTHH:mm:ss" in UTC, the same shape <input type="datetime-local"> uses.
const STORED = "YYYY-MM-DDTHH:mm:ss";

const QUICK_FILLS = [
  { label: "In 1 hour", ms: 60 * 60 * 1000 },
  { label: "In 1 day", ms: 24 * 60 * 60 * 1000 },
];

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
  const parsed = v ? dayjs.utc(v) : null;
  const local = localEquivalent(v);

  return (
    <FieldShell def={def} error={error}>
      {({ id, describedBy, invalid, required }) => (
        <>
          <DatePicker
            id={id}
            showTime={{ format: "HH:mm:ss" }}
            format="YYYY-MM-DD HH:mm:ss [UTC]"
            style={{ width: "100%" }}
            value={parsed?.isValid() ? parsed : null}
            disabled={disabled}
            status={invalid ? "error" : undefined}
            showNow={false}
            aria-invalid={invalid || undefined}
            aria-required={required || undefined}
            aria-describedby={describedBy}
            presets={QUICK_FILLS.map((q) => ({
              label: q.label,
              value: () => dayjs.utc().add(q.ms, "millisecond"),
            }))}
            onChange={(d) => onChange(d ? d.format(STORED) : "")}
            onBlur={onBlur}
          />
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
