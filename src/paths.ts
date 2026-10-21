/**
 * Locating magick.exe, probing its capabilities, and enforcing the safety
 * invariants that keep this tool from ever touching the originals.
 */
import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { compareVersions } from "./version.ts";

export const CONVERT_EXTS = [
  "jpg", "jpeg", "jpe", "jfif", "heic", "heif", "png", "bmp", "tif", "tiff", "webp", "gif",
] as const;

export const RAW_EXTS = [
  "arw", "dng", "cr2", "cr3", "nef", "orf", "rw2", "raf", "pef", "srw", "raw",
] as const;

/** Deliberately out of scope: this tool handles still images only. */
export const VIDEO_EXTS = [
  "mp4", "mov", "m4v", "avi", "mkv", "3gp", "mts", "m2ts", "webm", "mpg", "mpeg", "wmv", "flv", "ogv",
] as const;

export const extOf = (p: string) => path.extname(p).replace(/^\./, "").toLowerCase();

export type MagickInfo = {
  path: string;
  version: string;
  /** Raw mode string from `magick -list format`, e.g. "rw+" */
  avifMode: string;
  avifWritable: boolean;
  libheif: string | null;
};

/** Directories that hold no convertible payload - never worth showing as a cost. */
export const JUNK_EXTS = [
  "pcv", "tmp", "appimage", "exe", "url", "lnk", "ini", "db", "sqlite", "thumbs", "db-wal",
] as const;

/** Where the app keeps (or downloads) its own portable ImageMagick. */
export const LOCAL_MAGICK_ROOT = path.resolve(import.meta.dir, "..", "imagemagick");

function readTextSafe(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * Candidates inside `imagemagick/`, best first:
 *   1. the folder named by current.txt (written by the updater),
 *   2. the folder root itself, for anyone who unzipped the archive contents,
 *   3. every versioned subfolder, newest version first.
 *
 * The old behaviour searched beside the project. Keeping this first means an
 * in-project copy wins even if an older portable build sits next to it.
 */
function projectMagickCandidates(): string[] {
  const root = LOCAL_MAGICK_ROOT;
  const out: string[] = [];

  const pointer = readTextSafe(path.join(root, "current.txt"))?.trim();
  if (pointer) {
    const dir = path.resolve(root, pointer.replace(/^["']|["']$/g, ""));
    // current.txt is app-written, but never let it point outside the folder.
    if (dir.toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
      out.push(path.join(dir, "magick.exe"));
    }
  }

  out.push(path.join(root, "magick.exe"));

  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const nested = entries
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, "magick.exe")))
    .map((e) => path.join(root, e.name, "magick.exe"))
    .sort((a, b) => {
      const an = path.basename(path.dirname(a));
      const bn = path.basename(path.dirname(b));
      return compareVersions(bn, an) || bn.localeCompare(an);
    });

  out.push(...nested);
  return out;
}

function candidateMagickPaths(): string[] {
  const here = import.meta.dir;
  const out: string[] = [];

  // 1. The portable build shipped in this project's own imagemagick folder.
  out.push(...projectMagickCandidates());

  // 2. A copy dropped beside this project (the original layout).
  for (const rel of [
    "../ImageMagick-7.1.2-33-portable-Q16-x64/magick.exe",
    "../magick.exe",
    "./magick.exe",
  ]) {
    out.push(path.resolve(here, rel));
  }
  // 3. Anywhere up the tree, so moving the project folder does not break it.
  let dir = here;
  for (let i = 0; i < 4; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    for (const name of readdirSafe(dir)) {
      if (/^ImageMagick.*portable.*x64$/i.test(name)) {
        out.push(path.join(dir, name, "magick.exe"));
      }
    }
  }
  // 4. Standard install locations.
  const pf = process.env["ProgramFiles"];
  const pfx = process.env["ProgramFiles(x86)"];
  if (pf) out.push(path.join(pf, "ImageMagick-7.1.2-Q16-HDRI", "magick.exe"));
  if (pf) out.push(path.join(pf, "ImageMagick-7.1.2-Q16", "magick.exe"));
  if (pfx) out.push(path.join(pfx, "ImageMagick-7.1.2-Q16-HDRI", "magick.exe"));
  // 5. Whatever is on PATH.
  out.push("magick.exe");
  out.push("magick");

  return [...new Set(out)];
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir) as string[];
  } catch {
    return [];
  }
}

export function findMagick(): MagickInfo {
  const tried = candidateMagickPaths();

  for (const candidate of tried) {
    const isBare = !path.isAbsolute(candidate);
    if (!isBare && !existsSync(candidate)) continue;

    try {
      const version = execFileSync(candidate, ["-version"], {
        encoding: "utf8",
        timeout: 20_000,
        windowsHide: true,
      });
      const line = version.split(/\r?\n/).find((l) => l.startsWith("Version:"))?.trim() ?? "";

      const formats = execFileSync(candidate, ["-list", "format"], {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });

      const avifLine = formats
        .split(/\r?\n/)
        .find((l) => /^\s*AVIF\s/.test(l))
        ?.trim();
      const avifMode = avifLine ? (avifLine.split(/\s+/)[1] ?? "") : "";
      // rw+ means read + write + multi-image. Anything without 'w' cannot encode.
      const avifWritable = /w/.test(avifMode);
      const libheif = avifLine?.match(/\((\d+\.\d+\.\d+[^)]*)\)/)?.[1] ?? null;

      return {
        path: candidate,
        // Keep the build and architecture, but not the redundant "ImageMagick"
        // prefix. The UI already labels the row.
        version: line.replace(/^Version:\s*/, "").replace(/^ImageMagick\s+/, ""),
        avifMode,
        avifWritable,
        libheif,
      };
    } catch (err) {
      if (isBare) continue; // not on PATH, keep looking
      continue;
    }
  }

  throw new Error(
    "Could not find magick.exe.\n\n" +
      `Put a portable ImageMagick folder in ${LOCAL_MAGICK_ROOT},\n` +
      "or use the Health panel to download one. A normal install also works.\n" +
      "Looked in:\n  " + tried.join("\n  "),
  );
}

/**
 * Hard invariant #2: the output tree must never live inside the source tree,
 * or the mirror would recurse into its own output forever.
 */
export function assertDestinationSafe(source: string, destination: string): void {
  const src = path.resolve(source).toLowerCase();
  const dst = path.resolve(destination).toLowerCase();

  if (!path.isAbsolute(dst)) {
    throw new Error(`Destination must be an absolute path, got: ${destination}`);
  }
  if (dst === src) {
    throw new Error("Destination cannot be the source folder.");
  }
  if (dst.startsWith(src + path.sep)) {
    throw new Error(
      `Destination "${destination}" is inside the source folder "${source}".\n` +
        `Choose a sibling folder instead, e.g. D:\\Photos-avif`,
    );
  }
}

/**
 * Free bytes on the volume holding `p`.
 *
 * Uses statfs, which is a syscall. The previous PowerShell probe took ~3.6
 * seconds per call on a typical Windows machine, and this runs on every preview and every
 * status request, so it was the entire perceived startup delay.
 */
export async function freeSpace(p: string): Promise<number | null> {
  const { statfs } = await import("node:fs/promises");
  try {
    const s = await statfs(p);
    return Number(s.bsize) * Number(s.bavail);
  } catch {
    // Fall through to the slow path only if the syscall is unavailable.
  }

  try {
    const root = path.parse(path.resolve(p)).root;
    if (!root) return null;
    const ps = `(Get-PSDrive -Name '${root.replace(/[:\\]/g, "")}').Free`;
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { encoding: "utf8", timeout: 20_000, windowsHide: true },
    );
    const n = Number(out.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function ensureDir(p: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(p, { recursive: true });
}

export async function dirExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}