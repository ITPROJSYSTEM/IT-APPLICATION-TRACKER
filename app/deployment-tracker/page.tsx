"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { projects } from "@/lib/data";
import { exportRowsToExcel } from "@/lib/export-excel";
import { sortRecordsById } from "@/lib/record-sort";
import { useSyncedRecords } from "@/lib/shared-records";
import { Edit3, FileSpreadsheet, Plus, Rocket, Save, Trash2, X } from "lucide-react";

type DeploymentEnvironment = "SVRDEV" | "PORTAL";
type DeploymentStatus =
  | "Scheduled"
  | "Ready"
  | "Deploying"
  | "Currently in SVRDEV"
  | "Already up on the portal"
  | "Successful"
  | "Failed";

type DeploymentRecord = {
  id: string;
  project: string;
  description?: string;
  environment: DeploymentEnvironment;
  version: string;
  scheduledAt: string;
  owner: string;
  status: DeploymentStatus;
};

type ProjectOptionRecord = {
  name: string;
};

const projectStorageKey = "it-application-tracker-projects";
const deploymentStorageKey = "it-application-tracker-deployments";
const deploymentEnvironments: DeploymentEnvironment[] = ["SVRDEV", "PORTAL"];
const deploymentStatuses: DeploymentStatus[] = [
  "Scheduled",
  "Ready",
  "Deploying",
  "Currently in SVRDEV",
  "Already up on the portal",
  "Successful",
  "Failed",
];
const initialDeployments: DeploymentRecord[] = [];
const emptyDeployment: DeploymentRecord = {
  id: "",
  project: "",
  description: "",
  environment: "SVRDEV",
  version: "",
  scheduledAt: "",
  owner: "",
  status: "Scheduled"
};

function isProjectOptionRecord(value: unknown): value is ProjectOptionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Partial<ProjectOptionRecord>;

  return typeof project.name === "string";
}

function isDeploymentRecord(value: unknown): value is DeploymentRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const deployment = value as Partial<DeploymentRecord>;

  return (
    typeof deployment.id === "string" &&
    typeof deployment.project === "string" &&
    (typeof deployment.description === "string" || typeof deployment.description === "undefined") &&
    deploymentEnvironments.includes(deployment.environment as DeploymentEnvironment) &&
    typeof deployment.version === "string" &&
    typeof deployment.scheduledAt === "string" &&
    typeof deployment.owner === "string" &&
    deploymentStatuses.includes(deployment.status as DeploymentStatus)
  );
}

function generateDeploymentId(records: DeploymentRecord[]) {
  const highestNumber = records.reduce((highest, deployment) => {
    const match = /^DPL-(\d+)$/.exec(deployment.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return `DPL-${String(highestNumber + 1).padStart(3, "0")}`;
}

function getProjectDeploymentDefaults(records: DeploymentRecord[], projectName: string) {
  const normalizedProjectName = projectName.trim().toLowerCase();

  if (!normalizedProjectName) {
    return {
      version: "",
      scheduledAt: ""
    };
  }

  const latestProjectDeployment = sortRecordsById(
    records.filter((deployment) => deployment.project.trim().toLowerCase() === normalizedProjectName)
  ).at(-1);

  return {
    version: latestProjectDeployment?.version ?? "",
    scheduledAt: latestProjectDeployment?.scheduledAt ?? ""
  };
}

function formatDeploymentSchedule(value: string) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getDeploymentTone(status: DeploymentStatus) {
  if (status === "Successful" || status === "Already up on the portal") return "success";
  if (status === "Failed") return "danger";
  if (status === "Deploying" || status === "Scheduled") return "warning";
  if (status === "Ready" || status === "Currently in SVRDEV") return "info";
  return "neutral";
}

export default function DeploymentTrackerPage() {
  const { records, setRecords } = useSyncedRecords(
    deploymentStorageKey,
    initialDeployments,
    isDeploymentRecord
  );
  const { records: projectOptionRecords, isReady: areProjectsReady } = useSyncedRecords(
    projectStorageKey,
    projects,
    isProjectOptionRecord
  );
  const [formData, setFormData] = useState<DeploymentRecord>(emptyDeployment);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | "All">("All");
  const [environmentFilter, setEnvironmentFilter] = useState<DeploymentEnvironment | "All">("All");
  const [message, setMessage] = useState("");

  const projectOptions = useMemo(() => {
    const projectNames = [
      ...(areProjectsReady ? projectOptionRecords.map((project) => project.name.trim()) : []),
      ...records.map((deployment) => deployment.project.trim())
    ].filter(Boolean);

    return Array.from(new Set(projectNames));
  }, [areProjectsReady, projectOptionRecords, records]);

  const activeProjectNames = useMemo(() => new Set(projectOptions), [projectOptions]);

  useEffect(() => {
    if (projectFilter !== "All" && !activeProjectNames.has(projectFilter)) {
      setProjectFilter("All");
    }
  }, [activeProjectNames, projectFilter]);

  const filteredDeployments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return sortRecordsById(
      records.filter((deployment) => {
        const matchesProject = projectFilter === "All" || deployment.project === projectFilter;
        const matchesEnvironment =
          environmentFilter === "All" || deployment.environment === environmentFilter;
        const searchableValue = [
          deployment.id,
          deployment.project,
          deployment.description ?? "",
          deployment.environment,
          deployment.version,
          deployment.owner,
          deployment.status
        ]
          .join(" ")
          .toLowerCase();

        return (
          matchesProject &&
          matchesEnvironment &&
          (!normalizedSearch || searchableValue.includes(normalizedSearch))
        );
      })
    );
  }, [environmentFilter, projectFilter, records, searchTerm]);

  const displayedDeploymentId = editingId ? formData.id : generateDeploymentId(records);

  function getFilteredProjectDeployment() {
    const project = projectFilter === "All" ? "" : projectFilter;
    const projectDefaults = getProjectDeploymentDefaults(records, project);

    return {
      ...emptyDeployment,
      project,
      ...projectDefaults
    };
  }

  function updateField<Field extends keyof DeploymentRecord>(field: Field, value: DeploymentRecord[Field]) {
    setFormData((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  function updateProjectField(project: string) {
    const projectDefaults = getProjectDeploymentDefaults(records, project);

    setFormData((current) => ({
      ...current,
      project,
      ...projectDefaults
    }));
    setMessage("");
  }

  function resetForm() {
    setFormData(getFilteredProjectDeployment());
    setEditingId(null);
    setMessage("");
  }

  function openNewDeploymentForm() {
    resetForm();
    setIsFormVisible(true);
  }

  function closeForm() {
    setFormData(emptyDeployment);
    setEditingId(null);
    setMessage("");
    setIsFormVisible(false);
  }

  function saveDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextDeployment: DeploymentRecord = {
      id: editingId ? formData.id : generateDeploymentId(records),
      project: formData.project.trim(),
      description: formData.description?.trim() ?? "",
      environment: formData.environment,
      version: formData.version.trim(),
      scheduledAt: formData.scheduledAt,
      owner: formData.owner.trim(),
      status: formData.status
    };

    if (
      !nextDeployment.project ||
      !nextDeployment.version
    ) {
      setMessage("Complete all required deployment fields before saving.");
      return;
    }

    if (editingId) {
      setRecords((current) =>
        current.map((deployment) => (deployment.id === editingId ? nextDeployment : deployment))
      );
      setMessage(`${nextDeployment.id} updated.`);
      setFormData(nextDeployment);
      setEditingId(nextDeployment.id);
    } else {
      setRecords((current) => sortRecordsById([...current, nextDeployment]));
      setMessage(`${nextDeployment.id} added.`);
      setFormData({
        ...emptyDeployment,
        project: nextDeployment.project,
        environment: nextDeployment.environment,
        version: nextDeployment.version,
        scheduledAt: nextDeployment.scheduledAt
      });
      setEditingId(null);
    }
  }

  function editDeployment(deployment: DeploymentRecord) {
    setFormData({ ...deployment, description: deployment.description ?? "" });
    setEditingId(deployment.id);
    setIsFormVisible(true);
    setMessage("");
  }

  function deleteDeployment(deploymentId: string) {
    setRecords((current) => current.filter((deployment) => deployment.id !== deploymentId));

    if (editingId === deploymentId) {
      closeForm();
    } else {
      setMessage(`${deploymentId} removed.`);
    }
  }

  function exportDeploymentsToExcel() {
    exportRowsToExcel({
      filename: "deployment-tracker.xlsx",
      sheetName: "Deployments",
      headers: ["Deployment ID", "Project", "Description", "Environment", "Version", "Scheduled", "Owner", "Status"],
      rows: filteredDeployments.map((deployment) => [
        deployment.id,
        deployment.project,
        deployment.description ?? "",
        deployment.environment,
        deployment.version,
        formatDeploymentSchedule(deployment.scheduledAt),
        deployment.owner,
        deployment.status
      ])
    });
  }

  return (
    <AppShell>
      <section className="page-header">
        <div>
          <p className="eyebrow">Release operations</p>
          <h1>Deployment Tracker</h1>
        </div>
        <button className="primary-action" type="button" onClick={openNewDeploymentForm}>
          <Plus size={17} />
          Add Deployment
        </button>
      </section>

      {isFormVisible ? (
        <section className="panel maintenance-panel" aria-label="Deployment form">
          <div className="panel-heading">
            <h2>
              <Rocket size={17} />
              {editingId ? "Edit Deployment" : "Add Deployment"}
            </h2>
            <button className="ghost-action" type="button" onClick={closeForm} aria-label="Close deployment form">
              <X size={17} />
            </button>
          </div>
          <form className="maintenance-form" onSubmit={saveDeployment}>
            <label>
              Deployment ID
              <input readOnly value={displayedDeploymentId} placeholder="System generated" />
            </label>
            <label>
              Project
              <input
                list="deployment-project-options"
                value={formData.project}
                onChange={(event) => updateProjectField(event.target.value)}
                placeholder="Project name"
              />
              <datalist id="deployment-project-options">
                {projectOptions.map((projectName) => (
                  <option key={projectName} value={projectName} />
                ))}
              </datalist>
            </label>
            <label>
              Description
              <input
                value={formData.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Deployment description"
              />
            </label>
            <label>
              Environment
              <select
                value={formData.environment}
                onChange={(event) => updateField("environment", event.target.value as DeploymentEnvironment)}
              >
                {deploymentEnvironments.map((environment) => (
                  <option key={environment}>{environment}</option>
                ))}
              </select>
            </label>
            <label>
              Version
              <input
                value={formData.version}
                onChange={(event) => updateField("version", event.target.value)}
                placeholder="Example: v2.4.0"
              />
            </label>
            <label>
              Scheduled Date and Time <span className="optional-label">Optional</span>
              <input
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(event) => updateField("scheduledAt", event.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={formData.status}
                onChange={(event) => updateField("status", event.target.value as DeploymentStatus)}
              >
                {deploymentStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button className="primary-action" type="submit">
                <Save size={17} />
                {editingId ? "Save Changes" : "Save Deployment"}
              </button>
              <button className="secondary-action" type="button" onClick={resetForm}>
                Clear
              </button>
            </div>
            {message ? <p className="inline-message">{message}</p> : null}
          </form>
        </section>
      ) : null}

      <section className="toolbar deployment-toolbar" aria-label="Deployment filters">
        <input
          placeholder="Search deployment, project, version, or status"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          aria-label="Filter by project name"
        >
          <option value="All">All Projects</option>
          {projectOptions.map((projectName) => (
            <option key={projectName} value={projectName}>
              {projectName}
            </option>
          ))}
        </select>
        <select
          value={environmentFilter}
          onChange={(event) => setEnvironmentFilter(event.target.value as DeploymentEnvironment | "All")}
        >
          <option>All</option>
          {deploymentEnvironments.map((environment) => (
            <option key={environment}>{environment}</option>
          ))}
        </select>
        <button
          className="secondary-action"
          type="button"
          onClick={exportDeploymentsToExcel}
          disabled={filteredDeployments.length === 0}
        >
          <FileSpreadsheet size={17} />
          Export Excel
        </button>
      </section>
      {!isFormVisible && message ? <p className="inline-message toolbar-message">{message}</p> : null}

      <section className="panel deployment-panel">
        <div className="panel-heading">
          <h2>
            <Rocket size={17} />
            Deployment Schedule
          </h2>
          <span>{filteredDeployments.length} records</span>
        </div>
        <div className="table-wrap">
          <table className="deployment-table">
            <thead>
              <tr>
                <th>Deployment ID</th>
                <th>Project</th>
                <th>Description</th>
                <th>Environment</th>
                <th>Version</th>
                <th>Scheduled</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeployments.map((deployment) => (
                <tr key={deployment.id}>
                  <td><strong>{deployment.id}</strong></td>
                  <td><strong>{deployment.project}</strong></td>
                  <td>{deployment.description ?? ""}</td>
                  <td>{deployment.environment}</td>
                  <td>{deployment.version}</td>
                  <td className="date-cell">{formatDeploymentSchedule(deployment.scheduledAt)}</td>

                  <td>
                    <span className={`status-pill ${getDeploymentTone(deployment.status)}`}>
                      {deployment.status}
                    </span>
                  </td>
                  <td>
                    <span className="row-actions">
                      <button
                        className="icon-action"
                        type="button"
                        onClick={() => editDeployment(deployment)}
                        aria-label={`Edit ${deployment.id}`}
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        className="icon-action danger-action"
                        type="button"
                        onClick={() => deleteDeployment(deployment.id)}
                        aria-label={`Delete ${deployment.id}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {filteredDeployments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-state">No deployments match the current filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

    </AppShell>
  );
}
