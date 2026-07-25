import { sortRecordsById } from "@/lib/record-sort";
import type { TestCase, TestStatus } from "@/lib/types";

type ImportTestCaseRowsOptions = {
  activeProjectNames: Set<string>;
  currentTester: string;
  dateAliases: string[];
  defaultStatus: TestStatus;
  generateId: (records: TestCase[], projectName: string) => string;
  idAliases: string[];
  normalizeStatus: (status: string) => TestStatus;
  records: TestCase[];
  requireTesterRemarks: boolean;
  rows: string[][];
};

type ImportSummary = {
  added: number;
  skipped: number;
  updated: number;
};

const projectAliases = ["project name", "project"];
const detailAliases = ["details", "detail", "module", "record details", "test details", "scenario"];
const testerAliases = ["tester", "qa tester", "tested by"];
const testerRemarksAliases = ["qa remarks", "tester remarks", "test remarks", "remarks"];
const developerRemarksAliases = ["developer remarks", "dev remarks", "development remarks"];
const statusAliases = ["status", "state"];
const defectAliases = ["defects", "defect count", "bugs"];

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildHeaderIndex(headers: string[]) {
  return headers.reduce<Map<string, number>>((index, header, columnIndex) => {
    const normalizedHeader = normalizeHeader(header);

    if (normalizedHeader && !index.has(normalizedHeader)) {
      index.set(normalizedHeader, columnIndex);
    }

    return index;
  }, new Map());
}

function getRowValue(row: string[], headerIndex: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const columnIndex = headerIndex.get(normalizeHeader(alias));

    if (columnIndex !== undefined) {
      return row[columnIndex]?.trim() ?? "";
    }
  }

  return "";
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

function normalizeDateForStorage(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue || /^pending$/i.test(trimmedValue) || /^no date$/i.test(trimmedValue)) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  const serialDate = Number(trimmedValue);

  if (Number.isFinite(serialDate) && serialDate >= 1) {
    const utcMilliseconds = Math.round((serialDate - 25569) * 86400 * 1000);
    const date = new Date(utcMilliseconds);

    if (!Number.isNaN(date.getTime())) {
      return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
  }

  const slashDateMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmedValue);

  if (slashDateMatch) {
    const firstPart = Number(slashDateMatch[1]);
    const secondPart = Number(slashDateMatch[2]);
    const yearPart = slashDateMatch[3].length === 2 ? Number(`20${slashDateMatch[3]}`) : Number(slashDateMatch[3]);
    const month = firstPart > 12 ? secondPart : firstPart;
    const day = firstPart > 12 ? firstPart : secondPart;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return formatDateParts(yearPart, month, day);
    }
  }

  const parsedDate = new Date(trimmedValue);

  if (!Number.isNaN(parsedDate.getTime())) {
    return formatDateParts(parsedDate.getFullYear(), parsedDate.getMonth() + 1, parsedDate.getDate());
  }

  return trimmedValue;
}

function parseDefectCount(value: string, fallback: number) {
  const defectCount = Number(value);

  return Number.isFinite(defectCount) && defectCount >= 0 ? defectCount : fallback;
}

function buildImportedRowKey(project: string, id: string, rowNumber: number) {
  const projectKey = normalizeHeader(project) || "project";
  const idKey = normalizeHeader(id) || "row";

  return `import-${projectKey}-${rowNumber}-${idKey}`;
}

export function importTestCaseRows({
  activeProjectNames,
  currentTester,
  dateAliases,
  defaultStatus,
  generateId,
  idAliases,
  normalizeStatus,
  records,
  requireTesterRemarks,
  rows
}: ImportTestCaseRowsOptions) {
  const summary: ImportSummary = {
    added: 0,
    skipped: 0,
    updated: 0
  };

  if (rows.length < 2) {
    return {
      records,
      summary
    };
  }

  const headerIndex = buildHeaderIndex(rows[0]);
  const importedRecords: TestCase[] = [];
  const importedProjectNames = new Set<string>();

  for (const [rowIndex, row] of rows.slice(1).entries()) {
    const project = getRowValue(row, headerIndex, projectAliases);
    const details = getRowValue(row, headerIndex, detailAliases);
    const testerRemarks = getRowValue(row, headerIndex, testerRemarksAliases);

    if (!project || !details || (requireTesterRemarks && !testerRemarks) || !activeProjectNames.has(project)) {
      summary.skipped += 1;
      continue;
    }

    const importedId = getRowValue(row, headerIndex, idAliases);
    const id = importedId || generateId([...records, ...importedRecords], project);

    if (!id) {
      summary.skipped += 1;
      continue;
    }

    const importedStatus = getRowValue(row, headerIndex, statusAliases);
    const dateValue = getRowValue(row, headerIndex, dateAliases);
    const defectValue = getRowValue(row, headerIndex, defectAliases);
    const nextRecord: TestCase = {
      id,
      rowKey: buildImportedRowKey(project, id, rowIndex + 2),
      project,
      module: details,
      tester: currentTester || getRowValue(row, headerIndex, testerAliases) || "",
      testerRemarks,
      devRemarks: getRowValue(row, headerIndex, developerRemarksAliases),
      status: importedStatus ? normalizeStatus(importedStatus) : defaultStatus,
      lastRun: normalizeDateForStorage(dateValue),
      attachment: null,
      defects: parseDefectCount(defectValue, 0)
    };

    importedRecords.push(nextRecord);
    importedProjectNames.add(project);
    summary.added += 1;
  }

  const retainedRecords = records.filter((record) => !importedProjectNames.has(record.project));

  return {
    records: sortRecordsById([...retainedRecords, ...importedRecords]),
    summary
  };
}
