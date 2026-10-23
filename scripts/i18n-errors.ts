// Finds the user-facing error messages the server sends ({ error: "…" } in
// API routes, the *Problem()/*Error() helpers in src/lib, Zod rule messages)
// and checks each one has an entry in messages/en-IN/errors.json — the
// catalog src/lib/apiErrors.ts translates responses with.
//
//   npx tsx scripts/i18n-errors.ts          list messages missing from the catalog
//   npx tsx scripts/i18n-errors.ts --json   …as JSON (id → English) to paste in
//
// scripts/i18n-errors-ignore.json lists extracted texts (as printed here) that
// aren't user-facing: LLM tool results, config/internal errors, developer-only
// parameter checks, admin-only helpers.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { errorPattern } from "../src/lib/errorCatalog";

const ROOT = path.join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Files whose messages reach patients, doctors, nurses and staff (not the admin panel). */
export function sourceFiles(): string[] {
  const api = walk(path.join(ROOT, "src/app/api")).filter((f) => !f.includes(`${path.sep}admin${path.sep}`));
  const lib = walk(path.join(ROOT, "src/lib")).filter((f) => {
    const src = fs.readFileSync(f, "utf8");
    return !/^["']use client["']/.test(src.trimStart());
  });
  return [...api, ...lib];
}

const ZOD_METHODS = new Set(["min", "max", "length", "regex", "refine", "superRefine", "email", "url", "int", "positive", "nonnegative", "gte", "lte", "gt", "lt", "startsWith", "endsWith", "includes", "uuid", "nonempty", "datetime", "date"]);

/** A template's English with `${expr}` turned into `{name}` placeholders. */
function templateText(node: ts.TemplateExpression, sf: ts.SourceFile): string {
  const used = new Map<string, number>();
  let text = node.head.text;
  for (const span of node.templateSpans) {
    const expr = span.expression.getText(sf);
    let name = (expr.match(/([A-Za-z_$][\w$]*)\)?\s*(?:\?\?.*)?$/)?.[1] ?? "value")
      .replace(/^[A-Z0-9_]+$/, (c) => c.toLowerCase().replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase()));
    if (/^(toFixed|toString|toLocaleString|join|trim|length|String|Number)$/.test(name)) name = "value";
    const n = (used.get(name) ?? 0) + 1;
    used.set(name, n);
    text += `{${n > 1 ? `${name}${n}` : name}}` + span.literal.text;
  }
  return text;
}

function messagesIn(expr: ts.Expression | undefined, sf: ts.SourceFile, out: string[]) {
  if (!expr) return;
  if (ts.isParenthesizedExpression(expr)) return messagesIn(expr.expression, sf, out);
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) out.push(expr.text);
  else if (ts.isTemplateExpression(expr)) out.push(templateText(expr, sf));
  else if (ts.isConditionalExpression(expr)) { messagesIn(expr.whenTrue, sf, out); messagesIn(expr.whenFalse, sf, out); }
  else if (ts.isBinaryExpression(expr) && (expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || expr.operatorToken.kind === ts.SyntaxKind.BarBarToken)) messagesIn(expr.right, sf, out);
}

/** Texts with fewer than 3 letters outside placeholders ("{day}", "{name}: {error}") aren't messages. */
const hasWords = (s: string) => (s.replace(/\{[^}]+\}/g, "").match(/[A-Za-z]/g)?.length ?? 0) >= 3;

export function ignoredTexts(): Set<string> {
  const file = path.join(ROOT, "scripts/i18n-errors-ignore.json");
  return new Set(fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as string[]) : []);
}

const sentence = (s: string) => /[A-Za-z]{2}/.test(s) && /\s/.test(s.trim()) && !/^[a-z]+(\.[a-z]+)+$/i.test(s);

export function extractMessages(): { text: string; file: string; line: number }[] {
  const found: { text: string; file: string; line: number }[] = [];
  const ignored = ignoredTexts();
  for (const file of sourceFiles()) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const rel = path.relative(ROOT, file);
    let at = 0;
    const add = (texts: string[], loose = false) => {
      for (const t of texts) if (t.trim() && hasWords(t) && !ignored.has(t) && (loose || sentence(t))) found.push({ text: t, file: rel, line: at });
    };
    const fnName = (n: ts.Node): string | undefined => {
      for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
        if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) return p.name.getText(sf);
        if (ts.isVariableDeclaration(p) && p.initializer && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))) return p.name.getText(sf);
      }
    };
    const visit = (n: ts.Node) => {
      at = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
      if (ts.isPropertyAssignment(n) && /^(error|message)$/.test(n.name.getText(sf))) {
        const out: string[] = []; messagesIn(n.initializer, sf, out);
        add(out, n.name.getText(sf) === "error");
      } else if (ts.isReturnStatement(n) && /(Problem|Error|Message|Reason)s?$/.test(fnName(n) ?? "")) {
        const out: string[] = []; messagesIn(n.expression, sf, out); add(out);
      } else if (ts.isVariableDeclaration(n) && /(_MESSAGE|_ERROR|Message|ERROR)$/.test(n.name.getText(sf))) {
        const out: string[] = []; messagesIn(n.initializer as ts.Expression, sf, out); add(out);
      } else if (ts.isNewExpression(n) && n.expression.getText(sf) === "Error" && n.arguments?.length) {
        const out: string[] = []; messagesIn(n.arguments[0], sf, out); add(out);
      } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ZOD_METHODS.has(n.expression.name.text)) {
        const out: string[] = [];
        for (const a of n.arguments) messagesIn(a, sf, out);
        add(out);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

function idFor(text: string, taken: Set<string>): string {
  const words = text.replace(/\{[^}]+\}/g, " ").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 6);
  let id = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join("") || "message";
  if (/^\d/.test(id)) id = `m${id}`;
  let n = 1, out = id;
  while (taken.has(out)) out = `${id}${++n}`;
  taken.add(out);
  return out;
}

if (require.main === module) {
  const catalog: Record<string, string> = JSON.parse(fs.readFileSync(path.join(ROOT, "messages/en-IN/errors.json"), "utf8"));
  const patterns = Object.values(catalog).map(errorPattern);
  const seen = new Set<string>();
  const missing = extractMessages().filter(({ text }) => {
    if (seen.has(text)) return false;
    seen.add(text);
    const sample = text.replace(/\{[^}]+\}/g, "7");
    return !patterns.some((re) => re.test(text) || re.test(sample));
  });
  if (process.argv.includes("--json")) {
    const taken = new Set(Object.keys(catalog));
    console.log(JSON.stringify(Object.fromEntries(missing.map(({ text }) => [idFor(text, taken), text])), null, 2));
  } else {
    for (const m of missing) console.log(`${m.file}:${m.line}: ${m.text}`);
    console.log(`\n${missing.length} message(s) missing from messages/en-IN/errors.json`);
    process.exitCode = missing.length ? 1 : 0;
  }
}
