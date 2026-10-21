export interface CsvColumn<T> {
  key: string;
  label: string;
  value?: (row: T) => string | number | null | undefined;
}

// A text cell starting with one of these is run as a formula by Excel /
// Sheets / LibreOffice ("=HYPERLINK(…)" in a patient name or complaint) —
// CSV injection. Tab and CR are on OWASP's list too.
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  // Real numbers (−250 refunds etc.) can't carry a formula and must stay numbers.
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = String(value);
  // A leading ' makes the spreadsheet show the cell as plain text.
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV<T extends Record<string, unknown>>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => escapeCsvCell(c.value ? c.value(row) : (row[c.key] as string | number | null | undefined)))
      .join(",")
  );
  return [header, ...lines].join("\n");
}

// The BOM tells Excel the file is UTF-8 — without it "₹" and Devanagari
// names come out garbled.
const BOM = "\uFEFF";

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv.startsWith(BOM) ? csv : BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
