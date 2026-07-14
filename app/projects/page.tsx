"use client";

import { FormEvent, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { projects } from "@/lib/data";
import { exportRowsToExcel } from "@/lib/export-excel";
import { sortRecordsById } from "@/lib/record-sort";
import { useSyncedRecords } from "@/lib/shared-records";
import type { ProjectStatus } from "@/lib/types";
import { Edit3, FileSpreadsheet, Plus, Save, Trash2, X } from "lucide-react";

type MaintenanceProject = {
  id: string;
  name: string;
  department: string;
  division: string;
  devAssignee: string;
  status: ProjectStatus;
};

const projectStatuses: ProjectStatus[] = ["Planning", "In Progress", "UAT", "Blocked", "Live"];
const projectStorageKey = "it-application-tracker-projects";

const emptyProject: MaintenanceProject = {
  id: "",
  name: "",
  department: "",
  division: "",
  devAssignee: "",
  status: "Planning"
};

const initialProjects: MaintenanceProject[] = projects.map(
  ({ id, name, department, division, devAssignee, status }) => ({
    id,
    name,
    department,
    division,
    devAssignee,
    status
  })
);

function generateProjectId(records: MaintenanceProject[]) {
  const highestProjectNumber = records.reduce((highest, project) => {
    const match = /^APP-(\d+)$/.exec(project.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return `APP-${String(highestProjectNumber + 1).padStart(3, "0")}`;
}

function isMaintenanceProject(value: unknown): value is MaintenanceProject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Partial<MaintenanceProject>;

  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    typeof project.department === "string" &&
    typeof project.division === "string" &&
    typeof project.devAssignee === "string" &&
    projectStatuses.includes(project.status as ProjectStatus)
  );
}

export default function ProjectsPage() {
  const { records, setRecords } = useSyncedRecords(projectStorageKey, initialProjects, isMaintenanceProject);
  const [formData, setFormData] = useState<MaintenanceProject>(emptyProject);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "All">("All");
  const [message, setMessage] = useState("");

  const filteredProjects = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const matchingProjects = records.filter((project) => {
      const matchesStatus = statusFilter === "All" || project.status === statusFilter;
      const searchableValue = [
        project.id,
        project.name,
        project.department,
        project.division,
        project.devAssignee,
        project.status
      ]
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!normalizedSearch || searchableValue.includes(normalizedSearch));
    });

    return sortRecordsById(matchingProjects);
  }, [records, searchTerm, statusFilter]);

  const displayedProjectId = editingId ? formData.id : generateProjectId(records);

  function updateField<Field extends keyof MaintenanceProject>(field: Field, value: MaintenanceProject[Field]) {
    setFormData((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  function resetForm() {
    setFormData(emptyProject);
    setEditingId(null);
    setMessage("");
  }

  function openNewProjectForm() {
    resetForm();
    setIsFormVisible(true);
  }

  function closeForm() {
    resetForm();
    setIsFormVisible(false);
  }

  function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextProject: MaintenanceProject = {
      id: editingId ? formData.id.trim() : generateProjectId(records),
      name: formData.name.trim(),
      department: formData.department.trim(),
      division: formData.division.trim(),
      devAssignee: formData.devAssignee.trim(),
      status: formData.status
    };

    if (
      !nextProject.name ||
      !nextProject.department ||
      !nextProject.division ||
      !nextProject.devAssignee
    ) {
      setMessage("Complete all project maintenance fields before saving.");
      return;
    }

    const duplicateId = records.some((project) => project.id === nextProject.id && project.id !== editingId);

    if (duplicateId) {
      setMessage("Project ID already exists.");
      return;
    }

    if (editingId) {
      setRecords((current) => current.map((project) => (project.id === editingId ? nextProject : project)));
      setMessage(`${nextProject.id} updated.`);
    } else {
      setRecords((current) => sortRecordsById([...current, nextProject]));
      setMessage(`${nextProject.id} added.`);
    }

    setFormData(emptyProject);
    setEditingId(null);
    setIsFormVisible(false);
    setSearchTerm("");
    setStatusFilter("All");
  }

  function editProject(project: MaintenanceProject) {
    setFormData(project);
    setEditingId(project.id);
    setIsFormVisible(true);
    setMessage("");
  }

  function deleteProject(projectId: string) {
    setRecords((current) => current.filter((project) => project.id !== projectId));

    if (editingId === projectId) {
      resetForm();
    } else {
      setMessage(`${projectId} removed.`);
    }
  }

  function exportProjectsToExcel() {
    exportRowsToExcel({
      filename: "project-maintenance.xlsx",
      sheetName: "Project Maintenance",
      headers: ["Project ID", "Name", "Department", "Division", "Dev Assignee", "Status"],
      rows: filteredProjects.map((project) => [
        project.id,
        project.name,
        project.department,
        project.division,
        project.devAssignee,
        project.status
      ])
    });
  }

  return (
    <AppShell>
      <section className="page-header">
        <div>
          <p className="eyebrow">Portfolio control</p>
          <h1>Project Maintenance</h1>
        </div>
        <button className="primary-action" type="button" onClick={openNewProjectForm}>
          <Plus size={17} />
          Add Project
        </button>
      </section>

      {isFormVisible ? (
        <section className="panel maintenance-panel" aria-label="Project maintenance form">
          <div className="panel-heading">
            <h2>{editingId ? "Edit Project" : "Add Project"}</h2>
            <button className="ghost-action" type="button" onClick={closeForm} aria-label="Close project form">
              <X size={17} />
            </button>
          </div>
          <form className="maintenance-form" onSubmit={saveProject}>
            <label>
              Project ID
              <input
                readOnly
                value={displayedProjectId}
                placeholder="System generated"
              />
            </label>
            <label>
              Name
              <input
                value={formData.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Project name"
              />
            </label>
            <label>
              Department
              <input
                value={formData.department}
                onChange={(event) => updateField("department", event.target.value)}
                placeholder="Department"
              />
            </label>
            <label>
              Division
              <input
                value={formData.division}
                onChange={(event) => updateField("division", event.target.value)}
                placeholder="Division"
              />
            </label>
            <label>
              Dev Assignee
              <input
                value={formData.devAssignee}
                onChange={(event) => updateField("devAssignee", event.target.value)}
                placeholder="Developer"
              />
            </label>
            <label>
              Status
              <select
                value={formData.status}
                onChange={(event) => updateField("status", event.target.value as ProjectStatus)}
              >
                {projectStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button className="primary-action" type="submit">
                <Save size={17} />
                {editingId ? "Save Changes" : "Save Project"}
              </button>
              <button className="secondary-action" type="button" onClick={resetForm}>
                Clear
              </button>
            </div>
            {message ? <p className="inline-message">{message}</p> : null}
          </form>
        </section>
      ) : null}

      <section className="toolbar toolbar-with-action" aria-label="Project filters">
        <input
          placeholder="Search project ID, name, department, division, or assignee"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | "All")}
        >
          <option>All</option>
          {projectStatuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <button
          className="secondary-action"
          type="button"
          onClick={exportProjectsToExcel}
          disabled={filteredProjects.length === 0}
        >
          <FileSpreadsheet size={17} />
          Export Excel
        </button>
      </section>
      {!isFormVisible && message ? <p className="inline-message toolbar-message">{message}</p> : null}

      <section className="project-list">
        <div className="project-row project-row-head" aria-hidden="true">
          <span>Project ID</span>
          <span>Name</span>
          <span>Department</span>
          <span>Division</span>
          <span>Dev Assignee</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {filteredProjects.map((project) => (
          <article className="project-row" key={project.id}>
            <div>
              <strong>{project.id}</strong>
            </div>
            <div>
              <strong>{project.name}</strong>
            </div>
            <div>
              <strong>{project.department}</strong>
            </div>
            <div>
              <strong>{project.division}</strong>
            </div>
            <div>
              <strong>{project.devAssignee}</strong>
            </div>
            <div>
              <StatusPill value={project.status} />
            </div>
            <div className="row-actions">
              <button className="icon-action" type="button" onClick={() => editProject(project)} aria-label={`Edit ${project.id}`}>
                <Edit3 size={16} />
              </button>
              <button
                className="icon-action danger-action"
                type="button"
                onClick={() => deleteProject(project.id)}
                aria-label={`Delete ${project.id}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
        {filteredProjects.length === 0 ? (
          <div className="empty-state">No projects match the current filters.</div>
        ) : null}
      </section>
    </AppShell>
  );
}
