"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildXlsxWorkbookSheets = buildXlsxWorkbookSheets;
exports.buildXlsxWorkbook = buildXlsxWorkbook;
function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
        crc ^= buf[i];
        for (let bit = 0; bit < 8; bit += 1) {
            const lowest = crc & 1;
            crc >>>= 1;
            if (lowest)
                crc ^= 0xedb88320;
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function xmlEscape(value) {
    return String(value !== null && value !== void 0 ? value : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function localFile(name, data) {
    return { name, data, crc: crc32(data) };
}
function u16(value) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(value);
    return buf;
}
function u32(value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value);
    return buf;
}
function sheetXml(rows) {
    const headers = Array.from(rows.reduce((set, row) => {
        Object.keys(row || {}).forEach((key) => set.add(key));
        return set;
    }, new Set(['line'])));
    const sheetRows = [
        `<row r="1">${headers.map((header, i) => `<c t="inlineStr" r="${col(i)}1"><is><t>${xmlEscape(header)}</t></is></c>`).join('')}</row>`,
        ...rows.map((row, rowIndex) => {
            const r = rowIndex + 2;
            return `<row r="${r}">${headers
                .map((header, i) => `<c t="inlineStr" r="${col(i)}${r}"><is><t>${xmlEscape(row === null || row === void 0 ? void 0 : row[header])}</t></is></c>`)
                .join('')}</row>`;
        })
    ];
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows.join('')}</sheetData>
</worksheet>`;
}
function packZip(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
        const name = Buffer.from(file.name);
        const local = Buffer.concat([
            Buffer.from('PK\u0003\u0004'),
            u16(20),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(file.crc),
            u32(file.data.length),
            u32(file.data.length),
            u16(name.length),
            u16(0),
            name,
            file.data
        ]);
        const central = Buffer.concat([
            Buffer.from('PK\u0001\u0002'),
            u16(20),
            u16(20),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(file.crc),
            u32(file.data.length),
            u32(file.data.length),
            u16(name.length),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(0),
            u32(offset),
            name
        ]);
        locals.push(local);
        centrals.push(central);
        offset += local.length;
    }
    const centralDir = Buffer.concat(centrals);
    const end = Buffer.concat([
        Buffer.from('PK\u0005\u0006'),
        u16(0),
        u16(0),
        u16(files.length),
        u16(files.length),
        u32(centralDir.length),
        u32(offset),
        u16(0)
    ]);
    return Buffer.concat([...locals, centralDir, end]);
}
/**
 * Genuine Office Open XML workbook with one or more worksheets.
 */
function buildXlsxWorkbookSheets(sheets) {
    const list = (sheets.length ? sheets : [{ name: 'Sheet1', rows: [{ line: '' }] }]).map((sheet, index) => ({
        name: String(sheet.name || `Sheet${index + 1}`).slice(0, 31) || `Sheet${index + 1}`,
        rows: Array.isArray(sheet.rows) && sheet.rows.length ? sheet.rows : [{ line: '' }]
    }));
    const overrides = list
        .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('');
    const workbookSheets = list
        .map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
        .join('');
    const rels = list
        .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
        .join('');
    const files = [
        localFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${overrides}
</Types>`)),
        localFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)),
        localFile('xl/workbook.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
</workbook>`)),
        localFile('xl/_rels/workbook.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels}
</Relationships>`)),
        ...list.map((sheet, index) => localFile(`xl/worksheets/sheet${index + 1}.xml`, Buffer.from(sheetXml(sheet.rows))))
    ];
    return packZip(files);
}
/**
 * Build a genuine Office Open XML (.xlsx) workbook. Uncompressed ZIP; Excel opens it as xlsx.
 */
function buildXlsxWorkbook(sheetName, rows) {
    return buildXlsxWorkbookSheets([{ name: sheetName, rows }]);
}
function col(index) {
    let n = index + 1;
    let label = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        label = String.fromCharCode(65 + rem) + label;
        n = Math.floor((n - 1) / 26);
    }
    return label;
}
