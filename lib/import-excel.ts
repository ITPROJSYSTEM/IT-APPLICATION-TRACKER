type ZipEntry = {
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
  path: string;
};

type CellValue = string | number;

export type ExcelSheetOption = {
  name: string;
};

type WorksheetEntry = ExcelSheetOption & {
  path: string;
};

const textDecoder = new TextDecoder();
const eocdSignature = 0x06054b50;
const centralDirectorySignature = 0x02014b50;
const localFileHeaderSignature = 0x04034b50;

function findEndOfCentralDirectory(view: DataView) {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === eocdSignature) {
      return offset;
    }
  }

  throw new Error("This does not look like a valid Excel workbook.");
}

function readText(bytes: Uint8Array) {
  return textDecoder.decode(bytes);
}

function parseZipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map<string, ZipEntry>();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== centralDirectorySignature) {
      throw new Error("The Excel workbook directory is damaged.");
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const path = readText(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    entries.set(path, {
      compressionMethod,
      compressedSize,
      localHeaderOffset,
      path
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateRaw(data: Uint8Array) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot read compressed Excel workbooks.");
  }

  const inputBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(inputBuffer).set(data);

  const stream = new Blob([inputBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();

  return new Uint8Array(buffer);
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(entry.localHeaderOffset, true) !== localFileHeaderSignature) {
    throw new Error(`The Excel workbook entry ${entry.path} is damaged.`);
  }

  const fileNameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataOffset = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedData = bytes.slice(dataOffset, dataOffset + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressedData;
  }

  if (entry.compressionMethod === 8) {
    return inflateRaw(compressedData);
  }

  throw new Error("This Excel workbook uses an unsupported compression format.");
}

async function readZipText(bytes: Uint8Array, entries: Map<string, ZipEntry>, path: string) {
  const entry = entries.get(path);

  if (!entry) {
    return "";
  }

  return readText(await readZipEntry(bytes, entry));
}

function getTextContent(element: Element) {
  return Array.from(element.getElementsByTagName("t"))
    .map((textElement) => textElement.textContent ?? "")
    .join("");
}

function parseSharedStrings(sharedStringsXml: string) {
  if (!sharedStringsXml.trim()) {
    return [];
  }

  const document = new DOMParser().parseFromString(sharedStringsXml, "application/xml");

  return Array.from(document.getElementsByTagName("si")).map(getTextContent);
}

function isCsvFile(file: File) {
  return /\.csv$/i.test(file.name) || file.type === "text/csv";
}

function normalizeZipPath(basePath: string, targetPath: string) {
  const rawSegments = targetPath.startsWith("/")
    ? targetPath.slice(1).split("/")
    : [...basePath.split("/").slice(0, -1), ...targetPath.split("/")];
  const segments: string[] = [];

  for (const segment of rawSegments) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  return segments.join("/");
}

function parseWorkbookRelationships(workbookRelationshipsXml: string) {
  const relationships = new Map<string, string>();

  if (!workbookRelationshipsXml.trim()) {
    return relationships;
  }

  const document = new DOMParser().parseFromString(workbookRelationshipsXml, "application/xml");

  for (const relationship of Array.from(document.getElementsByTagName("Relationship"))) {
    const id = relationship.getAttribute("Id") ?? "";
    const target = relationship.getAttribute("Target") ?? "";

    if (id && target) {
      relationships.set(id, normalizeZipPath("xl/workbook.xml", target));
    }
  }

  return relationships;
}

function getRelationshipId(sheet: Element) {
  return (
    sheet.getAttribute("r:id") ??
    sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ??
    ""
  );
}

function parseWorkbookSheets(
  workbookXml: string,
  workbookRelationshipsXml: string,
  entries: Map<string, ZipEntry>
): WorksheetEntry[] {
  if (!workbookXml.trim()) {
    return [];
  }

  const document = new DOMParser().parseFromString(workbookXml, "application/xml");
  const relationships = parseWorkbookRelationships(workbookRelationshipsXml);
  const sheets = Array.from(document.getElementsByTagName("sheet"))
    .map((sheet, index) => {
      const relationshipId = getRelationshipId(sheet);
      const path = relationships.get(relationshipId) ?? `xl/worksheets/sheet${index + 1}.xml`;

      return {
        name: sheet.getAttribute("name") ?? `Sheet${index + 1}`,
        path
      };
    })
    .filter((sheet) => entries.has(sheet.path));

  if (sheets.length > 0) {
    return sheets;
  }

  return Array.from(entries.keys())
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
    .map((path, index) => ({
      name: `Sheet${index + 1}`,
      path
    }));
}

function getColumnIndex(cellReference: string) {
  const letters = cellReference.replace(/\d/g, "").toUpperCase();

  return letters.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function getCellValue(cell: Element, sharedStrings: string[]): CellValue {
  const type = cell.getAttribute("t");

  if (type === "inlineStr") {
    return getTextContent(cell);
  }

  const value = cell.getElementsByTagName("v")[0]?.textContent ?? "";

  if (type === "s") {
    return sharedStrings[Number(value)] ?? "";
  }

  if (type === "b") {
    return value === "1" ? "TRUE" : "FALSE";
  }

  const numericValue = Number(value);

  return value.trim() && Number.isFinite(numericValue) ? numericValue : value;
}

function parseWorksheetRows(worksheetXml: string, sharedStrings: string[]) {
  const document = new DOMParser().parseFromString(worksheetXml, "application/xml");

  return Array.from(document.getElementsByTagName("row")).map((row) => {
    const values: CellValue[] = [];

    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const reference = cell.getAttribute("r") ?? "";
      const columnIndex = reference ? getColumnIndex(reference) : values.length;
      values[columnIndex] = getCellValue(cell, sharedStrings);
    }

    return values.map((value) => String(value ?? "").trim());
  });
}

async function readWorkbookSheets(bytes: Uint8Array, entries: Map<string, ZipEntry>) {
  const [workbookXml, workbookRelationshipsXml] = await Promise.all([
    readZipText(bytes, entries, "xl/workbook.xml"),
    readZipText(bytes, entries, "xl/_rels/workbook.xml.rels")
  ]);

  return parseWorkbookSheets(workbookXml, workbookRelationshipsXml, entries);
}

function findWorksheetPath(sheets: WorksheetEntry[], selectedSheetName?: string) {
  const worksheet = selectedSheetName
    ? sheets.find((sheet) => sheet.name.trim().toLowerCase() === selectedSheetName.trim().toLowerCase())
    : sheets[0];

  if (!worksheet) {
    throw new Error("No worksheet was found in this Excel workbook.");
  }

  return worksheet.path;
}

function parseCsvRows(csvText: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let isQuoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"' && isQuoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      isQuoted = !isQuoted;
    } else if (character === "," && !isQuoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !isQuoted) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  rows.push(row);

  return rows.filter((currentRow) => currentRow.some((value) => value.trim()));
}

export async function readSheetNamesFromExcel(file: File): Promise<ExcelSheetOption[]> {
  if (isCsvFile(file)) {
    return [{ name: file.name.replace(/\.csv$/i, "") || "CSV" }];
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = parseZipEntries(bytes);
  const sheets = await readWorkbookSheets(bytes, entries);

  if (sheets.length === 0) {
    throw new Error("No worksheet was found in this Excel workbook.");
  }

  return sheets.map(({ name }) => ({ name }));
}

export async function readRowsFromExcel(file: File, selectedSheetName?: string) {
  if (isCsvFile(file)) {
    return parseCsvRows(await file.text());
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = parseZipEntries(bytes);
  const sheets = await readWorkbookSheets(bytes, entries);
  const worksheetPath = findWorksheetPath(sheets, selectedSheetName);
  const [worksheetXml, sharedStringsXml] = await Promise.all([
    readZipText(bytes, entries, worksheetPath),
    readZipText(bytes, entries, "xl/sharedStrings.xml")
  ]);

  return parseWorksheetRows(worksheetXml, parseSharedStrings(sharedStringsXml)).filter((row) =>
    row.some((value) => value.trim())
  );
}
