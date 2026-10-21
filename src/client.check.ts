/**
 * Guard against regressions from bulk edits: every identifier the client
 * actually calls must be defined before it is used.
 *
 *   bun run src/client.check.ts
 */
import { readFileSync } from "node:fs";

const files = ["public/app.js", "public/treelogic.js"];
let bad = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  // Strip comments and string bodies before scanning, so prose in a comment
  // cannot be mistaken for a call and a URL cannot be read as an identifier.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""');
  console.log(`\n== ${file} (${raw.length} bytes) ==`);

  // const/function declarations, plus arrow-function consts.
  const defs = new Set<string>();
  for (const m of src.matchAll(/(?:const|let|function)\s+([A-Za-z_$][\w$]*)/g)) {
    defs.add(m[1]);
  }

  // Locally scoped names we do not expect to resolve elsewhere.
  const imports = new Set<string>();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) imports.add(name);
    }
  }

  // Genuine browser and language globals.
  const builtins = new Set([
    "document", "window", "console", "Math", "Number", "String", "Boolean",
    "Array", "Object", "Set", "Map", "JSON", "Promise", "parseInt", "parseFloat",
    "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "encodeURIComponent", "decodeURIComponent", "Intl", "Date", "Error",
    "RegExp", "fetch", "EventSource", "AbortController", "Response", "Request",
    "TextDecoder", "TextEncoder", "URL", "URLSearchParams",
    "if", "for", "while", "switch", "catch", "return", "typeof", "new",
    "of", "in", "do", "else", "try", "function", "async", "await", "var",
  ]);

  const called = new Map<string, number>();
  for (const m of src.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[2];
    called.set(name, (called.get(name) ?? 0) + 1);
  }

  const missing = [...called.keys()].filter(
    (n) => !defs.has(n) && !imports.has(n) && !builtins.has(n),
  );

  if (missing.length) {
    bad++;
    for (const n of missing) console.log(`  MISSING: ${n}()  (called ${called.get(n)}x)`);
  } else {
    console.log("  all called identifiers are defined");
  }
}

// Element ids the JS touches must exist in the HTML, unless the JS creates
// them itself (the sync panel does, for its "convert only these" button).
const js = readFileSync("public/app.js", "utf8");
const html = readFileSync("public/index.html", "utf8");
const ids = new Set<string>();
for (const m of js.matchAll(/\$\("([^"]+)"\)/g)) ids.add(m[1]);
for (const m of js.matchAll(/\$input\("([^"]+)"\)/g)) ids.add(m[1]);

// Ids the script builds and injects rather than shipping in index.html.
const createdInJs = new Set(
  [...js.matchAll(/id="([A-Za-z_$][\w$]*)"/g)].map((m) => m[1]),
);

const absent = [...ids].filter(
  (id) => !html.includes(`id="${id}"`) && !createdInJs.has(id),
);
console.log(`\n== element ids ==`);
if (absent.length) {
  bad++;
  for (const id of absent) console.log(`  MISSING in index.html: #${id}`);
} else {
  console.log(`  all ${ids.size} referenced ids resolve (html or created in js)`);
}

console.log(bad ? `\n${bad} problem(s)` : "\nclient OK");
if (bad) process.exit(1);
