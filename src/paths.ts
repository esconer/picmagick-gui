/**
 * Locating ImageMagick, probing its capabilities, and enforcing the safety
 * invariants that keep this tool from ever touching the originals.
 */
import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { IS_LINUX, IS_WINDOWS, MAGICK_BIN, pathKey } from "./platform.ts";
import { compareVersions, parseVersion } from "./version.ts";

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

export const isAppImage = (p: string): boolean => /\.appimage$/i.test(p);

/**
 * Run a magick binary and retry AppImages with the extract-and-run fallback.
 *
 * AppImages need FUSE, which minimal containers and some distros lack. Setting
 * the fallback in `process.env` after the first successful retry means every
 * later child inherits it; no other call site needs to know about AppImages.
 */
export function runMagickFile(
  exe: string,
  args: string[],
  timeout = 30_000,
  maxBuffer = 8 * 1024 * 1024,
): string {
  const options = { encoding: "utf8" as const, timeout, windowsHide: true, maxBuffer };
  try {
    return execFileSync(exe, args, options);
  } catch (err) {
    if (!isAppImage(exe)) throw err;
    const out = execFileSync(exe, args, {
      ...options,
      env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" },
    });
    process.env.APPIMAGE_EXTRACT_AND_RUN = "1";
    return out;
  }
}

/** AppImages in `imagemagick/`, newest version first. */
function appImageCandidates(root: string): string[] {
  if (!IS_LINUX) return [];
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && isAppImage(e.name))
    .map((e) => path.join(root, e.name))
    .sort((a, b) => {
      const an = path.basename(a);
      const bn = path.basename(b);
      return compareVersions(bn, an) || bn.localeCompare(an);
    });
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
    const target = path.resolve(root, pointer.replace(/^["']|["']$/g, ""));
    // current.txt is app-written, but never let it point outside the folder.
    if (pathKey(target).startsWith(pathKey(root) + path.sep)) {
      out.push(IS_LINUX && isAppImage(target) ? target : path.join(target, MAGICK_BIN));
    }
  }

  out.push(path.join(root, MAGICK_BIN));
  out.push(...appImageCandidates(root));

  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const nested = entries
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, MAGICK_BIN)))
    .map((e) => path.join(root, e.name, MAGICK_BIN))
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

  if (IS_WINDOWS) {
    // 2. A copy dropped beside this project (the original layout).
    for (const rel of [
      `../ImageMagick-7.1.2-33-portable-Q16-x64/${MAGICK_BIN}`,
      `../${MAGICK_BIN}`,
      `./${MAGICK_BIN}`,
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
          out.push(path.join(dir, name, MAGICK_BIN));
        }
      }
    }
    // 4. Standard install locations.
    const pf = process.env["ProgramFiles"];
    const pfx = process.env["ProgramFiles(x86)"];
    if (pf) out.push(path.join(pf, "ImageMagick-7.1.2-Q16-HDRI", MAGICK_BIN));
    if (pf) out.push(path.join(pf, "ImageMagick-7.1.2-Q16", MAGICK_BIN));
    if (pfx) out.push(path.join(pfx, "ImageMagick-7.1.2-Q16-HDRI", MAGICK_BIN));
    // 5. Whatever is on PATH.
    out.push(MAGICK_BIN);
    out.push("magick");
  } else if (IS_LINUX) {
    // 2. Per-user and standard distro locations.
    for (const dir of [
      path.join(homedir(), ".local", "bin"),
      "/usr/local/bin",
      "/usr/bin",
      "/snap/bin",
      "/opt/ImageMagick/bin",
    ]) {
      out.push(path.join(dir, MAGICK_BIN));
    }
    // 3. Whatever is on PATH.
    out.push(MAGICK_BIN);
  } else {
    // Unsupported platform: PATH is the only sensible guess.
    out.push(MAGICK_BIN);
    out.push("magick");
  }

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
  const rejected: string[] = [];

  for (const candidate of tried) {
    const isBare = !path.isAbsolute(candidate);
    if (!isBare && !existsSync(candidate)) continue;

    try {
      const version = runMagickFile(candidate, ["-version"], 20_000);
      const line = version.split(/\r?\n/).find((l) => l.startsWith("Version:"))?.trim() ?? "";
      const parsed = parseVersion(line);
      // Windows previously accepted whatever it found; keep that behaviour.
      // Linux is ImageMagick 7 only, because AVIF encoding needs it.
      if (IS_LINUX && (!parsed || parsed[0] < 7)) {
        rejected.push(`${candidate} (${parsed ? `ImageMagick ${parsed[0]}` : "unknown version"})`);
        continue;
      }

      const formats = runMagickFile(candidate, ["-list", "format"], 30_000);

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

  const older = rejected.length
    ? `\n\nIgnored builds without ImageMagick 7:\n  ${rejected.join("\n  ")}`
    : "";
  if (!IS_WINDOWS) {
    throw new Error(
      "Could not find ImageMagick 7 (magick).\n\n" +
        "Install ImageMagick 7 with AVIF support from your distribution,\n" +
        "or use the Health panel to download the official AppImage.\n" +
        "Looked in:\n  " + tried.join("\n  ") + older,
    );
  }
  throw new Error(
    `Could not find ${MAGICK_BIN}.\n\n` +
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
  const src = pathKey(path.resolve(source));
  const dst = pathKey(path.resolve(destination));

  if (!path.isAbsolute(dst)) {
    throw new Error(`Destination must be an absolute path, got: ${destination}`);
  }
  if (dst === src) {
    throw new Error("Destination cannot be the source folder.");
  }
  if (dst.startsWith(src + path.sep)) {
    throw new Error(
      `Destination "${destination}" is inside the source folder "${source}".\n` +
        `Choose a sibling folder instead, e.g. ${IS_WINDOWS ? "D:\\Photos-avif" : `${source}-avif`}`,
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

  if (!IS_WINDOWS) return null;

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