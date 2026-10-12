import { DatePicker } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

// The schema stores "YYYY-MM-DDTHH:mm:ss" in UTC, the same shape <input type="datetime-local"> uses.
const STORED = "YYYY-MM-DDTHH:mm:ss";

const QUICK_FILLS = [
  { label: "In 1 hour", ms: 60 * 60 * 1000 },
  { label: "In 1 day", ms: 24 * 60 * 60 * 1000 },
];

interface Props {
  id: string;
  value: string;
  disabled?: boolean;
  invalid: boolean;
  required: boolean;
  describedBy?: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
}

// Always UTC: values are parsed and shown as UTC digits, never converted to local time.
// This file holds the heavy antd DatePicker, so DateTimeField loads it only when a date field
// is actually shown.
export default function UtcDatePicker({
  id,
  value,
  disabled,
  invalid,
  required,
  describedBy,
  onChange,
  onBlur,
}: Props) {
  const parsed = value ? dayjs.utc(value) : null;
  return (
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
  );
}
