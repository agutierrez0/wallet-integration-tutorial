import { Steps as AntSteps } from "antd";

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

const ANT_STATUS = {
  todo: "wait",
  current: "process",
  done: "finish",
  error: "error",
} as const;

export function Steps({ steps }: StepsProps) {
  const current = Math.max(
    0,
    steps.findIndex((s) => s.state === "current" || s.state === "error"),
  );
  return (
    <nav aria-label="Progress">
      <AntSteps
        size="small"
        current={current}
        items={steps.map((s) => ({
          status: ANT_STATUS[s.state],
          title: (
            <span aria-current={s.state === "current" ? "step" : undefined}>
              {s.label}
              <span className="sr-only">: {STATE_TEXT[s.state]}</span>
            </span>
          ),
        }))}
      />
    </nav>
  );
}

// Convenience: build the four default steps from the index of the current one.
export function stepsAt(current: number, failed = false): Step[] {
  return DEFAULT_STEPS.map((label, i) => ({
    label,
    state: i < current ? "done" : i === current ? (failed ? "error" : "current") : "todo",
  }));
}
