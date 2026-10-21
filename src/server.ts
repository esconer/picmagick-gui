/**
 * ImageMagick picmagick-gui - local server.
 *
 * Bun.serve() on localhost only. Every route either reads state or shells out
 * to magick.exe. The source tree is never written to.
 */
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { scanLibrary, type ScanResult, type ScannedFile } from "./scan.ts";
import {
  applyPolicy, normalisePolicy, DEFAULT_POLICY, outputPathFor,
  type Policy, type Preview,
} from "./policy.ts";
import {
  findMagick, assertDestinationSafe, freeSpace, ensureDir, type MagickInfo,
} from "./paths.ts";
import { estimateFromSample, type Estimate } from "./estimate.ts";
import { findDuplicates, type DedupeResult } from "./dedupe.ts";
import { identifyMany, buildDateReport, type DateReport, type ImageFacts } from "./meta.ts";
import { verifyOutputs, type VerifyReport } from "./verify.ts";
import { planBudget, type BudgetPlan } from "./budget.ts";
import { runHealthCheck, type HealthReport } from "./health.ts";
import { Job, getJob, liveJob, pausedJob, newJob, manifestsFor, undoManifest } from "./jobs.ts";
import { analyseSync, pendingOnly, type SyncReport } from "./sync.ts";
import { formatBytes } from "./convert.ts";
import { checkForUpdate, installLatest, installProgress } from "./imagemagick.ts";
import { CASE_INSENSITIVE, pathKey, REL_SEP } from "./platform.ts";

const HERE = import.meta.dir;
const PUBLIC = path.resolve(HERE, "..", "public");

// --------------------------------------------------------------------------
// Shared server state
// --------------------------------------------------------------------------

type State = {
  sourceRoot: string;
  destination: string;
  magick: MagickInfo | null;
  scan: ScanResult | null;
  /** rel -> file, so the compare and passthrough routes are O(1) not O(11k). */
  index: Map<string, ScannedFile>;
  policy: Policy;
  ratio: number;
  budgetBytes: number;
  lastPreview: Preview | null;
  lastEstimate: Estimate | null;
  dedupe: DedupeResult | null;
  verify: VerifyReport | null;
  dates: DateReport | null;
  sync: SyncReport | null;
  /** Where the originals also live, for the redundancy banner. */
  redundantRoots: string[];
};

function defaultSourceRoot(): string {
  const configured = process.env.PICMAGIK_SOURCE?.trim();
  if (configured) return path.resolve(configured);
  const pictures = path.join(homedir(), "Pictures");
  return existsSync(pictures) ? pictures : homedir();
}

const DEFAULT_SOURCE = defaultSourceRoot();
const DEFAULT_DESTINATION =
  process.env.PICMAGIK_DESTINATION?.trim() || `${DEFAULT_SOURCE}-avif`;

const state: State = {
  sourceRoot: DEFAULT_SOURCE,
  destination: DEFAULT_DESTINATION,
  magick: null,
  scan: null,
  index: new Map(),
  policy: normalisePolicy(DEFAULT_POLICY),
  ratio: 0.174,
  budgetBytes: 10 * 1024 ** 3,
  lastPreview: null,
  lastEstimate: null,
  dedupe: null,
  verify: null,
  dates: null,
  sync: null,
  redundantRoots: [],
};

function requireMagick(): MagickInfo {
  if (!state.magick) state.magick = findMagick();
  return state.magick;
}

function currentPreview(): Preview {
  if (!state.scan) throw new HttpError(400, "Scan the library first.");
  state.lastPreview = applyPolicy(state.scan, state.policy, state.ratio);
  return state.lastPreview;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, jsonReplacer), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/** Full-precision floats are noise in a JSON payload and bloat SSE frames. */
function jsonReplacer(_k: string, v: unknown) {
  if (typeof v === "number" && !Number.isInteger(v)) return Number(v.toFixed(4));
  return v;
}

const bytes = (n: unknown) => typeof n === "number" ? formatBytes(n) : "";

/** Extensions the compare view can actually display. */
const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg", jfif: "image/jpeg",
  heic: "image/heic", heif: "image/heif",
  png: "image/png", gif: "image/gif", bmp: "image/bmp", webp: "image/webp",
  tif: "image/tiff", tiff: "image/tiff", avif: "image/avif",
};

/** Ceiling for the in-browser original preview. */
const MAX_PASSTHROUGH_BYTES = 64 * 1024 * 1024;

/** Set after Bun.serve() so the shutdown route can stop the listener. */
let requestShutdown: (() => void) | null = null;

async function readBody<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; }
  catch { throw new HttpError(400, "Malformed JSON body."); }
}

// --------------------------------------------------------------------------
// Routes
// --------------------------------------------------------------------------

async function handleApi(pathname: string, req: Request, url: URL): Promise<Response> {
  const route = pathname.replace(/^\/api\/?/, "");

  // ---- status / config ----
  if (route === "status" && req.method === "GET") {
    const free = await freeSpace(state.destination);
    return json({
      sourceRoot: state.sourceRoot,
      destination: state.destination,
      /** Browser-side path logic follows the server's platform, not its own. */
      pathSeparator: REL_SEP,
      caseInsensitive: CASE_INSENSITIVE,
      budgetBytes: state.budgetBytes,
      ratio: state.ratio,
      policy: state.policy,
      scanned: Boolean(state.scan),
      scannedAt: state.scan?.scannedAt ?? null,
      fileCount: state.scan?.files.length ?? 0,
      freeBytes: free,
      freeLabel: bytes(free),
      magick: state.magick
        ? {
            version: state.magick.version,
            path: state.magick.path,
            avifWritable: state.magick.avifWritable,
            libheif: state.magick.libheif,
          }
        : null,
      // Expose whichever job is live so a refreshed page can re-attach to it,
      // not just a paused one.
      liveJobId: liveJob()?.id ?? null,
      pausedJobId: pausedJob()?.id ?? null,
      redundantRoots: state.redundantRoots,
      projects: projectList(),
    });
  }

  if (route === "config" && req.method === "POST") {
    const body = await readBody<Partial<State>>(req);

    // Validate against the *prospective* values before mutating anything, so a
    // rejected change cannot leave the server half-configured.
    const nextSource = typeof body.sourceRoot === "string" ? body.sourceRoot : state.sourceRoot;
    const nextDest = typeof body.destination === "string" ? body.destination : state.destination;
    assertDestinationSafe(nextSource, nextDest);

    if (typeof body.destination === "string") state.destination = body.destination;
    if (typeof body.budgetBytes === "number") state.budgetBytes = body.budgetBytes;
    if (Array.isArray(body.redundantRoots)) state.redundantRoots = body.redundantRoots;
    if (body.policy) state.policy = normalisePolicy({ ...state.policy, ...body.policy });

    // A new source invalidates everything derived from the old one.
    if (nextSource !== state.sourceRoot) {
      state.sourceRoot = nextSource;
      state.scan = null;
      state.index = new Map();
      state.dedupe = null;
      state.verify = null;
      state.dates = null;
      state.sync = null;
      state.lastPreview = null;
      state.lastEstimate = null;
    }

    return json({
      ok: true,
      sourceRoot: state.sourceRoot,
      destination: state.destination,
      needsScan: state.scan === null,
    });
  }

  /** Lightweight validation so the UI can reject a bad path before scanning. */
  if (route === "validate" && req.method === "POST") {
    const body = await readBody<{ sourceRoot?: string; destination?: string }>(req);
    const src = body.sourceRoot ?? state.sourceRoot;
    const dst = body.destination ?? state.destination;
    try {
      assertDestinationSafe(src, dst);
    } catch (err) {
      return json({ ok: false, error: (err as Error).message });
    }
    let exists = false;
    let readable = false;
    try {
      const st = await stat(src);
      exists = true;
      readable = st.isDirectory();
    } catch { /* not there */ }
    return json({ ok: exists && readable, exists, isDirectory: readable });
  }

  // ---- native folder picker via PowerShell dialog ----
  if (route === "pick" && req.method === "POST") {
    const body = await readBody<{ title?: string }>(req);
    const picked = await folderPicker(body.title ?? "Choose a folder");
    return json({ path: picked });
  }

  // ---- scan ----
  if (route === "scan" && req.method === "POST") {
    const body = await readBody<{ sourceRoot?: string }>(req);
    if (body.sourceRoot) {
      state.sourceRoot = body.sourceRoot;
      assertDestinationSafe(state.sourceRoot, state.destination);
    }
    const t0 = Date.now();
    state.scan = await scanLibrary(state.sourceRoot);
    // Exact-match lookups later; a linear find over 11k files per request was
    // showing up on every compare and passthrough call.
    state.index = new Map(state.scan.files.map((f) => [f.rel, f]));
    state.dedupe = null;
    state.verify = null;
    state.dates = null;
    state.lastEstimate = null;
    return json({
      ok: true,
      durationMs: Date.now() - t0,
      tree: state.scan.tree,
      totals: state.scan.totals,
      deadFolders: state.scan.deadFolders,
      riskyNames: state.scan.riskyNames,
      skipped: state.scan.skipped,
      projects: projectList(),
    });
  }

  // ---- preview: apply policy, no disk I/O beyond the cached scan ----
  if (route === "preview" && req.method === "POST") {
    const body = await readBody<{ policy?: Partial<Policy> }>(req);
    if (body.policy) state.policy = normalisePolicy({ ...state.policy, ...body.policy });
    const preview = currentPreview();
    const budget: BudgetPlan = planBudget(preview, state.budgetBytes);
    const health = await runHealthCheck(state.sourceRoot, state.destination, preview.estOutputBytes);
    return json({
      convert: preview.convert.length,
      copy: preview.copy.length,
      skip: preview.skip.length,
      sourceBytes: preview.sourceBytes,
      estOutputBytes: preview.estOutputBytes,
      estOutputFiles: preview.estOutputFiles,
      ratio: preview.compressionRatio,
      byFolder: preview.byFolder,
      budget,
      health,
      // health already measured free space for the destination.
      freeBytes: health.freeBytes,
    });
  }

  // ---- estimate: real sample ----
  if (route === "estimate" && req.method === "POST") {
    const body = await readBody<{ sampleSize?: number; jobs?: number; policy?: Partial<Policy> }>(req);
    if (body.policy) state.policy = normalisePolicy({ ...state.policy, ...body.policy });
    const preview = currentPreview();
    const magick = requireMagick();
    const est = await estimateFromSample({
      convert: preview.convert,
      copy: preview.copy,
      sourceRoot: state.sourceRoot,
      magickPath: magick.path,
      policy: state.policy,
      jobs: Math.max(1, Math.min(body.jobs ?? 4, 16)),
      sampleSize: Math.max(10, Math.min(body.sampleSize ?? 120, 2000)),
      flatRatio: state.ratio,
    });
    state.lastEstimate = est;
    // A real measurement becomes the flat ratio for instant previews.
    if (est.method === "sampled" && est.sampleSize > 0) state.ratio = est.ratio;
    return json(est);
  }

  // ---- duplicates ----
  if (route === "duplicates" && req.method === "POST") {
    if (!state.scan) throw new HttpError(400, "Scan the library first.");
    const body = await readBody<{ maxHash?: number }>(req);
    const res = await findDuplicates(state.scan.files, state.policy, {
      maxHash: Math.min(body.maxHash ?? 6000, 40000),
    });
    state.dedupe = res;
    return json({
      groups: res.groups.slice(0, 300),
      groupCount: res.groups.length,
      duplicateFiles: res.duplicateFiles,
      duplicateBytes: res.duplicateBytes,
      hashedFiles: res.hashedFiles,
      durationMs: res.durationMs,
    });
  }

  // ---- metadata / dates ----
  if (route === "dates" && req.method === "POST") {
    if (!state.scan) throw new HttpError(400, "Scan the library first.");
    const body = await readBody<{ limit?: number }>(req);
    const preview = currentPreview();
    const magick = requireMagick();
    const all = [...preview.convert, ...preview.copy];
    // Say so rather than silently auditing a subset.
    const limit = Math.max(1, Math.min(body.limit ?? 4000, 20000));
    const subset = all.slice(0, limit);
    const facts: ImageFacts[] = await identifyMany(
      magick.path, subset.map((d) => d.file.abs), 8,
    );
    const report = buildDateReport(facts);
    state.dates = report;
    return json({
      ...report,
      scanned: facts.length,
      inScope: all.length,
      truncated: all.length > subset.length,
      omitted: all.length - subset.length,
      undated: report.undated.slice(0, 500),
    });
  }

  // ---- health ----
  if (route === "health" && req.method === "GET") {
    const preview = state.scan ? currentPreview() : null;
    const report = await runHealthCheck(
      state.sourceRoot, state.destination, preview?.estOutputBytes ?? 0,
    );
    return json(report);
  }

  // ---- shutdown ----
  if (route === "shutdown" && req.method === "POST") {
    const live = liveJob();
    if (live) {
      throw new HttpError(
        409,
        live.state === "paused"
          ? "A conversion is paused. Resume or cancel it before closing the server."
          : "A conversion is running. Pause or cancel it before closing the server.",
      );
    }
    if (installProgress().running) {
      throw new HttpError(409, "An ImageMagick download is in progress. Wait for it to finish before closing the server.");
    }

    // Let this response reach the browser, then stop the listener and exit.
    setTimeout(() => requestShutdown?.(), 300);
    return json({ ok: true, message: "picmagick-gui is shutting down." });
  }

  // ---- portable ImageMagick: local install + GitHub update check ----
  if (route === "imagemagick" && req.method === "GET") {
    if (!state.magick) {
      // Pick up a copy the user dropped into imagemagick/ since startup.
      try { state.magick = findMagick(); } catch { state.magick = null; }
    }
    return json(await checkForUpdate({ current: state.magick }));
  }

  if (route === "imagemagick/check" && req.method === "GET") {
    if (!state.magick) {
      try { state.magick = findMagick(); } catch { state.magick = null; }
    }
    return json(await checkForUpdate({
      current: state.magick,
      force: url.searchParams.get("force") === "1",
    }));
  }

  if (route === "imagemagick/progress" && req.method === "GET") {
    return json(installProgress());
  }

  if (route === "imagemagick/install" && req.method === "POST") {
    // Replacing the binaries under running encoders is not safe on Windows.
    const live = liveJob();
    if (live) {
      throw new HttpError(
        409,
        live.state === "paused"
          ? "A conversion is paused. Resume or cancel it before updating ImageMagick."
          : "A conversion is running. Pause or cancel it before updating ImageMagick.",
      );
    }
    if (installProgress().running) {
      throw new HttpError(409, "An ImageMagick download is already in progress.");
    }

    let result;
    try {
      result = await installLatest();
    } catch (err) {
      throw new HttpError(502, (err as Error).message);
    }

    // The old binary may be cached in state; probe the new one immediately so
    // the very next conversion uses it.
    state.magick = null;
    try { state.magick = findMagick(); } catch { /* reported by the next health call */ }

    return json({
      ok: true,
      ...result,
      installed: state.magick
        ? { version: state.magick.version, path: state.magick.path, avifWritable: state.magick.avifWritable }
        : null,
    });
  }

  // ---- quality preview: render one image at several qualities ----
  if (route === "compare" && req.method === "POST") {
    const body = await readBody<{ rel: string; qualities?: number[] }>(req);
    if (!state.scan) throw new HttpError(400, "Scan the library first.");
    const file = state.index.get(body.rel);
    if (!file) throw new HttpError(404, `Not in scan: ${body.rel}`);

    const magick = requireMagick();
    const qualities = (body.qualities ?? [30, 50, 60, 70, 80]).slice(0, 6);
    // Fixed location. This previously took a destination from the request
    // body, which let a caller direct writes anywhere on the machine.
    const outDir = path.resolve(HERE, "..", ".preview-cache");
    await ensureDir(outDir);

    const variants: { quality: number; url: string; bytes: number }[] = [];
    const errors: string[] = [];
    for (const q of qualities) {
      // Keep the .avif extension: the preview route sets image/avif explicitly,
      // and stripping it would only confuse anything that sniffs by filename.
      const name = `cmp-${hashRel(file.rel)}-q${q}.avif`;
      const out = path.join(outDir, name);
      await new Promise<void>((resolve) => {
        const c = spawn(magick.path, [
          file.abs, "-auto-orient", "-colorspace", "sRGB",
          "-quality", String(q), "-define", `heic:speed=${state.policy.heicSpeed}`,
          `AVIF:${out}`,
        ], { windowsHide: true, env: { ...process.env, MAGICK_THREAD_LIMIT: "1" } });
        c.on("close", () => resolve());
        c.on("error", () => resolve());
      });
      let size = 0;
      try {
        size = (await stat(out)).size;
        if (size === 0) { errors.push(`q${q}: encoder wrote nothing`); continue; }
      } catch { errors.push(`q${q}: no output produced`); continue; }
      variants.push({ quality: q, url: `/preview-cache/${name}`, bytes: size });
    }

    return json({
      rel: file.rel,
      originalUrl: `/api/source-file?rel=${encodeURIComponent(file.rel)}`,
      originalBytes: file.size,
      variants,
      errors,
    });
  }

  // ---- source file passthrough (read-only) for the compare view ----
  if (route === "source-file" && req.method === "GET") {
    if (!state.scan) throw new HttpError(404, "No scan.");
    const rel = url.searchParams.get("rel");
    const file = state.index.get(rel ?? "");
    if (!file) throw new HttpError(404, "Not in scan.");

    // This route exists so the browser can show the untouched original next to
    // the AVIF variants. It must never serve video, archives or cache files -
    // A single file can be several gigabytes, and reading one into memory
    // memory would take the server down.
    if (!IMAGE_MIME[file.ext.toLowerCase()]) {
      throw new HttpError(415, `Not a displayable image: .${file.ext}`);
    }
    if (file.size > MAX_PASSTHROUGH_BYTES) {
      throw new HttpError(
        413,
        `Too large to preview in the browser: ${(file.size / 1024 ** 3).toFixed(2)} GB`,
      );
    }

    // Stream from disk rather than buffering the whole file.
    const stream = Bun.file(file.abs).stream();
    return new Response(stream, {
      headers: {
        "content-type": IMAGE_MIME[file.ext.toLowerCase()],
        "content-length": String(file.size),
        "cache-control": "no-store",
      },
    });
  }

  // ---- run ----
  if (route === "run" && req.method === "POST") {
    const body = await readBody<{ jobs?: number; overwrite?: boolean; policy?: Partial<Policy>; onlyNew?: boolean }>(req);
    // A paused job still owns its queue, so a fresh run must not start over it.
    const live = liveJob();
    if (live) {
      throw new HttpError(
        409,
        live.state === "paused"
          ? "A conversion is paused. Resume or cancel it before starting another."
          : "A conversion is already running.",
      );
    }
    if (body.policy) state.policy = normalisePolicy({ ...state.policy, ...body.policy });
    const preview = currentPreview();
    const magick = requireMagick();
    assertDestinationSafe(state.sourceRoot, state.destination);
    await ensureDir(state.destination);

    let decisions = [...preview.convert, ...preview.copy];

    // "Convert new only": drop anything already converted and current.
    if (body.onlyNew) {
      const report = await analyseSync(decisions, state.sourceRoot, state.destination, state.policy);
      decisions = pendingOnly(decisions, report);
      state.sync = report;
    }

    if (decisions.length === 0) throw new HttpError(400, "Nothing to do - everything is already converted.");

    const jobs = Math.max(1, Math.min(body.jobs ?? 9, 32));
    const job = newJob();

    void job.start({
      decisions,
      sourceRoot: state.sourceRoot,
      destination: state.destination,
      magickPath: magick.path,
      policy: state.policy,
      jobs,
      overwrite: Boolean(body.overwrite),
      qualityLabel: state.policy.qualities,
    });

    return json({ jobId: job.id, total: decisions.length, jobs });
  }

  // ---- SSE progress ----
  if (route.startsWith("stream/") && req.method === "GET") {
    const job = getJob(route.slice("stream/".length));
    if (!job) throw new HttpError(404, "Unknown job.");

    const encoder = new TextEncoder();
    let ping: ReturnType<typeof setInterval> | null = null;
    let detach: (() => void) | null = null;

    const stream = new ReadableStream({
      start(controller) {
        const send = (p: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(p, jsonReplacer)}\n\n`));
          } catch { /* client went away */ }
        };
        send({ type: "hello", jobId: job.id, state: job.state });
        job.on("progress", send);
        ping = setInterval(() => {
          try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* ignore */ }
        }, 15_000);
        // Drop the listener when the stream ends. Without this, every page
        // refresh left another listener holding a dead response.
        detach = () => { job.off("progress", send); };
      },
      cancel() {
        detach?.();
        if (ping) clearInterval(ping);
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }

  if (route.startsWith("jobs/") && req.method === "POST") {
    const job = getJob(route.slice("jobs/".length));
    if (!job) throw new HttpError(404, "Unknown job.");
    const body = await readBody<{ jobs?: number }>(req);
    // The pool reads this before every dispatch, so it takes effect on the
    // next file rather than at the next run.
    return json({ ok: true, jobs: job.setJobs(Number(body.jobs)) });
  }

  if (route.startsWith("pause/") && req.method === "POST") {
    const job = getJob(route.slice("pause/".length));
    if (!job) throw new HttpError(404, "Unknown job.");
    // Graceful: in-flight encodes are allowed to finish and land on disk.
    const ok = job.pause();
    return json({ ok, state: job.state, message: ok ? "Pausing…" : `Cannot pause from "${job.state}".` });
  }

  if (route.startsWith("resume/") && req.method === "POST") {
    const job = getJob(route.slice("resume/".length));
    if (!job) throw new HttpError(404, "Unknown job.");
    void job.resume();
    return json({ ok: true, state: job.state, total: job.progress().total });
  }

  if (route === "job/state" && req.method === "GET") {
    const job = getJob(url.searchParams.get("id") ?? "");
    if (!job) throw new HttpError(404, "Unknown job.");
    return json({ id: job.id, ...job.progress() });
  }

  if (route.startsWith("cancel/") && req.method === "POST") {
    const job = getJob(route.slice("cancel/".length));
    if (!job) throw new HttpError(404, "Unknown job.");
    job.cancel();
    return json({ ok: true, state: job.state });
  }

  // ---- incremental sync: what is already converted ----
  if (route === "sync" && req.method === "POST") {
    if (!state.scan) throw new HttpError(400, "Scan the library first.");
    const body = await readBody<{ policy?: Partial<Policy> }>(req);
    if (body.policy) state.policy = normalisePolicy({ ...state.policy, ...body.policy });
    const preview = currentPreview();
    const decisions = [...preview.convert, ...preview.copy];

    const report = await analyseSync(
      decisions, state.sourceRoot, state.destination, state.policy,
    );
    state.sync = report;

    const pending = pendingOnly(decisions, report);

    return json({
      total: report.total,
      newCount: report.newCount,
      changedCount: report.changedCount,
      upToDateCount: report.upToDateCount,
      pendingCount: report.pendingCount,
      pendingSourceBytes: report.pendingSourceBytes,
      orphanCount: report.orphans.length,
      orphanBytes: report.orphanBytes,
      orphans: report.orphans.slice(0, 25),
      estOutputBytes: Math.round(
        pending.filter((d) => d.verdict === "convert").reduce((a, d) => a + d.file.size, 0) *
          state.ratio * Math.max(1, state.policy.qualities.length) +
        pending.filter((d) => d.verdict === "copy").reduce((a, d) => a + d.file.size, 0),
      ),
      durationMs: report.durationMs,
      // A slice for the panel; the full list is thousands of rows.
      changed: report.entries.filter((e) => e.state === "changed").slice(0, 50),
      sampleNew: report.entries.filter((e) => e.state === "new").slice(0, 25),
    });
  }

  // ---- verify the outputs of a finished run ----
  if (route === "verify" && req.method === "POST") {
    const body = await readBody<{ jobId?: string; limit?: number }>(req);
    const job = body.jobId ? getJob(body.jobId) : undefined;
    if (!job) throw new HttpError(400, "Pass jobId of a finished run.");
    // A running job has files mid-encode, and a paused-then-resumed one holds
    // only the results of its first segment. Either way the report is wrong:
    // in-flight outputs look empty and are reported as failures.
    if (job.state === "running" || job.state === "paused") {
      throw new HttpError(
        409,
        `That job is ${job.state}. Let it finish, then verify.`,
      );
    }
    if (!job.results.length) throw new HttpError(400, "That run produced no files to verify.");

    const magick = requireMagick();
    const report = await verifyOutputs(job.results, magick.path, {
      jobs: 8,
      limit: Math.max(1, Math.min(body.limit ?? 200, 5000)),
    });
    state.verify = report;
    return json({
      checked: report.checked,
      passed: report.passed,
      failed: report.failed,
      dateSurvived: report.dateSurvived,
      durationMs: report.durationMs,
      // Only surface problems by default; the full list can be huge.
      rows: report.rows.filter((r) => !r.ok).slice(0, 200),
    });
  }

  // ---- run manifests / undo ----
  if (route === "manifests" && req.method === "GET") {
    const list = await manifestsFor(state.destination);
    return json({
      manifests: list.map((m) => ({
        id: m.id, createdAt: m.createdAt, summary: m.summary,
        quality: m.quality, destination: m.destination,
      })),
    });
  }

  if (route === "undo" && req.method === "POST") {
    const body = await readBody<{ id: string; dryRun?: boolean }>(req);
    const list = await manifestsFor(state.destination);
    const manifest = list.find((m) => m.id === body.id);
    if (!manifest) throw new HttpError(404, "No such manifest.");
    const result = await undoManifest(manifest, { dryRun: body.dryRun });
    return json(result);
  }

  throw new HttpError(404, `Unknown route: /api/${route}`);
}

/** Adjacent projects, so the redundancy banner can tell you where else a copy lives. */
function projectList(): string[] {
  const base = path.dirname(path.resolve(state.sourceRoot));
  if (!existsSync(base)) return [];
  const { readdirSync } = require("node:fs");
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((d: any) => d.isDirectory() && !/^(\$|System)/i.test(d.name))
      .map((d: any) => path.join(base, d.name))
      .filter((p: string) => pathKey(path.resolve(p)) !== pathKey(path.resolve(state.sourceRoot)))
      .slice(0, 40);
  } catch {
    return [];
  }
}

function hashRel(rel: string): string {
  let h = 0;
  for (let i = 0; i < rel.length; i++) h = (Math.imul(31, h) + rel.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** PowerShell FolderBrowserDialog - gives a real native picker with no extra deps. */
function folderPicker(title: string): Promise<string | null> {
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = '${title.replace(/'/g, "''")}'
$d.ShowNewFolderButton = $true
if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }
$d.Dispose()
`;
  return new Promise((resolve) => {
    const c = spawn("powershell.exe", ["-NoProfile", "-STA", "-Command", ps], {
      windowsHide: true,
    });
    let out = "";
    c.stdout.on("data", (d) => { out += String(d); });
    c.on("error", () => resolve(null));
    c.on("close", () => resolve(out.trim() || null));
  });
}

// --------------------------------------------------------------------------
// Static
// --------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function serveStatic(pathname: string): Promise<Response> {
  if (pathname === "/" || pathname === "") pathname = "/index.html";

  // Preview cache lives beside public/ and holds only generated AVIFs.
  if (pathname.startsWith("/preview-cache/")) {
    const name = path.basename(pathname);
    const file = path.resolve(HERE, "..", ".preview-cache", name);
    try {
      const data = await readFile(file);
      return new Response(data, {
        headers: { "content-type": "image/avif", "cache-control": "no-store" },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  }

  const rel = pathname.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC, rel);
  if (!pathKey(file).startsWith(pathKey(publicRoot()))) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const data = await readFile(file);
    return new Response(data, {
      headers: { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

const publicRoot = () => path.resolve(PUBLIC) + path.sep;

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 5178);

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  idleTimeout: 255,

  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(url.pathname, req, url);
      }
      return await serveStatic(url.pathname);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: (err as Error).message ?? "internal error" }, 500);
    }
  },
});

requestShutdown = () => {
  server.stop(true);
  process.exit(0);
};

// Surface obvious misconfiguration early rather than on the first request.
try {
  state.magick = findMagick();
  console.log(`ImageMagick : ${state.magick.version}`);
  console.log(`AVIF        : ${state.magick.avifMode} ${state.magick.avifWritable ? "writable" : "READ ONLY"}`);
} catch (err) {
  console.error(`WARNING: ${(err as Error).message.split("\n")[0]}`);
}

console.log(`Source      : ${state.sourceRoot}`);
console.log(`Destination : ${state.destination}`);
console.log(`\n  picmagick-gui running at http://127.0.0.1:${server.port}\n`);

if (process.argv.includes("--open")) {
  const target = `http://127.0.0.1:${server.port}`;
  const isWin = process.platform === "win32";
  spawn(
    isWin ? "cmd" : "open",
    isWin ? ["/c", "start", "", target] : [target],
    { windowsHide: true, detached: true, stdio: "ignore" },
  ).unref();
}