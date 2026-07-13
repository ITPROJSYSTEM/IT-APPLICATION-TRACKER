import type { Priority, ProjectStatus, TestStatus } from "@/lib/types";

const statusClass: Record<ProjectStatus | TestStatus | Priority, string> = {
  Planning: "neutral",
  "In Progress": "info",
  UAT: "warning",
  Blocked: "danger",
  Live: "success",
  "Not Started": "neutral",
  "To do": "neutral",
  "To Do": "neutral",
  Passed: "success",
  Complete: "success",
  Failed: "danger",
  Error: "danger",
  "For Review": "warning",
  Low: "neutral",
  Medium: "info",
  High: "warning",
  Critical: "danger"
};

export function StatusPill({ value }: { value: ProjectStatus | TestStatus | Priority }) {
  return <span className={`status-pill ${statusClass[value]}`}>{value}</span>;
}
