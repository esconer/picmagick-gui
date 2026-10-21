/**
 * The magick.exe worker pool.
 *
 * Hard invariant #1 lives here: the source tree is opened read-only and never
 * written to. Every write goes through outputPathFor() into the destination.
 */
import { spawn } from "node:child_process";
import { copyFile, mkdir, stat, rm } from "node:fs/promises";
import path from "node:path";
import type { Decision } from "./policy.ts";
import { outputPathFor, type Policy } from "./policy.ts";

export type FileStatus = "converted" | "copied" | "skipped" | "failed" | "cancelled";

export type FileResult = {
  rel: string;
  src: string;
  out: string | null;
  status: FileStatus;
  seconds: number;
  inBytes: number;
  outBytes: number;
  error?: string;
  /** Qualities that failed even though others succeeded. */
  partialErrors?: string[];
};

export type RunOptions = {
  sourceRoot: string;
  destination: string;
  magickPath: string;
  policy: Policy;
  jobs: number;
  /**
   * Live parallel-job count. Read before every dispatch so the user can change
   * it mid-run; falls back to the start value if not supplied.
   */
  getLimit?: () => number;
  overwrite: boolean;
  signal: AbortSignal;
  onStart: (rel: string, bytes: number) => void;
  onResult: (r: FileResult) => void;
};

const MB = 1024 * 1024;

function runMagick(
  exe: string,
  args: string[],
  signal: AbortSignal,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      env: { ...process.env, MAGICK_THREAD_LIMIT: "1" },
    });

    let stderr = "";
    child.stderr.on("data", (d) => {
      if (stderr.length < 8000) stderr += String(d);
    });

    const onAbort = () => {
      try { child.kill(); } catch { /* already gone */ }
    };
    signal.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      resolve({ code: -1, stderr: String(err.message ?? err) });
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

async function processOne(d: Decision, o: RunOptions): Promise<FileResult> {
  const started = Date.now();
  const src = d.file.abs;
  // Where this file's output would land, so a killed encode can be cleaned up.
  const expectedOut = outputPathFor(d, o.sourceRoot, o.destination, o.policy);

  // Tell the UI this file is now in flight. A single AV1 encode can run for
  // many seconds, and without this the progress bar sits at zero with no
  // indication anything is happening.
  o.onStart(d.file.rel, d.file.size);

  const base: FileResult = {
    rel: d.file.rel,
    src,
    out: null,
    status: "failed",
    seconds: 0,
    inBytes: d.file.size,
    outBytes: 0,
  };

  if (o.signal.aborted) return { ...base, status: "cancelled", seconds: 0 };

  try {
    if (d.verdict === "copy") {
      const out = outputPathFor(d, o.sourceRoot, o.destination, o.policy);
      if (!(await overwriteOk(out, o.overwrite))) {
        return { ...base, out, status: "skipped", seconds: (Date.now() - started) / 1000 };
      }
      await mkdir(path.dirname(out), { recursive: true });
      await copyFile(src, out);
      const st = await stat(out);
      return {
        ...base, out, status: "copied",
        seconds: (Date.now() - started) / 1000, outBytes: st.size,
      };
    }

    // ---- convert ----
    const multi = o.policy.qualities.length > 1;
    let totalOut = 0;
    let anyWritten = false;
    let primaryOut: string | null = null;
    let lastErr = "";

    for (const q of o.policy.qualities) {
      const out = outputPathFor(d, o.sourceRoot, o.destination, o.policy, q);

      if (!(await overwriteOk(out, o.overwrite))) continue;

      await mkdir(path.dirname(out), { recursive: true });

      // Multi-frame sources become animated AVIF as-is. Only -flattenGif
      // selects frame 0, which discards the animation.
      const srcArg =
        o.policy.flattenGif && d.file.ext === "gif" ? `${src}[0]` : src;

      const args = [
        srcArg,
        "-auto-orient",
        "-colorspace", "sRGB",
        "-quality", String(q),
        "-define", `heic:speed=${o.policy.heicSpeed}`,
        `AVIF:${out}`,
      ];

      const { code, stderr } = await runMagick(o.magickPath, args, o.signal);

      if (code !== 0) {
        lastErr = stderr.trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 200);
        continue;
      }

      try {
        const st = await stat(out);
        // aom exits 0 and writes a zero-byte file at heic:speed 10, so exit
        // code alone is not proof of success.
        if (st.size === 0) {
          lastErr = lastErr || "encoder wrote an empty file";
          continue;
        }
        totalOut += st.size;
        anyWritten = true;
        if (!primaryOut) primaryOut = out;
      } catch {
        lastErr = "encoder reported success but produced no file";
      }
    }

    const seconds = (Date.now() - started) / 1000;

    if (anyWritten) {
      // A multi-quality run can half-succeed. Say which variants are missing
      // rather than reporting a clean "converted".
      const partialErrors = lastErr ? [lastErr] : undefined;
      return {
        ...base, out: primaryOut, status: "converted", seconds,
        outBytes: totalOut, partialErrors,
      };
    }
    if (lastErr) {
      return { ...base, status: "failed", seconds, error: lastErr || "unknown error" };
    }
    // Everything was already on disk and overwrite was off.
    return { ...base, status: "skipped", seconds };
  } catch (err) {
    return {
      ...base,
      status: "failed",
      seconds: (Date.now() - started) / 1000,
      error: (err as Error).message,
    };
  } finally {
    // If we were killed mid-encode, a truncated output may be sitting on disk.
    // Left alone, the skip-existing check would treat that as finished forever,
    // so a later resume would silently skip the file.
    if (o.signal.aborted) {
      for (const q of o.policy.qualities) {
        const partial = outputPathFor(d, o.sourceRoot, o.destination, o.policy, q);
        try {
          const st = await stat(partial);
          // Only remove it if this run did not already finish writing it.
          if (st.size === 0 || (base.outBytes === 0 && partial !== base.out)) {
            await rm(partial, { force: true });
          }
        } catch { /* nothing there */ }
      }
    }
  }
}

async function overwriteOk(out: string, overwrite: boolean): Promise<boolean> {
  if (overwrite) return true;
  try {
    await stat(out);
    return false; // already exists
  } catch {
    return true; // free
  }
}

/**
 * Runs `work` with at most `getLimit()` in flight.
 *
 * The limit is read before every dispatch rather than captured once, so the
 * parallel-job slider can be moved mid-run. Raising it starts work immediately;
 * lowering it stops new work from being handed out and lets the in-flight
 * encodes finish, so nothing is left half-written.
 *
 * `shouldStop` is checked the same way, between items. That is what makes
 * pause safe: work already in flight is allowed to land on disk rather than
 * being killed mid-encode and leaving a truncated file that the skip-existing
 * check would then treat as complete forever.
 */
export async function runPool<T>(
  items: T[],
  signal: AbortSignal,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean = () => false,
  getLimit: () => number = () => 1,
): Promise<void> {
  let cursor = 0;
  const inFlight = new Set<Promise<unknown>>();

  const dispatch = () => {
    const limit = Math.max(1, Math.min(getLimit(), items.length));
    while (
      inFlight.size < limit &&
      cursor < items.length &&
      !shouldStop() &&
      !signal.aborted
    ) {
      const i = cursor++;
      const p = worker(items[i], i)
        .catch(() => { /* per-item failures are reported by the worker */ })
        .finally(() => { inFlight.delete(p); });
      inFlight.add(p);
    }
  };

  dispatch();
  while (inFlight.size > 0) {
    await Promise.race(inFlight);
    dispatch();
  }
}

export type ConversionSummary = {
  results: FileResult[];
  ok: number;
  failed: number;
  skipped: number;
  copied: number;
  bytes: number;
  seconds: number;
  /** True when the pool stopped early because of pause or cancel. */
  stoppedEarly: boolean;
  /** Results carrying a partial-quality error. */
  partial: number;
};

export async function runConversion(
  decisions: Decision[],
  options: RunOptions,
  shouldStop?: () => boolean,
): Promise<ConversionSummary> {
  const results: FileResult[] = [];
  const began = Date.now();
  await mkdir(options.destination, { recursive: true });

  await runPool(
    decisions, options.signal,
    async (d) => {
      const r = await processOne(d, options);
      results.push(r);
      options.onResult(r);
    },
    shouldStop,
    options.getLimit,
  );

  return {
    results,
    ok: results.filter((r) => r.status === "converted").length,
    copied: results.filter((r) => r.status === "copied").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    partial: results.filter((r) => r.partialErrors?.length).length,
    bytes: results.reduce((a, r) => a + r.outBytes, 0),
    seconds: (Date.now() - began) / 1000,
    stoppedEarly: (shouldStop?.() ?? false) || options.signal.aborted,
  };
}

export const formatBytes = (n: number): string => {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + " GB";
  if (n >= MB) return (n / MB).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
  return n + " B";
};