/**
 * Guard against client-shell regressions.
 *
 * TypeScript and the bundler already prove that every imported symbol exists.
 * This check covers the seam they cannot see: every element id the client looks
 * up must exist in index.html or be created by the client itself. It also keeps
 * the old un-bundled modules from creeping back into the served artifact.
 *
 *   bun run src/client.check.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let bad = 0;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });

const sources = walk("src/client").filter((file) => file.endsWith(".ts"));
const html = readFileSync("public/index.html", "utf8");
const bundle = readFileSync("public/app.js", "utf8");

// ── 1. The served artifact must be current and self-contained ───────────────
console.log(`\n== bundle ==`);
if (bundle.length < 50_000) {
  bad++;
  console.log(`  app.js is only ${bundle.length} bytes — run bun run build:client`);
} else {
  console.log(`  app.js is ${(bundle.length / 1024).toFixed(1)} KB`);
}

if (/from\s+["']\.\/(?:treelogic|formatlogic)/.test(bundle)) {
  bad++;
  console.log("  app.js still imports the deleted treelogic/formatlogic modules");
} else {
  console.log("  no imports of the deleted un-bundled modules");
}

if (!bundle.includes("/api/")) {
  bad++;
  console.log("  app.js does not look like the client bundle");
}

// ── 2. Every literal element id must resolve ───────────────────────────────
const htmlIds = new Set<string>();
for (const match of html.matchAll(/\bid="([A-Za-z_$][\w$]*)"/g)) {
  const id = match[1];
  if (htmlIds.has(id)) {
    bad++;
    console.log(`  duplicate id in index.html: #${id}`);
  }
  htmlIds.add(id);
}

const created = new Set<string>();
for (const file of sources) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/\bid="([A-Za-z_$][\w$]*)"/g)) created.add(match[1]);
  for (const match of source.matchAll(/\bid='([A-Za-z_$][\w$]*)'/g)) created.add(match[1]);
}

const referenced = new Map<string, string>();
for (const file of sources) {
  const source = readFileSync(file, "utf8");
  const patterns = [
    /\$(?:<[^>]+>)?\("([^"]+)"\)/g,
    /\binput\("([^"]+)"\)/g,
    /\bselect\("([^"]+)"\)/g,
    /document\.getElementById\("([^"]+)"\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (!referenced.has(match[1])) referenced.set(match[1], file);
    }
  }
}

console.log(`\n== element ids ==`);
const absent = [...referenced.entries()].filter(
  ([id]) => !htmlIds.has(id) && !created.has(id),
);
if (absent.length) {
  bad++;
  for (const [id, file] of absent) console.log(`  MISSING in index.html: #${id}  (${file})`);
} else {
  console.log(`  all ${referenced.size} literal ids resolve in HTML or are created by the client`);
}

// ── 3. The shell must not assume macOS chrome ──────────────────────────────
console.log(`\n== platform ==`);
if (/traffic-light|titleBarStyle\s*[:=]\s*["']hiddenInset/.test(html)) {
  bad++;
  console.log("  index.html still contains macOS-only chrome");
} else {
  console.log("  no macOS-only chrome in index.html");
}

console.log(bad ? `\n${bad} problem(s)` : "\nclient OK");
if (bad) process.exit(1);
