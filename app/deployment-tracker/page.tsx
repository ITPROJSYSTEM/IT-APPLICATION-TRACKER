"use client";

import { FormEvent, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { exportRowsToExcel } from "@/lib/export-excel";
import { sortRecordsById } from "@/lib/record-sort";
import { useSyncedRecords } from "@/lib/shared-records";
import { Edit3, FileSpreadsheet, Plus, Rocket, Save, Trash2, X } from "lucide-react";

type DeploymentEnvironment = "SVRDEV" | "PORTAL";
type DeploymentStatus = "Scheduled" | "Ready" | "Deploying" | "Successful" | "Failed" | "Rolled Back";

type DeploymentRecord = {
  id: string;
  project: string;
  environment: DeploymentEnvironment;
  version: string;
  scheduledAt: string;
  owner: string;
  status: DeploymentStatus;
};

const deploymentStorageKey = "it-application-tracker-deployments";
const deploymentEnvironments: DeploymentEnvironment[] = ["SVRDEV", "PORTAL"];
const deploymentStatuses: DeploymentStatus[] = [
  "Scheduled",
  "Ready",
  "Deploying",
  "Successful",
  "Failed",
  "Rolled Back"
];
const initialDeployments: DeploymentRecord[] = [];
const emptyDeployment: DeploymentRecord = {
  id: "",
  project: "",
  environment: "UAT",
  version: "",
  scheduledAt: "",
  owner: "",
  status: "Scheduled"
};

function isDeploymentRecord(value: unknown): value is DeploymentRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const deployment = value as Partial<DeploymentRecord>;

  return (
    typeof deployment.id === "string" &&
    typeof deployment.project === "string" &&
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
  if (status === "Successful") return "success";
  if (status === "Failed" || status === "Rolled Back") return "danger";
  if (status === "Deploying") return "warning";
  if (status === "Ready") return "info";
  return "neutral";
}

export default function DeploymentTrackerPage() {
  const { records, setRecords } = useSyncedRecords(
    deploymentStorageKey,
    initialDeployments,
    isDeploymentRecord
  );
  const [formData, setFormData] = useState<DeploymentRecord>(emptyDeployment);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState<DeploymentEnvironment | "All">("All");
  const [statusFilter, setStatusFilter] = useState<DeploymentStatus | "All">("All");
  const [message, setMessage] = useState("");

  const filteredDeployments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return sortRecordsById(
      records.filter((deployment) => {
        const matchesEnvironment =
          environmentFilter === "All" || deployment.environment === environmentFilter;
        const matchesStatus = statusFilter === "All" || deployment.status === statusFilter;
        const searchableValue = [
          deployment.id,
          deployment.project,
          deployment.environment,
          deployment.version,
          deployment.owner,
          deployment.status
        ]
          .join(" ")
          .toLowerCase();

        return (
          matchesEnvironment &&
          matchesStatus &&
          (!normalizedSearch || searchableValue.includes(normalizedSearch))
        );
      })
    );
  }, [environmentFilter, records, searchTerm, statusFilter]);

  const displayedDeploymentId = editingId ? formData.id : generateDeploymentId(records);

  function updateField<Field extends keyof DeploymentRecord>(field: Field, value: DeploymentRecord[Field]) {
    setFormData((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  function resetForm() {
    setFormData(emptyDeployment);
    setEditingId(null);
    setMessage("");
  }

  function openNewDeploymentForm() {
    resetForm();
    setIsFormVisible(true);
  }

  function closeForm() {
    resetForm();
    setIsFormVisible(false);
  }

  function saveDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextDeployment: DeploymentRecord = {
      id: editingId ? formData.id : generateDeploymentId(records),
      project: formData.project.trim(),
      environment: formData.environment,
      version: formData.version.trim(),
      scheduledAt: formData.scheduledAt,
      owner: formData.owner.trim(),
      status: formData.status
    };

    if (
      !nextDeployment.project ||
      !nextDeployment.version ||
      !nextDeployment.scheduledAt ||
      !nextDeployment.owner
    ) {
      setMessage("Complete all deployment fields before saving.");
      return;
    }

    if (editingId) {
      setRecords((current) =>
        current.map((deployment) => (deployment.id === editingId ? nextDeployment : deployment))
      );
      setMessage(`${nextDeployment.id} updated.`);
    } else {
      setRecords((current) => sortRecordsById([...current, nextDeployment]));
      setMessage(`${nextDeployment.id} added.`);
    }

    setFormData(emptyDeployment);
    setEditingId(null);
    setIsFormVisible(false);
    setSearchTerm("");
    setEnvironmentFilter("All");
    setStatusFilter("All");
  }

  function editDeployment(deployment: DeploymentRecord) {
    setFormData(deployment);
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
      headers: ["Deployment ID", "Project", "Environment", "Version", "Scheduled", "Owner", "Status"],
      rows: filteredDeployments.map((deployment) => [
        deployment.id,
        deployment.project,
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
                value={formData.project}
                onChange={(event) => updateField("project", event.target.value)}
                placeholder="Project name"
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
              Scheduled Date and Time
              <input
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(event) => updateField("scheduledAt", event.target.value)}
              />
            </label>
            <label>
              Deployment Owner
              <input
                value={formData.owner}
                onChange={(event) => updateField("owner", event.target.value)}
                placeholder="Responsible person or team"
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
          placeholder="Search deployment, project, version, or owner"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select
          value={environmentFilter}
          onChange={(event) => setEnvironmentFilter(event.target.value as DeploymentEnvironment | "All")}
        >
          <option>All</option>
          {deploymentEnvironments.map((environment) => (
            <option key={environment}>{environment}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as DeploymentStatus | "All")}
        >
          <option>All</option>
          {deploymentStatuses.map((status) => (
            <option key={status}>{status}</option>
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
                <th>Environment</th>
                <th>Version</th>
                <th>Scheduled</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeployments.map((deployment) => (
                <tr key={deployment.id}>
                  <td><strong>{deployment.id}</strong></td>
                  <td><strong>{deployment.project}</strong></td>
                  <td>{deployment.environment}</td>
                  <td>{deployment.version}</td>
                  <td className="date-cell">{formatDeploymentSchedule(deployment.scheduledAt)}</td>
                  <td>{deployment.owner}</td>
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
