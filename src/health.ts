/**
 * Health check: everything that would silently ruin a long run, surfaced up front.
 */
import { stat } from "node:fs/promises";
import { findMagick, freeSpace, type MagickInfo } from "./paths.ts";

export type HealthCheck = {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
};

export type HealthReport = {
  checks: HealthCheck[];
  magick: MagickInfo | null;
  canRun: boolean;
  /** Reused by the preview route instead of probing disk a second time. */
  freeBytes: number | null;
};

export async function runHealthCheck(
  sourceRoot: string,
  destination: string,
  expectedOutputBytes: number,
): Promise<HealthReport> {
  const checks: HealthCheck[] = [];
  let magick: MagickInfo | null = null;

  // --- magick presence and AVIF write support ---
  try {
    magick = findMagick();
    checks.push({ id: "magick", label: "ImageMagick", status: "ok", detail: `${magick.version}` });
  } catch (err) {
    checks.push({
      id: "magick", label: "ImageMagick", status: "fail",
      detail: (err as Error).message.split("\n")[0],
    });
  }

  if (magick) {
    checks.push({
      id: "avif",
      label: "AVIF write support",
      status: magick.avifWritable ? "ok" : "fail",
      detail: magick.avifWritable
        ? `AVIF ${magick.avifMode} via libheif ${magick.libheif ?? "?"}`
        : `AVIF is '${magick.avifMode}' - read only, cannot encode`,
    });
  }

  // --- source readable ---
  try {
    const st = await stat(sourceRoot);
    checks.push({
      id: "source",
      label: "Source readable",
      status: st.isDirectory() ? "ok" : "fail",
      detail: sourceRoot,
    });
  } catch (err) {
    checks.push({
      id: "source", label: "Source readable", status: "fail",
      detail: (err as Error).message,
    });
  }

  // --- destination writable ---
  try {
    const st = await stat(destination);
    if (!st.isDirectory()) throw new Error("not a directory");
    const { access } = await import("node:fs/promises");
    await access(destination, (await import("node:fs")).constants.W_OK);
    checks.push({ id: "dest", label: "Output writable", status: "ok", detail: destination });
  } catch (err) {
    checks.push({
      id: "dest", label: "Output writable", status: "warn",
      detail: `${destination} - will be created (${(err as Error).message.slice(0, 60)})`,
    });
  }

  // --- disk headroom ---
  const free = await freeSpace(destination);
  if (free === null) {
    checks.push({
      id: "disk", label: "Disk space", status: "warn",
      detail: "could not determine free space",
    });
  } else {
    // Copying needs room for the output; encoding writes incrementally so
    // headroom is less critical, but a full disk mid-run corrupts the tail.
    const headroom = free - expectedOutputBytes;
    checks.push({
      id: "disk",
      label: "Disk space",
      status: headroom > 512 * 1024 * 1024 ? "ok" : headroom > 0 ? "warn" : "fail",
      detail: `${(free / 1024 ** 3).toFixed(1)} GB free, need ~${(expectedOutputBytes / 1024 ** 3).toFixed(2)} GB` +
        (headroom > 0 ? ` (${(headroom / 1024 ** 3).toFixed(1)} GB spare)` : " - NOT ENOUGH"),
    });
  }

  const canRun = !checks.some((c) => c.status === "fail");
  return { checks, magick, canRun, freeBytes: free };
}