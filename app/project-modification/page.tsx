"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { FormattedText } from "@/components/formatted-text";
import { StatusPill } from "@/components/status-pill";
import { projects, testCases } from "@/lib/data";
import { exportRowsToExcel } from "@/lib/export-excel";
import { formatDateForDisplay } from "@/lib/format";
import { readRowsFromExcel, readSheetNamesFromExcel, type ExcelSheetOption } from "@/lib/import-excel";
import { importTestCaseRows } from "@/lib/import-records";
import { sortRecordsById } from "@/lib/record-sort";
import { useSyncedRecords } from "@/lib/shared-records";
import type { TestAttachment, TestCase, TestStatus } from "@/lib/types";
import { readCurrentUserProfile } from "@/lib/user-profile";
import { Bold, Edit3, FileSpreadsheet, Paperclip, Plus, Save, Trash2, Upload, X } from "lucide-react";

const testStatuses: TestStatus[] = ["To Do", "Complete", "In Progress", "For Review"];
const knownTestStatuses: TestStatus[] = [
  "Not Started",
  "To do",
  "To Do",
  "Passed",
  "Complete",
  "Failed",
  "Error",
  "Blocked",
  "In Progress",
  "For Review"
];
const projectStorageKey = "it-application-tracker-projects";
const testCaseStorageKey = "it-application-tracker-project-modification-records";
const maxImageDimension = 1400;
const maxStoredAttachmentBytes = 900 * 1024;
const maxPlainAttachmentBytes = 350 * 1024;

type ProjectOptionRecord = {
  name: string;
};

type PendingImport = {
  file: File;
  selectedSheetName: string;
  sheets: ExcelSheetOption[];
};

const emptyTestCase: TestCase = {
  id: "",
  project: "",
  module: "",
  tester: "",
  testerRemarks: "",
  devRemarks: "",
  status: "To Do",
  lastRun: "",
  attachment: null,
  defects: 0
};

function isDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getProjectCode(projectName: string) {
  const words = projectName.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  const compactName = words[0]?.toUpperCase() ?? "";

  return compactName.slice(0, 2).padEnd(2, "X");
}

function generateTestCaseId(records: TestCase[], projectName: string) {
  if (!projectName.trim()) {
    return "";
  }

  const projectCode = getProjectCode(projectName);
  const projectRecords = records.filter((testCase) => testCase.project === projectName);
  const highestFormattedNumber = projectRecords.reduce((highest, testCase) => {
    const match = new RegExp(`^${projectCode}-(\\d+)$`).exec(testCase.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const nextNumber = highestFormattedNumber > 0 ? highestFormattedNumber + 1 : projectRecords.length + 1;

  return `${projectCode}-${String(nextNumber).padStart(2, "0")}`;
}

function isProjectOptionRecord(value: unknown): value is ProjectOptionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Partial<ProjectOptionRecord>;

  return typeof project.name === "string";
}

function isTestAttachment(value: unknown): value is TestAttachment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attachment = value as Partial<TestAttachment>;

  return (
    typeof attachment.name === "string" &&
    typeof attachment.type === "string" &&
    typeof attachment.originalSize === "number" &&
    typeof attachment.storedSize === "number" &&
    typeof attachment.dataUrl === "string" &&
    typeof attachment.compressed === "boolean"
  );
}

function isStoredTestCase(value: unknown): value is TestCase {
  if (!value || typeof value !== "object") {
    return false;
  }

  const testCase = value as Partial<TestCase>;

  return (
    typeof testCase.id === "string" &&
    (testCase.rowKey === undefined || typeof testCase.rowKey === "string") &&
    typeof testCase.project === "string" &&
    typeof testCase.module === "string" &&
    typeof testCase.tester === "string" &&
    typeof testCase.testerRemarks === "string" &&
    typeof testCase.devRemarks === "string" &&
    knownTestStatuses.includes(testCase.status as TestStatus) &&
    typeof testCase.lastRun === "string" &&
    typeof testCase.defects === "number" &&
    (testCase.attachment == null || isTestAttachment(testCase.attachment))
  );
}

function normalizeProjectModificationStatus(status: TestStatus): TestStatus {
  if (status === "Passed") {
    return "Complete";
  }

  if (status === "Failed" || status === "Error" || status === "Blocked") {
    return "In Progress";
  }

  if (status === "Not Started" || status === "To do") {
    return "To Do";
  }

  return status;
}

function normalizeImportedProjectModificationStatus(status: string): TestStatus {
  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === "complete" || normalizedStatus === "completed" || normalizedStatus === "passed") {
    return "Complete";
  }

  if (normalizedStatus === "in progress" || normalizedStatus === "failed" || normalizedStatus === "error" || normalizedStatus === "blocked") {
    return "In Progress";
  }

  if (normalizedStatus === "for review" || normalizedStatus === "review") {
    return "For Review";
  }

  return "To Do";
}

const initialProjectModificationRecords = testCases.map((testCase) => ({
  ...testCase,
  status: normalizeProjectModificationStatus(testCase.status)
}));

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentStatus(attachment: TestAttachment) {
  return attachment.compressed
    ? `Compressed ${formatBytes(attachment.originalSize)} to ${formatBytes(attachment.storedSize)}`
    : formatBytes(attachment.storedSize);
}

function isImageAttachment(attachment: TestAttachment) {
  return attachment.type.startsWith("image/") || attachment.dataUrl.startsWith("data:image/");
}

function getCompressedFileName(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;

  return `${baseName}.webp`;
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read attachment."));
    reader.readAsDataURL(blob);
  });
}

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxImageDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("Unable to compress attachment.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to compress attachment."));
        }
      },
      "image/webp",
      0.72
    );
  });
}

async function buildAttachment(file: File): Promise<TestAttachment> {
  const isImage = file.type.startsWith("image/");
  let storedBlob: Blob = file;
  let storedName = file.name;
  let compressed = false;

  if (isImage) {
    const compressedBlob = await compressImage(file);

    if (compressedBlob.size < file.size) {
      storedBlob = compressedBlob;
      storedName = getCompressedFileName(file.name);
      compressed = true;
    }
  } else if (file.size > maxPlainAttachmentBytes) {
    throw new Error(`Non-image attachments must be ${formatBytes(maxPlainAttachmentBytes)} or smaller.`);
  }

  if (storedBlob.size > maxStoredAttachmentBytes) {
    throw new Error(`Attachment is still too large after compression. Keep it under ${formatBytes(maxStoredAttachmentBytes)}.`);
  }

  return {
    name: storedName,
    type: storedBlob.type || file.type || "application/octet-stream",
    originalSize: file.size,
    storedSize: storedBlob.size,
    dataUrl: await readBlobAsDataUrl(storedBlob),
    compressed
  };
}

type FormattedTextField = "module" | "devRemarks";

function renderFormattedText(value: string) {
  return <FormattedText value={value} />;
}

function getTestCaseRecordKey(testCase: TestCase) {
  return testCase.rowKey ?? testCase.id;
}

function fitInlineRemarksInput(textArea: HTMLTextAreaElement) {
  textArea.style.height = "auto";
  textArea.style.height = `${Math.max(82, textArea.scrollHeight)}px`;
}

function shouldCollapseInlineRemarks(value: string) {
  return value.trim().length > 120 || value.split(/\r\n|\r|\n/).length > 3;
}

function getInlineRemarksRows(value: string, isExpanded: boolean) {
  if (!isExpanded && shouldCollapseInlineRemarks(value)) {
    return 3;
  }

  return Math.max(
    3,
    value.split(/\r\n|\r|\n/).reduce((rowCount, line) => rowCount + Math.max(1, Math.ceil(line.length / 44)), 0)
  );
}

export default function ProjectModificationPage() {
  const { records, setRecords, isReady: isStorageReady } = useSyncedRecords(
    testCaseStorageKey,
    initialProjectModificationRecords,
    isStoredTestCase
  );
  const { records: projectOptionRecords, isReady: areProjectsReady } = useSyncedRecords(
    projectStorageKey,
    projects,
    isProjectOptionRecord
  );
  const [formData, setFormData] = useState<TestCase>(emptyTestCase);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | "All">("All");
  const [statusFilter, setStatusFilter] = useState<TestStatus | "All">("All");
  const [currentTester, setCurrentTester] = useState("");
  const [message, setMessage] = useState("");
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<TestAttachment | null>(null);
  const [expandedDeveloperRemarks, setExpandedDeveloperRemarks] = useState<Set<string>>(() => new Set());
  const detailsFieldRef = useRef<HTMLTextAreaElement>(null);
  const devRemarksFieldRef = useRef<HTMLTextAreaElement>(null);
  const formPanelRef = useRef<HTMLElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const projectOptions = useMemo(() => {
    if (!areProjectsReady) {
      return [];
    }

    const projectNames = projectOptionRecords.map((project) => project.name.trim()).filter(Boolean);
    return Array.from(new Set(projectNames));
  }, [areProjectsReady, projectOptionRecords]);
  const activeProjectNames = useMemo(() => new Set(projectOptions), [projectOptions]);
  const activeRecords = useMemo(() => {
    if (!areProjectsReady) {
      return [];
    }

    return records.filter((testCase) => activeProjectNames.has(testCase.project));
  }, [activeProjectNames, areProjectsReady, records]);
  const displayedTestCaseId = editingId ? formData.id : generateTestCaseId(activeRecords, formData.project);

  function getFilteredProjectTestCase() {
    return {
      ...emptyTestCase,
      project: projectFilter === "All" ? "" : projectFilter,
      tester: currentTester
    };
  }

  useEffect(() => {
    const loggedInAccount = readCurrentUserProfile().fullName;

    setCurrentTester(loggedInAccount);
    setFormData((current) => (current.tester ? current : { ...current, tester: loggedInAccount }));
  }, []);

  useEffect(() => {
    if (!isFormVisible || !editingId) {
      return;
    }

    requestAnimationFrame(() => {
      formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [editingId, isFormVisible]);

  useEffect(() => {
    if (!areProjectsReady || !isStorageReady) {
      return;
    }

    const nextRecords = records.filter((testCase) => activeProjectNames.has(testCase.project));

    if (nextRecords.length !== records.length) {
      setRecords(nextRecords);
    }
  }, [activeProjectNames, areProjectsReady, isStorageReady, records, setRecords]);

  useEffect(() => {
    if (projectFilter !== "All" && !activeProjectNames.has(projectFilter)) {
      setProjectFilter("All");
    }
  }, [activeProjectNames, projectFilter]);

  const filteredTestCases = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const matchingRecords = activeRecords.filter((testCase) => {
      const matchesProject = projectFilter === "All" || testCase.project === projectFilter;
      const matchesStatus = statusFilter === "All" || testCase.status === statusFilter;
      const searchableValue = [
        testCase.id,
        testCase.project,
        testCase.module,
        testCase.tester,
        testCase.devRemarks,
        testCase.status,
        testCase.lastRun,
        testCase.attachment?.name ?? ""
      ]
        .join(" ")
        .toLowerCase();

      return matchesProject && matchesStatus && (!normalizedSearch || searchableValue.includes(normalizedSearch));
    });

    return sortRecordsById(matchingRecords);
  }, [activeRecords, projectFilter, searchTerm, statusFilter]);

  function updateField<Field extends keyof TestCase>(field: Field, value: TestCase[Field]) {
    setFormData((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  function persistRecordsImmediately(nextRecords: TestCase[]) {
    setRecords(nextRecords);
    return isStorageReady;
  }

  async function attachFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setMessage("Compressing attachment...");

    try {
      const attachment = await buildAttachment(file);
      setFormData((current) => ({ ...current, attachment }));

      if (editingId) {
        const nextRecords = records.map((testCase) =>
          getTestCaseRecordKey(testCase) === editingId ? { ...testCase, attachment } : testCase
        );
        const wasSaved = persistRecordsImmediately(nextRecords);
        setMessage(wasSaved ? `${attachment.name} attached and saved.` : "Attachment added, but browser storage is full.");
      } else {
        setMessage(`${attachment.name} attached. Save the record to keep this attachment after refresh.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to attach file.");
    }
  }

  function removeAttachment() {
    setFormData((current) => ({ ...current, attachment: null }));
    setPreviewAttachment(null);

    if (editingId) {
      const nextRecords = records.map((testCase) =>
        getTestCaseRecordKey(testCase) === editingId ? { ...testCase, attachment: null } : testCase
      );
      const wasSaved = persistRecordsImmediately(nextRecords);
      setMessage(wasSaved ? "Attachment removed and saved." : "Attachment removed, but browser storage is full.");
      return;
    }

    setMessage("Attachment removed.");
  }

  function openAttachment(attachment: TestAttachment) {
    if (isImageAttachment(attachment)) {
      setPreviewAttachment(attachment);
      return;
    }

    window.open(attachment.dataUrl, "_blank", "noopener,noreferrer");
  }

  function resetForm() {
    setFormData(getFilteredProjectTestCase());
    setEditingId(null);
    setMessage("");
  }

  function openNewTestCaseForm() {
    resetForm();
    setIsFormVisible(true);
  }

  function closeForm() {
    setFormData(emptyTestCase);
    setEditingId(null);
    setMessage("");
    setIsFormVisible(false);
  }

  function saveTestCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextTestCase: TestCase = {
      id: editingId ? formData.id : generateTestCaseId(activeRecords, formData.project.trim()),
      rowKey: formData.rowKey,
      project: formData.project.trim(),
      module: formData.module,
      tester: currentTester || formData.tester.trim(),
      testerRemarks: formData.testerRemarks,
      devRemarks: formData.devRemarks,
      status: formData.status,
      lastRun: formData.lastRun.trim(),
      attachment: formData.attachment ?? null,
      defects: formData.defects
    };

    if (
      !nextTestCase.project ||
      !nextTestCase.module.trim() ||
      !nextTestCase.tester
    ) {
      setMessage("Complete the project name, details, and tester before saving.");
      return;
    }

    if (!activeProjectNames.has(nextTestCase.project)) {
      setMessage("Select an active project from Project Maintenance before saving.");
      return;
    }

    if (editingId) {
      setRecords((current) =>
        current.map((testCase) => (getTestCaseRecordKey(testCase) === editingId ? nextTestCase : testCase))
      );
      setMessage(`${nextTestCase.id} updated.`);
    } else {
      setRecords((current) => sortRecordsById([...current, nextTestCase]));
      setMessage(`${nextTestCase.id} added.`);
    }

    setFormData(getFilteredProjectTestCase());
    setEditingId(null);
  }

  function editTestCase(testCase: TestCase) {
    setFormData(testCase);
    setEditingId(getTestCaseRecordKey(testCase));
    setIsFormVisible(true);
    setMessage("");
  }

  function updateDeveloperRemarks(testCaseKey: string, value: string) {
    setRecords((current) =>
      current.map((testCase) =>
        getTestCaseRecordKey(testCase) === testCaseKey ? { ...testCase, devRemarks: value } : testCase
      )
    );

    if (editingId === testCaseKey) {
      setFormData((current) => ({ ...current, devRemarks: value }));
    }
  }

  function toggleDeveloperRemarks(testCaseKey: string) {
    setExpandedDeveloperRemarks((current) => {
      const next = new Set(current);

      if (next.has(testCaseKey)) {
        next.delete(testCaseKey);
      } else {
        next.add(testCaseKey);
      }

      return next;
    });
  }

  function deleteTestCase(testCaseKey: string, testCaseId: string) {
    setRecords((current) => current.filter((testCase) => getTestCaseRecordKey(testCase) !== testCaseKey));

    if (editingId === testCaseKey) {
      setFormData(emptyTestCase);
      setEditingId(null);
      setMessage("");
    } else {
      setMessage(`${testCaseId} removed.`);
    }
  }

  function boldSelectedText(field: FormattedTextField, textArea: HTMLTextAreaElement | null) {
    if (!textArea) {
      return;
    }

    const currentValue = formData[field];
    const selectionStart = textArea.selectionStart;
    const selectionEnd = textArea.selectionEnd;
    const selectedText = currentValue.slice(selectionStart, selectionEnd);
    const replacementText = selectedText ? `**${selectedText}**` : "****";
    const nextValue = currentValue.slice(0, selectionStart) + replacementText + currentValue.slice(selectionEnd);

    updateField(field, nextValue);

    requestAnimationFrame(() => {
      const nextCursorPosition = selectedText ? selectionStart + replacementText.length : selectionStart + 2;
      textArea.focus();
      textArea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  }

  function exportTestCasesToExcel() {
    exportRowsToExcel({
      filename: "project-modification.xlsx",
      sheetName: "Project Modification",
      headers: ["Record ID", "Project Name", "Details", "Developer Remarks", "Status", "Date Modified", "Attachment"],
      rows: filteredTestCases.map((testCase) => [
        testCase.id,
        testCase.project,
        testCase.module,
        testCase.devRemarks,
        testCase.status,
        formatDateForDisplay(testCase.lastRun),
        testCase.attachment?.name ?? "No attachment"
      ])
    });
  }

  function openImportPicker() {
    importInputRef.current?.click();
  }

  function getDefaultImportSheetName(sheets: ExcelSheetOption[]) {
    return (
      sheets.find((sheet) => sheet.name.trim().toLowerCase() === "project modification")?.name ??
      sheets[0]?.name ??
      ""
    );
  }

  async function applyProjectModificationImport(file: File, selectedSheetName?: string) {
    if (!areProjectsReady || !isStorageReady) {
      setMessage("Wait for the tracker data to finish loading before importing.");
      return;
    }

    setMessage(selectedSheetName ? `Importing ${selectedSheetName}...` : "Importing Excel file...");

    try {
      const rows = await readRowsFromExcel(file, selectedSheetName);
      const { records: importedRecords, summary } = importTestCaseRows({
        activeProjectNames,
        currentTester,
        dateAliases: ["date modified", "modified date", "last run"],
        defaultStatus: "To Do",
        generateId: generateTestCaseId,
        idAliases: ["record id", "record", "id"],
        normalizeStatus: normalizeImportedProjectModificationStatus,
        records,
        requireTesterRemarks: false,
        rows
      });

      if (summary.added + summary.updated === 0) {
        setMessage("No rows imported. Check the required columns: Project Name and Details.");
        return;
      }

      setRecords(importedRecords);
      setPendingImport(null);
      setIsFormVisible(false);
      setEditingId(null);
      setMessage(`Imported ${summary.added} new and updated ${summary.updated}. Skipped ${summary.skipped}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import this Excel file.");
    }
  }

  async function importProjectModificationFromExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!areProjectsReady || !isStorageReady) {
      setMessage("Wait for the tracker data to finish loading before importing.");
      return;
    }

    setMessage("Reading Excel sheets...");

    try {
      const sheets = await readSheetNamesFromExcel(file);

      if (sheets.length > 1) {
        setPendingImport({
          file,
          selectedSheetName: getDefaultImportSheetName(sheets),
          sheets
        });
        setMessage("Choose the worksheet tab to import.");
        return;
      }

      await applyProjectModificationImport(file, sheets[0]?.name);
    } catch (error) {
      setPendingImport(null);
      setMessage(error instanceof Error ? error.message : "Unable to read this Excel file.");
    }
  }

  return (
    <AppShell>
      <section className="page-header">
        <div>
          <p className="eyebrow">Entity control</p>
          <h1>Project Modification</h1>
        </div>
        <button className="primary-action" type="button" onClick={openNewTestCaseForm}>
          <Plus size={17} />
          Add Record
        </button>
      </section>

      {isFormVisible ? (
        <section ref={formPanelRef} id="project-modification-form" className="panel maintenance-panel" aria-label="Project modification form">
          <div className="panel-heading">
            <h2>{editingId ? "Edit Record" : "Add Record"}</h2>
            <button className="ghost-action" type="button" onClick={closeForm} aria-label="Close project modification form">
              <X size={17} />
            </button>
          </div>
          <form className="maintenance-form test-case-form" onSubmit={saveTestCase}>
            <label>
              Record ID
              <input readOnly value={displayedTestCaseId} placeholder="Select project first" />
            </label>
            <label>
              Project Name
              <input
                list="project-options"
                value={formData.project}
                onChange={(event) => updateField("project", event.target.value)}
                placeholder="Project name"
              />
              <datalist id="project-options">
                {projectOptions.map((projectName) => (
                  <option key={projectName} value={projectName} />
                ))}
              </datalist>
            </label>
            <label className="formatted-field">
              Details
              <div className="field-toolbar">
                <button
                  className="format-action"
                  type="button"
                  onClick={() => boldSelectedText("module", detailsFieldRef.current)}
                  aria-label="Bold selected details text"
                  title="Bold"
                >
                  <Bold size={15} />
                </button>
              </div>
              <textarea
                ref={detailsFieldRef}
                value={formData.module}
                onChange={(event) => updateField("module", event.target.value)}
                placeholder="Record details"
                rows={3}
              />
            </label>
            <label>
              Tester
              <input
                value={currentTester || formData.tester}
                readOnly
                placeholder="Logged-in account"
              />
            </label>
            <label>
              Status
              <select
                value={formData.status}
                onChange={(event) => updateField("status", event.target.value as TestStatus)}
              >
                {testStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label-row">
                Date Modified <span className="optional-label">Optional</span>
              </span>
              <input
                type="date"
                value={isDateValue(formData.lastRun) ? formData.lastRun : ""}
                onChange={(event) => updateField("lastRun", event.target.value)}
              />
            </label>
            <label className="attachment-field">
              Attachment
              <div className="attachment-control">
                <input id="test-case-attachment" type="file" onChange={attachFile} />
                <span className="attachment-hint">Images are compressed before saving.</span>
              </div>
              {formData.attachment ? (
                <div className="attachment-chip">
                  <Paperclip size={15} />
                  <div>
                    <button className="attachment-name-button" type="button" onClick={() => openAttachment(formData.attachment!)}>
                      {formData.attachment.name}
                    </button>
                  </div>
                  <button
                    className="icon-action danger-action"
                    type="button"
                    onClick={removeAttachment}
                    aria-label="Remove attachment"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : null}
            </label>
            <label className="span-2 formatted-field">
              <span className="field-label-row">
                Developer Remarks <span className="optional-label">Optional</span>
              </span>
              <div className="field-toolbar">
                <button
                  className="format-action"
                  type="button"
                  onClick={() => boldSelectedText("devRemarks", devRemarksFieldRef.current)}
                  aria-label="Bold selected developer remarks text"
                  title="Bold"
                >
                  <Bold size={15} />
                </button>
              </div>
              <textarea
                ref={devRemarksFieldRef}
                value={formData.devRemarks}
                onChange={(event) => updateField("devRemarks", event.target.value)}
                placeholder="Developer remarks"
                rows={3}
              />
            </label>
            <div className="form-actions">
              <button className="primary-action" type="submit">
                <Save size={17} />
                {editingId ? "Save Changes" : "Save Record"}
              </button>
              <button className="secondary-action" type="button" onClick={resetForm}>
                Clear
              </button>
            </div>
            {message ? <p className="inline-message">{message}</p> : null}
          </form>
        </section>
      ) : null}

      <section className="toolbar toolbar-with-action test-case-toolbar" aria-label="Project modification filters">
        <input
          placeholder="Search record, project details, or remarks"
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
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as TestStatus | "All")}
        >
          <option>All</option>
          {testStatuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <button
          className="secondary-action"
          type="button"
          onClick={exportTestCasesToExcel}
          disabled={filteredTestCases.length === 0}
        >
          <FileSpreadsheet size={17} />
          Export Excel
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={openImportPicker}
          disabled={!areProjectsReady || !isStorageReady}
        >
          <Upload size={17} />
          Import Excel
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          hidden
          onChange={importProjectModificationFromExcel}
        />
      </section>
      {pendingImport ? (
        <section className="panel sheet-import-panel" aria-label="Choose worksheet to import">
          <label>
            Worksheet
            <select
              value={pendingImport.selectedSheetName}
              onChange={(event) =>
                setPendingImport((current) =>
                  current ? { ...current, selectedSheetName: event.target.value } : current
                )
              }
            >
              {pendingImport.sheets.map((sheet) => (
                <option key={sheet.name} value={sheet.name}>
                  {sheet.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-action"
            type="button"
            onClick={() => applyProjectModificationImport(pendingImport.file, pendingImport.selectedSheetName)}
          >
            <Upload size={17} />
            Import Sheet
          </button>
          <button className="secondary-action" type="button" onClick={() => setPendingImport(null)}>
            Cancel
          </button>
        </section>
      ) : null}
      {!isFormVisible && message ? <p className="inline-message toolbar-message">{message}</p> : null}

      {previewAttachment ? (
        <div className="attachment-preview-backdrop" role="presentation" onClick={() => setPreviewAttachment(null)}>
          <section
            className="attachment-preview"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${previewAttachment.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="attachment-preview-header">
              <div>
                <strong>{previewAttachment.name}</strong>
                <small>{getAttachmentStatus(previewAttachment)}</small>
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
            <div className="attachment-preview-body">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewAttachment.dataUrl} alt={previewAttachment.name} />
            </div>
          </section>
        </div>
      ) : null}

      <section className="panel test-case-panel">
        <div className="table-wrap">
          <table className="test-case-table project-modification-table">
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Project Name</th>
                <th>Details</th>
                <th>Developer Remarks</th>
                <th>Status</th>
                <th>Date Modified</th>
                <th>Attachment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTestCases.map((testCase) => {
                const testCaseKey = getTestCaseRecordKey(testCase);
                const isDeveloperRemarksExpanded = expandedDeveloperRemarks.has(testCaseKey);
                const hasCollapsibleDeveloperRemarks = shouldCollapseInlineRemarks(testCase.devRemarks);

                return (
                <tr key={testCaseKey}>
                  <td>
                    <strong>{testCase.id}</strong>
                  </td>
                  <td className="project-name-cell">
                    <strong>{testCase.project}</strong>
                  </td>
                  <td>
                    {renderFormattedText(testCase.module)}
                  </td>
                  <td className="inline-remarks-cell">
                    <textarea
                      className="inline-remarks-input"
                      key={`${testCaseKey}-${isDeveloperRemarksExpanded ? "expanded" : "collapsed"}`}
                      defaultValue={testCase.devRemarks}
                      onFocus={(event) => fitInlineRemarksInput(event.currentTarget)}
                      onInput={(event) => fitInlineRemarksInput(event.currentTarget)}
                      onBlur={(event) => updateDeveloperRemarks(testCaseKey, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      aria-label={`Developer remarks for ${testCase.id}`}
                      autoCapitalize="off"
                      autoCorrect="off"
                      placeholder="Developer can add remarks directly"
                      spellCheck={false}
                      rows={getInlineRemarksRows(testCase.devRemarks, isDeveloperRemarksExpanded)}
                    />
                    {hasCollapsibleDeveloperRemarks ? (
                      <button
                        className="formatted-text-toggle inline-remarks-toggle"
                        type="button"
                        onClick={() => toggleDeveloperRemarks(testCaseKey)}
                      >
                        {isDeveloperRemarksExpanded ? "See less" : "See more"}
                      </button>
                    ) : null}
                  </td>
                  <td>
                    <StatusPill value={testCase.status} />
                  </td>
                  <td className="date-cell">{formatDateForDisplay(testCase.lastRun)}</td>
                  <td>
                    {testCase.attachment ? (
                      <button className="attachment-link" type="button" onClick={() => openAttachment(testCase.attachment!)}>
                        <span>{testCase.attachment.name}</span>
                      </button>
                    ) : (
                      <span className="muted-label">No attachment</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-action"
                        type="button"
                        onClick={() => editTestCase(testCase)}
                        aria-label={`Edit ${testCase.id}`}
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        className="icon-action danger-action"
                        type="button"
                        onClick={() => deleteTestCase(getTestCaseRecordKey(testCase), testCase.id)}
                        aria-label={`Delete ${testCase.id}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {filteredTestCases.length === 0 ? (
                <tr>
                  <td className="empty-table-state" colSpan={8}>
                    No records match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
