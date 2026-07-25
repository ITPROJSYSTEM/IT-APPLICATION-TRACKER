export type ProjectStatus = "Planning" | "In Progress" | "UAT" | "Blocked" | "Live";
export type TestStatus =
  | "Not Started"
  | "To do"
  | "To Do"
  | "Passed"
  | "Complete"
  | "Failed"
  | "Error"
  | "Blocked"
  | "In Progress"
  | "For Review";
export type Priority = "Low" | "Medium" | "High" | "Critical";

export type Project = {
  id: string;
  name: string;
  department: string;
  division: string;
  devAssignee: string;
  owner: string;
  status: ProjectStatus;
  priority: Priority;
  startDate: string;
  dueDate: string;
  progress: number;
  environment: string;
};

export type TestCase = {
  id: string;
  rowKey?: string;
  project: string;
  module: string;
  tester: string;
  testerRemarks: string;
  devRemarks: string;
  status: TestStatus;
  lastRun: string;
  attachment?: TestAttachment | null;
  defects: number;
};

export type TestAttachment = {
  name: string;
  type: string;
  originalSize: number;
  storedSize: number;
  dataUrl: string;
  compressed: boolean;
};
