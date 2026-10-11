import "./ui.css";

export type StepState = "todo" | "current" | "done" | "error";

export interface Step {
  label: string;
  state: StepState;
}

export const DEFAULT_STEPS = ["Connect", "Build", "Sign", "Submit"] as const;

interface StepsProps {
  steps: Step[];
}

const STATE_TEXT: Record<StepState, string> = {
  todo: "not started",
  current: "in progress",
  done: "done",
  error: "failed",
};

export function Steps({ steps }: StepsProps) {
  return (
    <ol className="ui-steps" aria-label="Progress">
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={`ui-step ui-step-${s.state}`}
          aria-current={s.state === "current" ? "step" : undefined}
        >
          <span className="ui-step-marker" aria-hidden="true">
            {s.state === "done" ? "✓" : s.state === "error" ? "!" : i + 1}
          </span>
          <span className="ui-step-label">{s.label}</span>
          <span className="ui-sr-only">: {STATE_TEXT[s.state]}</span>
        </li>
      ))}
    </ol>
  );
}

// Convenience: build the four default steps from the index of the current one.
export function stepsAt(current: number, failed = false): Step[] {
  return DEFAULT_STEPS.map((label, i) => ({
    label,
    state: i < current ? "done" : i === current ? (failed ? "error" : "current") : "todo",
  }));
}
