import { formatTimestampNs } from "@/lib/format";
import type { OrderState } from "@/lib/types";

interface Step {
  label: string;
  kind: "done" | "current" | "todo" | "terminal-ok" | "terminal-bad" | "terminal-neutral";
  when?: string;
}

/**
 * Order status timeline. The main line is Created → Paid → Fulfilled;
 * Cancelled, Refunded and RefundRejected render as honest terminal
 * branches off the point the order actually reached.
 */
export default function OrderTimeline({
  state,
  createdAt,
  paidAt,
}: {
  state: OrderState;
  createdAt: number;
  paidAt: number | null;
}) {
  const created = formatTimestampNs(createdAt);
  const paid = formatTimestampNs(paidAt);
  let steps: Step[];
  switch (state) {
    case "Created":
      steps = [
        { label: "Created", kind: "current", when: created },
        { label: "Paid", kind: "todo" },
        { label: "Fulfilled", kind: "todo" },
      ];
      break;
    case "Paid":
      steps = [
        { label: "Created", kind: "done", when: created },
        { label: "Paid", kind: "current", when: paid },
        { label: "Fulfilled", kind: "todo" },
      ];
      break;
    case "Fulfilled":
      steps = [
        { label: "Created", kind: "done", when: created },
        { label: "Paid", kind: "done", when: paid },
        { label: "Fulfilled", kind: "done" },
      ];
      break;
    case "Cancelled":
      steps = [
        { label: "Created", kind: "done", when: created },
        { label: "Cancelled", kind: "terminal-neutral" },
      ];
      break;
    case "Refunded":
      steps = [
        { label: "Created", kind: "done", when: created },
        { label: "Paid", kind: "done", when: paid },
        { label: "Refunded", kind: "terminal-ok" },
      ];
      break;
    case "RefundRejected":
      steps = [
        { label: "Created", kind: "done", when: created },
        { label: "Paid", kind: "done", when: paid },
        { label: "Refund rejected", kind: "terminal-bad" },
      ];
      break;
  }
  return (
    <ol className="timeline" aria-label={`Order status: ${state}`}>
      {steps.map((s) => (
        <li key={s.label} className={`tl-step ${s.kind}`}>
          <span className="tl-node" aria-hidden="true" />
          <span className="tl-label">{s.label}</span>
          {s.when ? <span className="tl-when">{s.when}</span> : null}
        </li>
      ))}
    </ol>
  );
}
