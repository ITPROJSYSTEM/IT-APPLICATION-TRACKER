"use client";

import { supabase } from "@/lib/supabase";

const projectStorageKey = "it-application-tracker-projects";
const testCaseStorageKey = "it-application-tracker-test-cases";
const projectModificationStorageKey = "it-application-tracker-project-modification-records";
const taskActivityStorageKey = "it-application-tracker-task-calendar-activities";

type AnyRecord = Record<string, unknown>;
type DatabaseProjectRow = {
  id?: string;
  project_code?: string;
  name?: string;
};
type AttachmentMirrorRow = {
  owner_table: string;
  owner_key: string;
  file_name: string;
  file_type: string;
  original_size: number;
  stored_size: number;
  data_url: string;
  compressed: boolean;
  deleted_at: null;
};

const reportedRelationalErrors = new Set<string>();

function asObjectRecords(records: unknown[]) {
  return records.filter((record): record is AnyRecord => Boolean(record) && typeof record === "object");
}

function getString(record: AnyRecord, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function getNumber(record: AnyRecord, key: string, fallback = 0) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBoolean(record: AnyRecord, key: string) {
  return record[key] === true;
}

function getRecordKey(record: AnyRecord) {
  return getString(record, "rowKey") || getString(record, "id");
}

function getDateOrNull(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function warnRelationalError(operation: string, message: string) {
  const errorKey = `${operation}:${message}`;

  if (reportedRelationalErrors.has(errorKey)) {
    return;
  }

  reportedRelationalErrors.add(errorKey);
  console.warn(`${operation} failed. Run the relational Supabase migration if the tables are missing.`, message);
}

async function getProjectIdsByName(projectNames: string[]) {
  const uniqueNames = Array.from(new Set(projectNames.map((name) => name.trim()).filter(Boolean)));

  if (!supabase || uniqueNames.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id,name")
    .in("name", uniqueNames)
    .is("deleted_at", null);

  if (error) {
    warnRelationalError("Project lookup", error.message);
    return new Map<string, string>();
  }

  return new Map(
    ((data ?? []) as DatabaseProjectRow[])
      .filter((project) => project.id && project.name)
      .map((project) => [project.name as string, project.id as string])
  );
}

async function mirrorAttachments(ownerTable: string, records: AnyRecord[]) {
  if (!supabase) {
    return;
  }

  const attachmentRows = records
    .map((record) => {
      const attachment = record.attachment;

      if (!attachment || typeof attachment !== "object") {
        return null;
      }

      const attachmentRecord = attachment as AnyRecord;
      const ownerKey = getRecordKey(record);
      const fileName = getString(attachmentRecord, "name");

      if (!ownerKey || !fileName) {
        return null;
      }

      return {
        owner_table: ownerTable,
        owner_key: ownerKey,
        file_name: fileName,
        file_type: getString(attachmentRecord, "type"),
        original_size: getNumber(attachmentRecord, "originalSize"),
        stored_size: getNumber(attachmentRecord, "storedSize"),
        data_url: getString(attachmentRecord, "dataUrl"),
        compressed: getBoolean(attachmentRecord, "compressed"),
        deleted_at: null
      };
    })
    .filter((row): row is AttachmentMirrorRow => Boolean(row));

  if (attachmentRows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("attachments")
    .upsert(attachmentRows, { onConflict: "owner_table,owner_key,file_name" });

  if (error) {
    warnRelationalError("Attachment mirror", error.message);
  }
}

async function loadProjects() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("projects")
    .select("project_code,name,department,division,dev_assignee,owner,status,priority,start_date,due_date,progress,environment")
    .is("deleted_at", null)
    .order("project_code", { ascending: true });

  if (error) {
    warnRelationalError("Project load", error.message);
    return null;
  }

  return ((data ?? []) as AnyRecord[]).map((project) => ({
    id: getString(project, "project_code"),
    name: getString(project, "name"),
    department: getString(project, "department"),
    division: getString(project, "division"),
    devAssignee: getString(project, "dev_assignee"),
    owner: getString(project, "owner"),
    status: getString(project, "status"),
    priority: getString(project, "priority"),
    startDate: getString(project, "start_date"),
    dueDate: getString(project, "due_date"),
    progress: getNumber(project, "progress"),
    environment: getString(project, "environment")
  }));
}

async function mirrorProjects(records: AnyRecord[]) {
  if (!supabase || records.length === 0) {
    return;
  }

  const rows = records.map((project) => ({
    project_code: getString(project, "id"),
    name: getString(project, "name"),
    department: getString(project, "department"),
    division: getString(project, "division"),
    dev_assignee: getString(project, "devAssignee"),
    owner: getString(project, "owner"),
    status: getString(project, "status"),
    priority: getString(project, "priority") || "Medium",
    start_date: getDateOrNull(getString(project, "startDate")),
    due_date: getDateOrNull(getString(project, "dueDate")),
    progress: getNumber(project, "progress"),
    environment: getString(project, "environment") || "Development",
    deleted_at: null
  }));

  const { error } = await supabase.from("projects").upsert(rows, { onConflict: "project_code" });

  if (error) {
    warnRelationalError("Project mirror", error.message);
  }
}

async function loadTestCaseLikeRows(tableName: "test_cases" | "project_modifications") {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    warnRelationalError(`${tableName} load`, error.message);
    return null;
  }

  const rows = (data ?? []) as AnyRecord[];

  if (tableName === "test_cases") {
    return rows.map((record) => {
      const recordKey = getString(record, "record_key");
      const testCaseCode = getString(record, "test_case_code");

      return {
        id: testCaseCode,
        rowKey: recordKey === testCaseCode ? undefined : recordKey,
        project: getString(record, "project_name"),
        module: getString(record, "test_details"),
        tester: getString(record, "tester"),
        testerRemarks: getString(record, "qa_remarks"),
        devRemarks: getString(record, "developer_remarks"),
        status: getString(record, "status"),
        lastRun: getString(record, "date_tested"),
        attachment: record.attachment ?? null,
        defects: getNumber(record, "defects")
      };
    });
  }

  return rows.map((record) => {
    const recordKey = getString(record, "record_key");
    const recordCode = getString(record, "record_code");

    return {
      id: recordCode,
      rowKey: recordKey === recordCode ? undefined : recordKey,
      project: getString(record, "project_name"),
      module: getString(record, "details"),
      tester: getString(record, "created_by"),
      testerRemarks: "",
      devRemarks: getString(record, "developer_remarks"),
      status: getString(record, "status"),
      lastRun: getString(record, "date_modified"),
      attachment: record.attachment ?? null,
      defects: 0
    };
  });
}

async function mirrorTestCases(records: AnyRecord[]) {
  if (!supabase || records.length === 0) {
    return;
  }

  const projectIds = await getProjectIdsByName(records.map((record) => getString(record, "project")));
  const rows = records.map((record) => {
    const projectName = getString(record, "project");
    const recordKey = getRecordKey(record);

    return {
      record_key: recordKey,
      test_case_code: getString(record, "id"),
      project_id: projectIds.get(projectName) ?? null,
      project_name: projectName,
      test_details: getString(record, "module"),
      tester: getString(record, "tester"),
      qa_remarks: getString(record, "testerRemarks"),
      developer_remarks: getString(record, "devRemarks"),
      status: getString(record, "status"),
      date_tested: getDateOrNull(getString(record, "lastRun")),
      defects: getNumber(record, "defects"),
      attachment: record.attachment ?? null,
      deleted_at: null
    };
  });

  const { error } = await supabase.from("test_cases").upsert(rows, { onConflict: "record_key" });

  if (error) {
    warnRelationalError("Test case mirror", error.message);
    return;
  }

  await mirrorAttachments("test_cases", records);
}

async function mirrorProjectModifications(records: AnyRecord[]) {
  if (!supabase || records.length === 0) {
    return;
  }

  const projectIds = await getProjectIdsByName(records.map((record) => getString(record, "project")));
  const rows = records.map((record) => {
    const projectName = getString(record, "project");
    const recordKey = getRecordKey(record);

    return {
      record_key: recordKey,
      record_code: getString(record, "id"),
      project_id: projectIds.get(projectName) ?? null,
      project_name: projectName,
      details: getString(record, "module"),
      developer_remarks: getString(record, "devRemarks"),
      status: getString(record, "status"),
      date_modified: getDateOrNull(getString(record, "lastRun")),
      created_by: getString(record, "tester"),
      attachment: record.attachment ?? null,
      deleted_at: null
    };
  });

  const { error } = await supabase.from("project_modifications").upsert(rows, { onConflict: "record_key" });

  if (error) {
    warnRelationalError("Project modification mirror", error.message);
    return;
  }

  await mirrorAttachments("project_modifications", records);
}

async function loadTaskActivities() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("task_calendar_activities")
    .select("activity_code,activity_date,details")
    .is("deleted_at", null)
    .order("activity_date", { ascending: true });

  if (error) {
    warnRelationalError("Task activity load", error.message);
    return null;
  }

  return ((data ?? []) as AnyRecord[]).map((activity) => ({
    id: getString(activity, "activity_code"),
    date: getString(activity, "activity_date"),
    details: getString(activity, "details")
  }));
}

async function mirrorTaskActivities(records: AnyRecord[]) {
  if (!supabase || records.length === 0) {
    return;
  }

  const rows = records.map((activity) => ({
    activity_code: getString(activity, "id"),
    activity_date: getDateOrNull(getString(activity, "date")),
    details: getString(activity, "details"),
    deleted_at: null
  }));

  const { error } = await supabase
    .from("task_calendar_activities")
    .upsert(rows, { onConflict: "activity_code" });

  if (error) {
    warnRelationalError("Task activity mirror", error.message);
  }
}

export async function loadRelationalRecords(storageKey: string) {
  if (!supabase) {
    return null;
  }

  if (storageKey === projectStorageKey) {
    return loadProjects();
  }

  if (storageKey === testCaseStorageKey) {
    return loadTestCaseLikeRows("test_cases");
  }

  if (storageKey === projectModificationStorageKey) {
    return loadTestCaseLikeRows("project_modifications");
  }

  if (storageKey === taskActivityStorageKey) {
    return loadTaskActivities();
  }

  return null;
}

export async function mirrorRelationalRecords(storageKey: string, records: unknown[]) {
  if (!supabase || records.length === 0) {
    return;
  }

  const objectRecords = asObjectRecords(records);

  if (objectRecords.length === 0) {
    return;
  }

  if (storageKey === projectStorageKey) {
    await mirrorProjects(objectRecords);
  } else if (storageKey === testCaseStorageKey) {
    await mirrorTestCases(objectRecords);
  } else if (storageKey === projectModificationStorageKey) {
    await mirrorProjectModifications(objectRecords);
  } else if (storageKey === taskActivityStorageKey) {
    await mirrorTaskActivities(objectRecords);
  }
}
