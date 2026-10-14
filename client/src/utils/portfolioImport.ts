export interface ImportRow {
  line: number;
  name: string;
  address: string;
  city: string;
  type: string;
  errors: string[];
}

export interface ImportPreview {
  headers: string[];
  rows: ImportRow[];
  validCount: number;
  invalidCount: number;
}

const REQUIRED = ['name'];
const OPTIONAL = ['address', 'city', 'type'];

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

export function parsePortfolioCsv(text: string): ImportPreview {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], validCount: 0, invalidCount: 0 };
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const nameIdx = headers.findIndex((h) => h === 'name' || h === 'property' || h === 'property name');
  const addressIdx = headers.findIndex((h) => h === 'address');
  const cityIdx = headers.findIndex((h) => h === 'city' || h === 'suburb');
  const typeIdx = headers.findIndex((h) => h === 'type' || h === 'property type');

  const rows: ImportRow[] = lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const name = nameIdx >= 0 ? cells[nameIdx] || '' : cells[0] || '';
    const address = addressIdx >= 0 ? cells[addressIdx] || '' : '';
    const city = cityIdx >= 0 ? cells[cityIdx] || '' : '';
    const type = typeIdx >= 0 ? cells[typeIdx] || '' : '';
    const errors: string[] = [];
    if (!name) errors.push('Property name is required');
    if (name.length > 120) errors.push('Property name is too long');
    return { line: index + 2, name, address, city, type, errors };
  });

  return {
    headers,
    rows,
    validCount: rows.filter((row) => row.errors.length === 0).length,
    invalidCount: rows.filter((row) => row.errors.length > 0).length
  };
}

export function expectedImportColumns() {
  return { required: REQUIRED, optional: OPTIONAL };
}
