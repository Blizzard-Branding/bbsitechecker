import type { Check } from "@/lib/types";

const STATUS_LABEL: Record<Check["status"], string> = {
  pass: "Pass",
  partial: "Partial",
  fail: "Fail",
};

const STATUS_CLASS: Record<Check["status"], string> = {
  pass: "bb-badge-pass",
  partial: "bb-badge-partial",
  fail: "bb-badge-fail",
};

export default function CheckItem({ check }: { check: Check }) {
  return (
    <div className="bb-card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-navy">{check.name}</p>
        <span className={`bb-eyebrow text-xs px-2 py-1 rounded ${STATUS_CLASS[check.status]}`}>
          {STATUS_LABEL[check.status]}
        </span>
      </div>
      <p className="text-sm text-blue">{check.message}</p>
      {check.status !== "pass" && (
        <p className="text-sm text-green">Fix: {check.howToFix}</p>
      )}
    </div>
  );
}
