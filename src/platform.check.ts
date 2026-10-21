/**
 * Platform path checks, run on both windows-latest and ubuntu-latest.
 *
 * These encode the behaviour Windows had before Linux support: native
 * backslash relative paths, case-insensitive matching, and prefix-safe
 * exclusions. A shared helper that changes any of that fails CI instead of
 * surprising a user.
 *
 *   bun run src/platform.check.ts
 */
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CASE_INSENSITIVE, IS_WINDOWS, REL_SEP, pathKey, relIsUnder, relTop,
} from "./platform.ts";
import { applyPolicy, DEFAULT_POLICY, outputPathFor, type Decision } from "./policy.ts";
import type { ScanResult, ScannedFile } from "./scan.ts";
import { undoManifest, type Manifest } from "./manifest.ts";
import { analyseSync } from "./sync.ts";
import * as tree from "../public/treelogic.js";

let failures = 0;

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${(err as Error).message}`);
  }
}

const nativeRel = (...parts: string[]) => parts.join(REL_SEP);

function scanned(parts: string[], size = 2 * 1024 * 1024): ScannedFile {
  const rel = nativeRel(...parts);
  return {
    abs: path.resolve("/library", rel),
    rel,
    dir: path.dirname(rel),
    name: parts[parts.length - 1],
    ext: "jpg",
    size,
    category: "image",
    mtime: 0,
  };
}

console.log(`platform: ${process.platform}, separator: ${JSON.stringify(REL_SEP)}`);

await check("platform constants", () => {
  assert.equal(REL_SEP, IS_WINDOWS ? "\\" : "/");
  assert.equal(CASE_INSENSITIVE, IS_WINDOWS);
});

await check("splits both native path styles when asked", () => {
  assert.equal(relTop("album/2025/a.jpg", "/"), "album");
  assert.equal(relTop("album\\2025\\a.jpg", "\\"), "album");
});

await check("uses the platform separator by default", () => {
  assert.equal(relTop(nativeRel("album", "2025", "a.jpg")), "album");
});

await check("treats a literal backslash as a filename character on Linux", () => {
  if (!IS_WINDOWS) assert.equal(relTop("album\\november.jpg"), "album\\november.jpg");
});

await check("matches prefixes only on a path boundary", () => {
  assert.equal(relIsUnder("album/sub/a.jpg", "album", "/"), true);
  assert.equal(relIsUnder("album", "album", "/"), true);
  assert.equal(relIsUnder("albums/a.jpg", "album", "/"), false);
  assert.equal(relIsUnder("album2\\a.jpg", "album", "\\"), false);
});

await check("folds path case only on Windows", () => {
  assert.equal(pathKey("Album/Sub"), CASE_INSENSITIVE ? "album/sub" : "Album/Sub");
});

await check("groups by the platform top-level folder", () => {
  const scan = {
    files: [scanned(["album", "sub", "a.jpg"])],
  } as unknown as ScanResult;
  const preview = applyPolicy(scan, DEFAULT_POLICY);
  assert.equal(preview.byFolder.length, 1);
  assert.equal(preview.byFolder[0].rel, "album");
});

await check("builds native output paths", () => {
  const destination = path.resolve("platform-check-out");
  const decision: Decision = {
    file: scanned(["album", "sub", "a.jpg"]),
    verdict: "convert",
    reason: "ok",
  };
  assert.equal(
    outputPathFor(decision, "/source", destination, DEFAULT_POLICY),
    path.join(destination, nativeRel("album", "sub"), "a.avif"),
  );
});

await check("undo refuses paths outside the destination", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "picmagick-platform-"));
  try {
    const destination = path.join(root, "out");
    await mkdir(destination);
    const inside = path.join(destination, "a.avif");
    const outside = path.join(root, "outside.avif");
    await writeFile(inside, "x");
    await writeFile(outside, "x");

    const entry = (out: string): Manifest["entries"][number] => ({
      out, src: "/source/a.jpg", status: "converted", bytes: 1, at: 0,
    });
    const manifest: Manifest = {
      id: "platform-check",
      createdAt: 0,
      sourceRoot: path.join(root, "src"),
      destination,
      quality: [60],
      heicSpeed: 6,
      tool: "platform-check",
      entries: [entry(inside), entry(outside)],
      summary: { converted: 2, copied: 0, skipped: 0, failed: 0, bytes: 2 },
    };

    const result = await undoManifest(manifest, { dryRun: true });
    assert.equal(result.removed, 1);
    assert.equal(result.refused, 1);
    assert.equal(result.missing, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await check("undo case handling follows the platform", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "picmagick-platform-"));
  try {
    const destination = path.join(root, "out");
    await mkdir(destination);
    const inside = path.join(destination, "a.avif");
    await writeFile(inside, "x");

    const manifest: Manifest = {
      id: "platform-check",
      createdAt: 0,
      sourceRoot: path.join(root, "src"),
      destination: destination.toUpperCase(),
      quality: [60],
      heicSpeed: 6,
      tool: "platform-check",
      entries: [{
        out: inside, src: "/source/a.jpg", status: "converted", bytes: 1, at: 0,
      }],
      summary: { converted: 1, copied: 0, skipped: 0, failed: 0, bytes: 1 },
    };

    const result = await undoManifest(manifest, { dryRun: true });
    assert.equal(result.refused, CASE_INSENSITIVE ? 0 : 1);
    assert.equal(result.removed, CASE_INSENSITIVE ? 1 : 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await check("sync matches output case only on Windows", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "picmagick-platform-"));
  try {
    const source = path.join(root, "src");
    const destination = path.join(root, "out");
    const outDir = path.join(destination, "album");
    await mkdir(source);
    await mkdir(outDir, { recursive: true });

    // Deliberately wrong case. Windows must still find it; Linux must not.
    const output = path.join(outDir, "A.avif");
    await writeFile(output, "x");
    const now = new Date();
    await utimes(output, now, now);

    const decision: Decision = {
      file: scanned(["album", "a.jpg"]),
      verdict: "convert",
      reason: "ok",
    };
    const report = await analyseSync([decision], source, destination, DEFAULT_POLICY);
    assert.equal(report.entries[0].state, CASE_INSENSITIVE ? "upToDate" : "new");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const opts = { sep: REL_SEP, caseInsensitive: CASE_INSENSITIVE };
const ex = tree.excludedLower(new Set([nativeRel("album")]), CASE_INSENSITIVE);

await check("exclusion covers a folder and its descendants", () => {
  const child = CASE_INSENSITIVE
    ? nativeRel("ALBUM", "SUB", "a.jpg")
    : nativeRel("album", "sub", "a.jpg");
  assert.equal(tree.isFullyExcluded(child, ex, new Set(), opts), true);
  assert.equal(tree.isFullyExcluded(nativeRel("albums", "a.jpg"), ex, new Set(), opts), false);
});

await check("an include overrides an excluded ancestor", () => {
  const inc = tree.excludedLower(new Set([nativeRel("album", "sub")]), CASE_INSENSITIVE);
  assert.equal(
    tree.isFullyExcluded(nativeRel("album", "sub", "a.jpg"), ex, inc, opts),
    false,
  );
  assert.equal(
    tree.isFullyExcluded(nativeRel("album", "other", "a.jpg"), ex, inc, opts),
    true,
  );
});

await check("a descendant exclusion is visible to the tree", () => {
  const node = { rel: nativeRel("album"), children: [] };
  assert.equal(tree.hasExcludedDescendant(node, ex, new Set(), opts), true);
  const other = { rel: nativeRel("other"), children: [] };
  assert.equal(tree.hasExcludedDescendant(other, ex, new Set(), opts), false);
});

await check("toggling keeps ancestor exclusions and adds include overrides", () => {
  let r = tree.toggleFolder(null, new Set(), nativeRel("album"), true, new Set(), opts);
  assert.equal(r.excluded.size, 1);
  assert.equal(r.included.size, 0);

  r = tree.toggleFolder(null, r.excluded, nativeRel("album", "sub"), false, r.included, opts);
  assert.equal(r.excluded.size, 1);
  assert.equal(r.included.size, 1);

  r = tree.toggleFolder(null, r.excluded, nativeRel("album"), false, r.included, opts);
  assert.equal(r.excluded.size, 0);
  assert.equal(r.included.size, 0);
});

await check("tree logic also handles explicit Windows-style paths", () => {
  const windowsEx = new Set(["album"]);
  assert.equal(
    tree.isFullyExcluded("Album\\Sub\\a.jpg", windowsEx, new Set(), {
      sep: "\\", caseInsensitive: true,
    }),
    true,
  );
});

await check("tree logic handles exact-case Linux paths", () => {
  assert.equal(
    tree.isFullyExcluded("Album/Sub/a.jpg", new Set(["album"]), new Set(), {
      sep: "/", caseInsensitive: false,
    }),
    false,
  );
});

console.log(failures ? `\n${failures} platform check(s) failed` : "\nplatform OK");
if (failures) process.exit(1);
