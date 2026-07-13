"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { projects, testCases } from "@/lib/data";
import type { ProjectStatus, TestCase, TestStatus } from "@/lib/types";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  RotateCw,
  Wrench,
  X
} from "lucide-react";

type DashboardAttachment = NonNullable<TestCase["attachment"]>;

type TaskActivity = {
  id: string;
  date: string;
  details: string;
};

type MetricTone = "blue" | "orange" | "purple" | "green";
type DetailSource = "project-modification" | "test-cases" | "task-calendar";

type MetricDetail = {
  id: string;
  source: DetailSource;
  label: string;
  statuses?: TestStatus[];
};

type DashboardProject = {
  id: string;
  name: string;
  department: string;
  division: string;
  devAssignee: string;
  status: ProjectStatus;
  owner?: string;
  progress?: number;
};

const currentUserStorageKey = "it-application-tracker-current-user";
const projectStorageKey = "it-application-tracker-projects";
const testCaseStorageKey = "it-application-tracker-test-cases";
const projectModificationStorageKey = "it-application-tracker-project-modification-records";
const taskActivityStorageKey = "it-application-tracker-task-calendar-activities";

const toDoStatuses: TestStatus[] = ["To Do", "To do", "Not Started"];
const projectModificationStatuses = {
  toDo: toDoStatuses,
  inProgress: ["In Progress"] as TestStatus[],
  forReview: ["For Review"] as TestStatus[],
  complete: ["Complete", "Passed"] as TestStatus[]
};
const testCaseStatuses = {
  toDo: toDoStatuses,
  inWork: ["In Progress"] as TestStatus[],
  error: ["Failed", "Error", "Blocked"] as TestStatus[],
  passed: ["Passed", "Complete"] as TestStatus[]
};

function isProject(value: unknown): value is DashboardProject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Partial<DashboardProject>;

  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    typeof project.department === "string" &&
    typeof project.division === "string" &&
    typeof project.devAssignee === "string" &&
    typeof project.status === "string"
  );
}

function isTestCase(value: unknown): value is TestCase {
  if (!value || typeof value !== "object") {
    return false;
  }

  const testCase = value as Partial<TestCase>;

  return (
    typeof testCase.id === "string" &&
    typeof testCase.project === "string" &&
    typeof testCase.module === "string" &&
    typeof testCase.tester === "string" &&
    typeof testCase.devRemarks === "string" &&
    typeof testCase.status === "string" &&
    typeof testCase.lastRun === "string" &&
    typeof testCase.defects === "number"
  );
}

function isDashboardAttachment(value: unknown): value is DashboardAttachment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attachment = value as Partial<DashboardAttachment>;

  return (
    typeof attachment.name === "string" &&
    typeof attachment.type === "string" &&
    typeof attachment.dataUrl === "string"
  );
}

function isTaskActivity(value: unknown): value is TaskActivity {
  if (!value || typeof value !== "object") {
    return false;
  }

  const activity = value as Partial<TaskActivity>;

  return typeof activity.id === "string" && typeof activity.date === "string" && typeof activity.details === "string";
}

function loadSavedArray<T>(key: string, validator: (value: unknown) => value is T, fallback: T[]) {
  const saved = localStorage.getItem(key);

  if (!saved) {
    return fallback;
  }

  try {
    const parsed: unknown = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return fallback;
    }

    const records = parsed.filter(validator);
    return records.length > 0 ? records : fallback;
  } catch {
    return fallback;
  }
}

function formatUserName(value: string | null) {
  if (!value) {
    return "Jessica Maica Libre";
  }

  const name = value.includes("@") ? value.split("@")[0] : value;
  const cleanedName = name.replace(/[._-]+/g, " ").trim();

  if (!cleanedName) {
    return "Jessica Maica Libre";
  }

  return cleanedName.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getActivityDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function getDashboardDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function getDashboardTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getStatusCount(records: TestCase[], statuses: TestStatus[]) {
  return records.filter((record) => statuses.includes(record.status)).length;
}

function getStatusRecords(records: TestCase[], statuses: TestStatus[]) {
  return records.filter((record) => statuses.includes(record.status));
}

function getProjectProgress(project: DashboardProject) {
  if (typeof project.progress === "number") {
    return project.progress;
  }

  const progressByStatus: Record<ProjectStatus, number> = {
    Planning: 18,
    "In Progress": 60,
    UAT: 84,
    Blocked: 45,
    Live: 100
  };

  return progressByStatus[project.status];
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function renderFormattedText(value: string) {
  return value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function isImageAttachment(attachment: DashboardAttachment) {
  return attachment.type.startsWith("image/") || attachment.dataUrl.startsWith("data:image/");
}

function renderAttachment(attachment: TestCase["attachment"], onOpen: (attachment: DashboardAttachment) => void) {
  if (!isDashboardAttachment(attachment)) {
    return <span className="muted-label">No attachment</span>;
  }

  if (isImageAttachment(attachment)) {
    return (
      <button className="dashboard-attachment-preview" type="button" onClick={() => onOpen(attachment)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.dataUrl} alt={attachment.name} />
        <span>{attachment.name}</span>
      </button>
    );
  }

  return (
    <button className="dashboard-attachment-link" type="button" onClick={() => onOpen(attachment)}>
      {attachment.name}
    </button>
  );
}

function MetricCard({
  label,
  helper,
  value,
  icon: Icon,
  tone,
  onClick,
  detail
}: {
  label: string;
  helper: string;
  value: number | string;
  icon: typeof CalendarDays;
  tone: MetricTone;
  onClick?: () => void;
  detail?: MetricDetail;
}) {
  const content = (
    <>
      <span className="dashboard-metric-icon">
        <Icon size={18} />
      </span>
      <div>
        <h3>{label}</h3>
        <small>{helper}</small>
      </div>
      <strong>{value}</strong>
      {detail || onClick ? <span className="dashboard-metric-view">View</span> : null}
    </>
  );

  if (detail || onClick) {
    return (
      <a
        className={`dashboard-metric-card dashboard-metric-button ${tone}`}
        data-dashboard-detail-label={detail?.label}
        data-dashboard-detail-source={detail?.source}
        data-dashboard-detail-statuses={detail?.statuses?.join("|") ?? ""}
        href={detail ? `#${detail.id}` : undefined}
        onClick={onClick}
      >
        {content}
      </a>
    );
  }

  return (
    <article className={`dashboard-metric-card ${tone}`}>
      {content}
    </article>
  );
}

export default function DashboardPage() {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [currentUser, setCurrentUser] = useState("Jessica Maica Libre");
  const [selectedProject, setSelectedProject] = useState("All Projects");
  const [projectRecords, setProjectRecords] = useState<DashboardProject[]>(projects);
  const [testCaseRecords, setTestCaseRecords] = useState<TestCase[]>(testCases);
  const [projectModificationRecords, setProjectModificationRecords] = useState<TestCase[]>(testCases);
  const [taskActivities, setTaskActivities] = useState<TaskActivity[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<DashboardAttachment | null>(null);

  useEffect(() => {
    setCurrentUser(formatUserName(localStorage.getItem(currentUserStorageKey)));
    setProjectRecords(loadSavedArray(projectStorageKey, isProject, projects));
    setTestCaseRecords(loadSavedArray(testCaseStorageKey, isTestCase, testCases));
    setProjectModificationRecords(loadSavedArray(projectModificationStorageKey, isTestCase, testCases));
    setTaskActivities(loadSavedArray(taskActivityStorageKey, isTaskActivity, []));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const projectOptions = useMemo(() => {
    const names = projectRecords.map((project) => project.name);
    return ["All Projects", ...Array.from(new Set(names))];
  }, [projectRecords]);

  const filteredProjects = selectedProject === "All Projects"
    ? projectRecords
    : projectRecords.filter((project) => project.name === selectedProject);
  const filteredTestCases = selectedProject === "All Projects"
    ? testCaseRecords
    : testCaseRecords.filter((testCase) => testCase.project === selectedProject);
  const filteredProjectModifications = selectedProject === "All Projects"
    ? projectModificationRecords
    : projectModificationRecords.filter((record) => record.project === selectedProject);

  const todayKey = getDateKey(currentTime);
  const monthlyTaskRecords = taskActivities.filter((activity) => {
    const activityDate = new Date(`${activity.date}T00:00:00`);
    return activityDate.getMonth() === currentTime.getMonth() && activityDate.getFullYear() === currentTime.getFullYear();
  });
  const todaysMeetingRecords = taskActivities.filter((activity) => activity.date === todayKey && /meeting/i.test(activity.details));
  const monthlyTasks = monthlyTaskRecords.length;
  const todaysMeetings = todaysMeetingRecords.length;
  const passedCount = getStatusCount(filteredTestCases, testCaseStatuses.passed);

  const detailConfigs = [
    {
      id: "dashboard-detail-project-modification-to-do",
      source: "project-modification" as const,
      title: "Project Modification",
      label: "To Do",
      statuses: projectModificationStatuses.toDo,
      records: getStatusRecords(filteredProjectModifications, projectModificationStatuses.toDo)
    },
    {
      id: "dashboard-detail-project-modification-in-progress",
      source: "project-modification" as const,
      title: "Project Modification",
      label: "In Progress",
      statuses: projectModificationStatuses.inProgress,
      records: getStatusRecords(filteredProjectModifications, projectModificationStatuses.inProgress)
    },
    {
      id: "dashboard-detail-project-modification-for-review",
      source: "project-modification" as const,
      title: "Project Modification",
      label: "For Review",
      statuses: projectModificationStatuses.forReview,
      records: getStatusRecords(filteredProjectModifications, projectModificationStatuses.forReview)
    },
    {
      id: "dashboard-detail-project-modification-complete",
      source: "project-modification" as const,
      title: "Project Modification",
      label: "Complete",
      statuses: projectModificationStatuses.complete,
      records: getStatusRecords(filteredProjectModifications, projectModificationStatuses.complete)
    },
    {
      id: "dashboard-detail-test-cases-to-do",
      source: "test-cases" as const,
      title: "Test Case Management",
      label: "To Do",
      statuses: testCaseStatuses.toDo,
      records: getStatusRecords(filteredTestCases, testCaseStatuses.toDo)
    },
    {
      id: "dashboard-detail-test-cases-in-work",
      source: "test-cases" as const,
      title: "Test Case Management",
      label: "In Work",
      statuses: testCaseStatuses.inWork,
      records: getStatusRecords(filteredTestCases, testCaseStatuses.inWork)
    },
    {
      id: "dashboard-detail-test-cases-error",
      source: "test-cases" as const,
      title: "Test Case Management",
      label: "Error",
      statuses: testCaseStatuses.error,
      records: getStatusRecords(filteredTestCases, testCaseStatuses.error)
    },
    {
      id: "dashboard-detail-test-cases-passed",
      source: "test-cases" as const,
      title: "Test Case Management",
      label: "Passed",
      statuses: testCaseStatuses.passed,
      records: getStatusRecords(filteredTestCases, testCaseStatuses.passed)
    }
  ];

  const taskDetailConfigs = [
    {
      id: "dashboard-detail-task-calendar-monthly",
      title: "Task Calendar",
      label: "Monthly Tasks",
      summary: `${getMonthLabel(currentTime)} - ${monthlyTaskRecords.length} activities`,
      records: monthlyTaskRecords
    },
    {
      id: "dashboard-detail-task-calendar-today-meetings",
      title: "Task Calendar",
      label: "Today's Meetings",
      summary: `${getDashboardDate(currentTime)} - ${todaysMeetingRecords.length} meeting tasks`,
      records: todaysMeetingRecords
    }
  ];

  function renderDetailModal(detail: (typeof detailConfigs)[number]) {
    const dateLabel = detail.source === "project-modification" ? "Date Modified" : "Last Run";
    const emptyLabel = detail.source === "project-modification" ? "records" : "test cases";

    return (
      <div className="dashboard-detail-backdrop dashboard-detail-target" id={detail.id} key={detail.id}>
        <section
          className="dashboard-detail-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${detail.title} ${detail.label} details`}
        >
        <div className="dashboard-detail-header">
          <div>
            <strong>
              {detail.title}: {detail.label}
            </strong>
            <small>
              {selectedProject} - {detail.records.length} {emptyLabel}
            </small>
          </div>
          <a
            className="icon-action"
            href="#dashboard-summary"
            aria-label="Close details"
          >
            <X size={17} />
          </a>
        </div>
        <div className="dashboard-detail-body">
          <div className="table-wrap">
            {detail.source === "project-modification" ? (
              <table className="dashboard-detail-table dashboard-project-modification-detail-table">
                <thead>
                  <tr>
                    <th>Record ID</th>
                    <th>Project Name</th>
                    <th>Details</th>
                    <th>Developer Remarks</th>
                    <th>Status</th>
                    <th>{dateLabel}</th>
                    <th>Attachment</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.records.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.id}</strong>
                      </td>
                      <td>{record.project}</td>
                      <td>{renderFormattedText(record.module)}</td>
                      <td>{renderFormattedText(record.devRemarks)}</td>
                      <td>
                        <StatusPill value={record.status} />
                      </td>
                      <td>{record.lastRun}</td>
                      <td>{renderAttachment(record.attachment ?? null, setPreviewAttachment)}</td>
                    </tr>
                  ))}
                  {detail.records.length === 0 ? (
                    <tr>
                      <td className="empty-table-state" colSpan={7}>
                        No {emptyLabel} match this status.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            ) : (
              <table className="dashboard-detail-table dashboard-test-case-detail-table">
                <thead>
                  <tr>
                    <th>Test Case ID</th>
                    <th>Project Name</th>
                    <th>Test Details</th>
                    <th>Date Tested</th>
                    <th>QA Remarks</th>
                    <th>Developer Remarks</th>
                    <th>Status</th>
                    <th>Attachment</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.records.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>{record.id}</strong>
                      </td>
                      <td>{record.project}</td>
                      <td>{renderFormattedText(record.module)}</td>
                      <td>{record.lastRun}</td>
                      <td>{record.testerRemarks ? renderFormattedText(record.testerRemarks) : "-"}</td>
                      <td>{record.devRemarks ? renderFormattedText(record.devRemarks) : "-"}</td>
                      <td>
                        <StatusPill value={record.status} />
                      </td>
                      <td>{renderAttachment(record.attachment ?? null, setPreviewAttachment)}</td>
                    </tr>
                  ))}
                  {detail.records.length === 0 ? (
                    <tr>
                      <td className="empty-table-state" colSpan={8}>
                        No {emptyLabel} match this status.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
    );
  }

  function renderTaskDetailModal(detail: (typeof taskDetailConfigs)[number]) {
    return (
      <div className="dashboard-detail-backdrop dashboard-detail-target" id={detail.id} key={detail.id}>
        <section
          className="dashboard-detail-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${detail.title} ${detail.label} details`}
        >
          <div className="dashboard-detail-header">
            <div>
              <strong>
                {detail.title}: {detail.label}
              </strong>
              <small>{detail.summary}</small>
            </div>
            <a className="icon-action" href="#dashboard-summary" aria-label="Close details">
              <X size={17} />
            </a>
          </div>
          <div className="dashboard-detail-body">
            <div className="table-wrap">
              <table className="dashboard-detail-table dashboard-task-calendar-detail-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Task Details</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.records.map((activity) => (
                    <tr key={activity.id}>
                      <td>
                        <strong>{getActivityDateLabel(activity.date)}</strong>
                      </td>
                      <td>{renderFormattedText(activity.details)}</td>
                    </tr>
                  ))}
                  {detail.records.length === 0 ? (
                    <tr>
                      <td className="empty-table-state" colSpan={2}>
                        No task calendar activities match this summary.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
    <AppShell>
      <section className="dashboard-hero">
        <div className="dashboard-welcome">
          <div>
            <h1>
              Welcome back, <span>{currentUser}</span>
            </h1>
            <p>Here is what is happening with your projects today.</p>
          </div>
        </div>
        <div className="dashboard-clock" aria-label="Current date and time">
          <span>
            <CalendarDays size={16} />
            {getDashboardDate(currentTime)}
          </span>
          <span>
            <Clock3 size={16} />
            {getDashboardTime(currentTime)}
          </span>
        </div>
        <label className="dashboard-project-filter">
          Select Project
          <select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
            {projectOptions.map((projectName) => (
              <option key={projectName}>{projectName}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="dashboard-summary-grid" id="dashboard-summary" aria-label="Dashboard summaries">
        <article className="panel dashboard-summary-panel">
          <div className="panel-heading compact-heading">
            <h2>
              <CalendarDays size={17} />
              Task Calendar
            </h2>
            <span>{getMonthLabel(currentTime)}</span>
          </div>
          <div className="dashboard-metric-grid">
            <MetricCard
              label="Monthly Tasks"
              helper="Active tasks this month"
              value={monthlyTasks}
              icon={ClipboardList}
              tone="blue"
              detail={{ id: "dashboard-detail-task-calendar-monthly", source: "task-calendar", label: "Monthly Tasks" }}
            />
            <MetricCard
              label="Today's Meetings"
              helper="Meeting tasks scheduled today"
              value={todaysMeetings}
              icon={CalendarDays}
              tone="purple"
              detail={{ id: "dashboard-detail-task-calendar-today-meetings", source: "task-calendar", label: "Today's Meetings" }}
            />
          </div>
          <Link className="dashboard-panel-link" href="/task-calendar-activities">
            View Calendar
            <ChevronRight size={18} />
          </Link>
        </article>

        <article className="panel dashboard-summary-panel">
          <div className="panel-heading compact-heading">
            <h2>
              <ClipboardList size={17} />
              Project Modification
            </h2>
            <span>Count of Per Status</span>
          </div>
          <div className="dashboard-metric-grid">
            <MetricCard
              label="To Do"
              helper="Awaiting modification"
              value={getStatusCount(filteredProjectModifications, projectModificationStatuses.toDo)}
              icon={ClipboardList}
              tone="orange"
              detail={{ id: "dashboard-detail-project-modification-to-do", source: "project-modification", label: "To Do", statuses: projectModificationStatuses.toDo }}
            />
            <MetricCard
              label="In Progress"
              helper="Currently being changed"
              value={getStatusCount(filteredProjectModifications, projectModificationStatuses.inProgress)}
              icon={RotateCw}
              tone="blue"
              detail={{ id: "dashboard-detail-project-modification-in-progress", source: "project-modification", label: "In Progress", statuses: projectModificationStatuses.inProgress }}
            />
            <MetricCard
              label="For Review"
              helper="Needs validation"
              value={getStatusCount(filteredProjectModifications, projectModificationStatuses.forReview)}
              icon={AlertTriangle}
              tone="purple"
              detail={{ id: "dashboard-detail-project-modification-for-review", source: "project-modification", label: "For Review", statuses: projectModificationStatuses.forReview }}
            />
            <MetricCard
              label="Complete"
              helper="Modification completed"
              value={getStatusCount(filteredProjectModifications, projectModificationStatuses.complete)}
              icon={CheckCircle2}
              tone="green"
              detail={{ id: "dashboard-detail-project-modification-complete", source: "project-modification", label: "Complete", statuses: projectModificationStatuses.complete }}
            />
          </div>
          <Link className="dashboard-panel-link" href="/project-modification">
            View All Modifications
            <ChevronRight size={18} />
          </Link>
        </article>

        <article className="panel dashboard-summary-panel">
          <div className="panel-heading compact-heading">
            <h2>
              <ClipboardList size={17} />
              Test Case Management
            </h2>
            <span>Count of Per Status</span>
          </div>
          <div className="dashboard-metric-grid">
            <MetricCard
              label="To Do"
              helper="Ready for testing"
              value={getStatusCount(filteredTestCases, testCaseStatuses.toDo)}
              icon={ClipboardList}
              tone="orange"
              detail={{ id: "dashboard-detail-test-cases-to-do", source: "test-cases", label: "To Do", statuses: testCaseStatuses.toDo }}
            />
            <MetricCard
              label="In Work"
              helper="Testing in progress"
              value={getStatusCount(filteredTestCases, testCaseStatuses.inWork)}
              icon={Wrench}
              tone="blue"
              detail={{ id: "dashboard-detail-test-cases-in-work", source: "test-cases", label: "In Work", statuses: testCaseStatuses.inWork }}
            />
            <MetricCard
              label="Error"
              helper="Failed or blocked"
              value={getStatusCount(filteredTestCases, testCaseStatuses.error)}
              icon={AlertTriangle}
              tone="purple"
              detail={{ id: "dashboard-detail-test-cases-error", source: "test-cases", label: "Error", statuses: testCaseStatuses.error }}
            />
            <MetricCard
              label="Passed"
              helper="Validated cases"
              value={passedCount}
              icon={CheckCircle2}
              tone="green"
              detail={{ id: "dashboard-detail-test-cases-passed", source: "test-cases", label: "Passed", statuses: testCaseStatuses.passed }}
            />
          </div>
          <Link className="dashboard-panel-link" href="/test-cases">
            View All Test Cases
            <ChevronRight size={18} />
          </Link>
        </article>
      </section>

      <section className="dashboard-grid enhanced-dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>
              <ClipboardList size={17} />
              Project Pipeline
            </h2>
            <span>{filteredProjects.length} tracked</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <strong>{project.name}</strong>
                      <small>{project.id}</small>
                    </td>
                    <td>
                      <span className="owner-cell">
                        <span className="owner-avatar">{getInitials(project.owner ?? project.department)}</span>
                        <span>
                          <strong>{project.owner ?? project.department}</strong>
                          <small>{project.department}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <StatusPill value={project.status} />
                    </td>
                    <td>
                      <div className="progress-track" aria-label={`${getProjectProgress(project)}% complete`}>
                        <span style={{ width: `${getProjectProgress(project)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link className="dashboard-panel-link" href="/projects">
            View All Pipelines
            <ChevronRight size={18} />
          </Link>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>
              <CheckCircle2 size={17} />
              Recent Test Runs
            </h2>
            <span>{filteredTestCases.length} cases</span>
          </div>
          <div className="activity-list">
            {filteredTestCases.slice(0, 5).map((testCase) => (
              <article className="activity-item" key={testCase.id}>
                <div>
                  <strong>{testCase.module}</strong>
                  <small>
                    {testCase.project} • {testCase.lastRun}
                  </small>
                </div>
                <StatusPill value={testCase.status} />
              </article>
            ))}
            {filteredTestCases.length === 0 ? <div className="empty-state">No recent test runs.</div> : null}
          </div>
          <Link className="dashboard-panel-link" href="/test-cases">
            View All Test Runs
            <ChevronRight size={18} />
          </Link>
        </div>
      </section>

    </AppShell>
    {previewAttachment ? (
      <div className="attachment-preview-backdrop" role="presentation" onClick={() => setPreviewAttachment(null)}>
        <section
          className="attachment-preview dashboard-attachment-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewAttachment.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="attachment-preview-header">
            <div>
              <strong>{previewAttachment.name}</strong>
              <small>{previewAttachment.type || "Attachment"}</small>
            </div>
            <button
              className="icon-action"
              type="button"
              onClick={() => setPreviewAttachment(null)}
              aria-label="Close preview"
            >
              <X size={17} />
            </button>
          </div>
          <div className="attachment-preview-body dashboard-attachment-preview-body">
            {isImageAttachment(previewAttachment) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewAttachment.dataUrl} alt={previewAttachment.name} />
            ) : (
              <iframe className="dashboard-attachment-frame" src={previewAttachment.dataUrl} title={previewAttachment.name} />
            )}
          </div>
        </section>
      </div>
    ) : null}
    {taskDetailConfigs.map(renderTaskDetailModal)}
    {detailConfigs.map(renderDetailModal)}
    </>
  );
}
