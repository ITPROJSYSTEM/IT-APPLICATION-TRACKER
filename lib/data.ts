import type { Project, TestCase } from "@/lib/types";

export const projects: Project[] = [
  {
    id: "APP-001",
    name: "HR Leave Portal",
    department: "Human Resources",
    division: "Employee Services",
    devAssignee: "Rafael Mercado",
    owner: "Maria Santos",
    status: "In Progress",
    priority: "High",
    startDate: "2026-06-01",
    dueDate: "2026-08-12",
    progress: 68,
    environment: "Staging"
  },
  {
    id: "APP-002",
    name: "Inventory Sync API",
    department: "Operations",
    division: "Supply Chain",
    devAssignee: "Camille Navarro",
    owner: "James Cruz",
    status: "UAT",
    priority: "Critical",
    startDate: "2026-05-10",
    dueDate: "2026-07-28",
    progress: 84,
    environment: "UAT"
  },
  {
    id: "APP-003",
    name: "Finance Approval Workflow",
    department: "Finance",
    division: "Accounting",
    devAssignee: "Miguel Ramos",
    owner: "Ana Reyes",
    status: "Planning",
    priority: "Medium",
    startDate: "2026-07-15",
    dueDate: "2026-10-02",
    progress: 18,
    environment: "Development"
  },
  {
    id: "APP-004",
    name: "Customer Support Console",
    department: "Customer Experience",
    division: "Service Desk",
    devAssignee: "Bianca Flores",
    owner: "Leo Tan",
    status: "Blocked",
    priority: "High",
    startDate: "2026-04-18",
    dueDate: "2026-07-31",
    progress: 51,
    environment: "QA"
  }
];

export const testCases: TestCase[] = [
  {
    id: "HR-01",
    project: "HR Leave Portal",
    module: "Employee submits leave request",
    tester: "Nika Lim",
    testerRemarks: "Submission flow completed without errors.",
    devRemarks: "Ready for regression validation.",
    status: "Passed",
    lastRun: "2026-07-08",
    defects: 0
  },
  {
    id: "HR-02",
    project: "HR Leave Portal",
    module: "Manager rejects invalid leave",
    tester: "Nika Lim",
    testerRemarks: "Rejection reason is not displayed after submission.",
    devRemarks: "Fix queued for approval response handling.",
    status: "Failed",
    lastRun: "2026-07-08",
    defects: 2
  },
  {
    id: "IS-01",
    project: "Inventory Sync API",
    module: "Warehouse item quantity sync",
    tester: "Paolo Garcia",
    testerRemarks: "Quantity sync matched warehouse source data.",
    devRemarks: "No code changes required.",
    status: "Passed",
    lastRun: "2026-07-07",
    defects: 0
  },
  {
    id: "FA-01",
    project: "Finance Approval Workflow",
    module: "Finance approver escalation timer",
    tester: "Mina Dela Cruz",
    testerRemarks: "Awaiting test data from Finance.",
    devRemarks: "Notification timer build is available in dev.",
    status: "Not Started",
    lastRun: "Pending",
    defects: 0
  },
  {
    id: "CS-01",
    project: "Customer Support Console",
    module: "Agent searches ticket history",
    tester: "Rico Bautista",
    testerRemarks: "Search response intermittently times out.",
    devRemarks: "Investigating query timeout on QA database.",
    status: "Blocked",
    lastRun: "2026-07-06",
    defects: 1
  }
];

export const dashboardStats = {
  totalProjects: projects.length,
  activeProjects: projects.filter((project) => project.status === "In Progress" || project.status === "UAT").length,
  openDefects: testCases.reduce((total, testCase) => total + testCase.defects, 0),
  passRate: Math.round(
    (testCases.filter((testCase) => testCase.status === "Passed").length / testCases.length) * 100
  )
};
