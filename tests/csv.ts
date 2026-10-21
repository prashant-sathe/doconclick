// CSV export (BUG-TRACKER): text cells that a spreadsheet would run as a
// formula (= + - @, tab, CR) get a leading ', real numbers stay numbers, and
// the download starts with a UTF-8 BOM so Excel reads ₹ / Devanagari.
// Pure checks plus one through downloadCSV with stubbed browser APIs.
//
//   npm run test:csv
import { toCSV, downloadCSV, type CsvColumn } from "../src/lib/csv";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type Row = { name: string; amount: number | string | null; note?: string };
const cols: CsvColumn<Row>[] = [
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount" },
  { key: "note", label: "Note" },
];
const cell = (v: string | number | null) => toCSV([{ name: "x", amount: v }], cols).split("\n")[1].split(",")[1];
const line = (row: Row) => toCSV([row], cols).split("\n").slice(1).join("\n");

async function main() {
  // ── Formula prefixes ──
  for (const [v, want] of [
    ["=1+1", "'=1+1"],
    ["+91 98765", "'+91 98765"],
    ["-5 discount", "'-5 discount"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tTAB", "'\tTAB"],
  ] as const) {
    check(`text ${JSON.stringify(v)} → ${JSON.stringify(want)}`, cell(v) === want, JSON.stringify(cell(v)));
  }
  const hyper = line({ name: '=HYPERLINK("http://evil.example","Click")', amount: 1 });
  check("a HYPERLINK formula with quotes and a comma: prefixed, then quoted", hyper === `"'=HYPERLINK(""http://evil.example"",""Click"")",1,`, hyper);
  check("CR at the start: prefixed and quoted", line({ name: "\r=1", amount: 1 }) === `"'\r=1",1,`, JSON.stringify(line({ name: "\r=1", amount: 1 })));
  check("…a formula char later in the text is left alone", cell("a=b") === "a=b" && cell("Dr. Raj - MBBS") === "Dr. Raj - MBBS", `${cell("a=b")} / ${cell("Dr. Raj - MBBS")}`);

  // ── Numbers stay numbers ──
  check("a negative number (refund) is not prefixed", cell(-250) === "-250" && cell(-0.5) === "-0.5", `${cell(-250)} ${cell(-0.5)}`);
  check("NaN / Infinity → empty, not text", cell(NaN) === "" && cell(Infinity) === "", "ok");
  check("null → empty", cell(null) === "", "ok");

  // ── Existing quoting kept ──
  check("commas, quotes and newlines are still quoted", line({ name: 'Pune, "MH"', amount: 2, note: "line1\nline2" }) === `"Pune, ""MH""",2,"line1\nline2"`, JSON.stringify(line({ name: 'Pune, "MH"', amount: 2, note: "line1\nline2" })));
  check("headers go through the same escaping", toCSV([], [{ key: "a", label: "=evil" }]) === "'=evil", toCSV([], [{ key: "a", label: "=evil" }]));
  check("plain values unchanged (incl. ₹ and Devanagari)", line({ name: "राज शर्मा", amount: 1200, note: "₹1,200" }) === `राज शर्मा,1200,"₹1,200"`, line({ name: "राज शर्मा", amount: 1200, note: "₹1,200" }));

  // ── BOM on download ──
  let blob: Blob | null = null;
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } };
  const realUrl = URL;
  g.URL = Object.assign(function () {}, { createObjectURL: (b: Blob) => { blob = b; return "blob:x"; }, revokeObjectURL() {} });
  try {
    const csv = toCSV([{ name: "राज", amount: 1 }], cols);
    downloadCSV("t.csv", csv);
    const bytes = new Uint8Array(await (blob as unknown as Blob).arrayBuffer());
    check("download starts with the UTF-8 BOM (EF BB BF)", bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, [...bytes.slice(0, 3)].map((b) => b.toString(16)).join(" "));
    check("…followed by the CSV, decoded intact", new TextDecoder().decode(bytes.slice(3)) === csv, "ok");
    downloadCSV("t.csv", "\uFEFF" + csv);
    const again = new Uint8Array(await (blob as unknown as Blob).arrayBuffer());
    check("…never a double BOM", !(again[3] === 0xef && again[4] === 0xbb), "ok");
    check("…content type is UTF-8 CSV", (blob as unknown as Blob).type.startsWith("text/csv;charset=utf-8"), (blob as unknown as Blob).type);
  } finally {
    g.URL = realUrl;
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
