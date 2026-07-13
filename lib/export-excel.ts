type ExcelCell = string | number | null | undefined;

type ExportRowsToExcelOptions = {
  filename: string;
  sheetName: string;
  headers: string[];
  rows: ExcelCell[][];
};

type ZipEntry = {
  path: string;
  data: Uint8Array;
};

const textEncoder = new TextEncoder();
const crcTable = buildCrcTable();

function buildCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    return value >>> 0;
  });
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function encodeText(value: string) {
  return textEncoder.encode(value);
}

function createRecord(byteLength: number, values: Array<[number, number, 2 | 4]>) {
  const record = new Uint8Array(byteLength);
  const view = new DataView(record.buffer);

  for (const [offset, value, size] of values) {
    if (size === 2) {
      view.setUint16(offset, value, true);
    } else {
      view.setUint32(offset, value, true);
    }
  }

  return record;
}

function concatArrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }

  return merged;
}

function createZip(entries: ZipEntry[]) {
  const fileParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encodeText(entry.path);
    const checksum = crc32(entry.data);
    const localHeader = createRecord(30, [
      [0, 0x04034b50, 4],
      [4, 20, 2],
      [6, 0, 2],
      [8, 0, 2],
      [10, 0, 2],
      [12, 0, 2],
      [14, checksum, 4],
      [18, entry.data.length, 4],
      [22, entry.data.length, 4],
      [26, name.length, 2],
      [28, 0, 2]
    ]);
    const centralHeader = createRecord(46, [
      [0, 0x02014b50, 4],
      [4, 20, 2],
      [6, 20, 2],
      [8, 0, 2],
      [10, 0, 2],
      [12, 0, 2],
      [14, 0, 2],
      [16, checksum, 4],
      [20, entry.data.length, 4],
      [24, entry.data.length, 4],
      [28, name.length, 2],
      [30, 0, 2],
      [32, 0, 2],
      [34, 0, 2],
      [36, 0, 2],
      [38, 0, 4],
      [42, offset, 4]
    ]);

    fileParts.push(localHeader, name, entry.data);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + entry.data.length;
  }

  const centralDirectory = concatArrays(centralParts);
  const endRecord = createRecord(22, [
    [0, 0x06054b50, 4],
    [4, 0, 2],
    [6, 0, 2],
    [8, entries.length, 2],
    [10, entries.length, 2],
    [12, centralDirectory.length, 4],
    [16, offset, 4],
    [20, 0, 2]
  ]);

  return concatArrays([...fileParts, centralDirectory, endRecord]);
}

function escapeXml(value: ExcelCell) {
  return String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getColumnName(index: number) {
  let dividend = index + 1;
  let columnName = "";

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return columnName;
}

function sanitizeSheetName(sheetName: string) {
  const cleanedName = sheetName.replace(/[\][:*?/\\]/g, " ").trim();

  return (cleanedName || "Sheet1").slice(0, 31);
}

function buildColumnWidths(headers: string[], rows: ExcelCell[][]) {
  return headers.map((header, columnIndex) => {
    const maxLength = [header, ...rows.map((row) => row[columnIndex])]
      .map((cell) => String(cell ?? "").split(/\r?\n/).reduce((longest, line) => Math.max(longest, line.length), 0))
      .reduce((longest, length) => Math.max(longest, length), 0);

    return Math.min(46, Math.max(12, maxLength + 2));
  });
}

function buildCell(cell: ExcelCell, rowIndex: number, columnIndex: number, isHeader: boolean) {
  const ref = `${getColumnName(columnIndex)}${rowIndex}`;
  const style = isHeader ? ' s="1"' : "";

  if (typeof cell === "number" && Number.isFinite(cell)) {
    return `<c r="${ref}"${style}><v>${cell}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
}

function buildWorksheet(sheetName: string, headers: string[], rows: ExcelCell[][]) {
  const allRows = [headers, ...rows];
  const columnWidths = buildColumnWidths(headers, rows)
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const sheetRows = allRows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = headers.map((_, columnIndex) => buildCell(row[columnIndex], rowNumber, columnIndex, rowIndex === 0)).join("");

      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");
  const lastCell = `${getColumnName(Math.max(headers.length - 1, 0))}${Math.max(allRows.length, 1)}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCell}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <cols>${columnWidths}</cols>
  <sheetData>${sheetRows}</sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function buildWorkbook(sheetName: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function buildStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF172033"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEEF4F9"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD9E0EA"/></left>
      <right style="thin"><color rgb="FFD9E0EA"/></right>
      <top style="thin"><color rgb="FFD9E0EA"/></top>
      <bottom style="thin"><color rgb="FFD9E0EA"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;
}

function buildXlsxFile(sheetName: string, headers: string[], rows: ExcelCell[][]) {
  const safeSheetName = sanitizeSheetName(sheetName);
  const entries: ZipEntry[] = [
    {
      path: "[Content_Types].xml",
      data: encodeText(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`)
    },
    {
      path: "_rels/.rels",
      data: encodeText(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
    },
    {
      path: "xl/workbook.xml",
      data: encodeText(buildWorkbook(safeSheetName))
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      data: encodeText(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)
    },
    {
      path: "xl/worksheets/sheet1.xml",
      data: encodeText(buildWorksheet(safeSheetName, headers, rows))
    },
    {
      path: "xl/styles.xml",
      data: encodeText(buildStyles())
    }
  ];

  return createZip(entries);
}

function getXlsxFilename(filename: string) {
  return filename.replace(/\.(xls|xlsx)$/i, "") + ".xlsx";
}

export function exportRowsToExcel({ filename, sheetName, headers, rows }: ExportRowsToExcelOptions) {
  const workbook = buildXlsxFile(sheetName, headers, rows);
  const blob = new Blob([workbook], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = getXlsxFilename(filename);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
