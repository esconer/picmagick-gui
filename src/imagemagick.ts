/**
 * ImageMagick portable build management.
 *
 * The app looks for ImageMagick inside `imagemagick/`. This module
 * asks the official GitHub release feed whether a newer portable Q16 build
 * exists and, when the user agrees, downloads and installs it into that folder.
 *
 * Only the latest release from github.com/ImageMagick/ImageMagick is ever
 * fetched. No URL from the browser is trusted, and nothing outside
 * `imagemagick/` is written to.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MagickInfo } from "./paths.ts";
import { compareVersions, isNewerVersion, parseVersion } from "./version.ts";

export const IMAGEMAGICK_ROOT = path.resolve(import.meta.dir, "..", "imagemagick");

const RELEASE_API = "https://api.github.com/repos/ImageMagick/ImageMagick/releases/latest";
const RELEASES_PAGE = "https://github.com/ImageMagick/ImageMagick/releases";
const USER_AGENT = "picmagick-gui-imagemagick-updater";
const CACHE_MS = 10 * 60 * 1000;

export type PortableAsset = {
  name: string;
  size: number;
  url: string;
};

export type LatestRelease = {
  version: string;
  tag: string;
  publishedAt: string;
  pageUrl: string;
  asset: PortableAsset;
};

export type InstallStage =
  | "idle"
  | "downloading"
  | "extracting"
  | "verifying"
  | "installing"
  | "done"
  | "error";

export type InstallProgress = {
  running: boolean;
  stage: InstallStage;
  message: string;
  percent: number;
  version: string | null;
  error: string | null;
};

export type InstalledMagick = {
  version: string;
  path: string;
  avifWritable: boolean;
  libheif: string | null;
};

export type UpdateStatus = {
  installed: InstalledMagick | null;
  installDir: string;
  online: boolean;
  latest: LatestRelease | null;
  /** True when a newer build exists, or when nothing is installed at all. */
  updateAvailable: boolean;
  checkedAt: number | null;
  error: string | null;
  install: InstallProgress;
};

export type InstallResult = {
  version: string;
  path: string;
  folder: string;
  bytes: number;
  replaced: boolean;
};

const port = (arch: string) => (arch === "arm64" ? "arm64" : "x64");

let cached: { at: number; release: LatestRelease } | null = null;

let progress: InstallProgress = {
  running: false,
  stage: "idle",
  message: "",
  percent: 0,
  version: null,
  error: null,
};

export function installProgress(): InstallProgress {
  return { ...progress };
}

/** True only for HTTPS URLs inside ImageMagick's own release downloads. */
export function isTrustedReleaseUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      u.hostname.toLowerCase() === "github.com" &&
      u.pathname.startsWith("/ImageMagick/ImageMagick/releases/download/")
    );
  } catch {
    return false;
  }
}

/**
 * Pick the portable Q16 archive for this CPU. The HDRI variant is deliberately
 * excluded: it ends in `portable-Q16-HDRI-x64.7z`, not the suffix we match.
 */
export function pickPortableAsset(
  assets: Array<{ name?: unknown; size?: unknown; browser_download_url?: unknown }>,
  arch = port(process.arch),
): PortableAsset | null {
  const suffix = `-portable-Q16-${arch}.7z`;
  for (const a of assets) {
    if (typeof a.name !== "string" || typeof a.browser_download_url !== "string") continue;
    if (!a.name.startsWith("ImageMagick-") || !a.name.endsWith(suffix)) continue;
    return {
      name: a.name,
      size: Number(a.size) || 0,
      url: a.browser_download_url,
    };
  }
  return null;
}

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Ask GitHub for the latest release. Cached for 10 minutes unless forced. */
export async function fetchLatestRelease(force = false): Promise<LatestRelease> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.release;

  let res: Response;
  try {
    res = await fetch(RELEASE_API, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(`No internet connection to github.com (${errorText(err)}).`);
  }

  if (!res.ok) {
    throw new Error(`GitHub release check failed: HTTP ${res.status} ${res.statusText}.`);
  }

  let data: {
    tag_name?: unknown;
    html_url?: unknown;
    published_at?: unknown;
    assets?: unknown;
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new Error("GitHub returned an unreadable release response.");
  }

  const tag = String(data.tag_name ?? "").trim();
  const version = tag.replace(/^v/i, "");
  if (!parseVersion(version)) {
    throw new Error("GitHub returned a release without a recognisable version.");
  }

  const assets = Array.isArray(data.assets) ? data.assets : [];
  const asset = pickPortableAsset(
    assets as Array<{ name?: unknown; size?: unknown; browser_download_url?: unknown }>,
  );
  if (!asset) {
    throw new Error(`Release ${version} has no portable Q16 build for this CPU (${port(process.arch)}).`);
  }
  if (!isTrustedReleaseUrl(asset.url)) {
    throw new Error("Release asset URL is not on github.com; refusing to use it.");
  }

  const release: LatestRelease = {
    version,
    tag,
    publishedAt: String(data.published_at ?? ""),
    pageUrl: String(data.html_url ?? RELEASES_PAGE),
    asset,
  };
  cached = { at: Date.now(), release };
  return release;
}

/**
 * Compare the installed build against the newest GitHub release. Network
 * failures are reported rather than thrown, so the UI can keep working offline.
 */
export async function checkForUpdate(opts: {
  current: MagickInfo | null;
  force?: boolean;
}): Promise<UpdateStatus> {
  const installed: InstalledMagick | null = opts.current
    ? {
        version: opts.current.version,
        path: opts.current.path,
        avifWritable: opts.current.avifWritable,
        libheif: opts.current.libheif,
      }
    : null;

  let latest: LatestRelease | null = null;
  let online = false;
  let error: string | null = null;

  try {
    latest = await fetchLatestRelease(Boolean(opts.force));
    online = true;
  } catch (err) {
    error = errorText(err);
    // A stale cached release is still useful: show it, but mark the check as
    // offline so the user knows it may not be current.
    if (cached) latest = cached.release;
  }

  return {
    installed,
    installDir: IMAGEMAGICK_ROOT,
    online,
    latest,
    updateAvailable: Boolean(
      latest && (!installed || isNewerVersion(latest.version, installed.version)),
    ),
    checkedAt: online ? Date.now() : (cached?.at ?? null),
    error,
    install: installProgress(),
  };
}

/**
 * Download and install the latest portable build into
 * `imagemagick/ImageMagick-<version>-portable-Q16-<arch>/`.
 *
 * The archive is unpacked into a staging folder and its `magick.exe` is run and
 * checked for AVIF write support before anything replaces the current install.
 */
export async function installLatest(): Promise<InstallResult> {
  if (progress.running) throw new Error("An ImageMagick download is already in progress.");

  // Claim the lock before the first await so two simultaneous requests cannot
  // both start downloading.
  progress = {
    running: true,
    stage: "downloading",
    message: "Checking for the latest ImageMagick release…",
    percent: 0,
    version: null,
    error: null,
  };

  let release: LatestRelease;
  let arch: string;
  try {
    release = await fetchLatestRelease(true);
    arch = port(process.arch);
    if (!isTrustedReleaseUrl(release.asset.url)) {
      throw new Error("Refusing to download ImageMagick from an untrusted URL.");
    }
  } catch (err) {
    progress = {
      running: false,
      stage: "error",
      message: "ImageMagick install failed.",
      percent: 0,
      version: null,
      error: errorText(err),
    };
    throw err instanceof Error ? err : new Error(errorText(err));
  }

  const folderName = `ImageMagick-${release.version}-portable-Q16-${arch}`;
  const finalDir = path.join(IMAGEMAGICK_ROOT, folderName);
  const stamp = `${process.pid}-${Date.now()}`;
  const staging = path.join(IMAGEMAGICK_ROOT, `.staging-${release.version}-${stamp}`);
  const archive = path.join(IMAGEMAGICK_ROOT, `.download-${release.version}-${stamp}.7z`);

  // A copy the user unzipped by hand may already be the right version. Verify
  // it and use it rather than replacing a folder the app did not create.
  const existingExe = path.join(finalDir, "magick.exe");
  if (existsSync(existingExe)) {
    let usable = false;
    try {
      verifyStagedMagick(existingExe, release.version);
      usable = true;
    } catch {
      // Not a usable build. Continue and replace it after downloading.
    }
    if (usable) {
      try {
        await writeFile(path.join(IMAGEMAGICK_ROOT, "current.txt"), `${folderName}\n`, "utf8");
      } catch (err) {
        console.warn(`ImageMagick is installed, but current.txt was not written: ${errorText(err)}`);
      }
      progress = {
        running: false,
        stage: "done",
        message: `ImageMagick ${release.version} is already installed.`,
        percent: 100,
        version: release.version,
        error: null,
      };
      return {
        version: release.version,
        path: existingExe,
        folder: finalDir,
        bytes: 0,
        replaced: false,
      };
    }
  }

  progress = {
    running: true,
    stage: "downloading",
    message: `Downloading ImageMagick ${release.version}…`,
    percent: 0,
    version: release.version,
    error: null,
  };

  try {
    await mkdir(IMAGEMAGICK_ROOT, { recursive: true });
    await mkdir(staging, { recursive: true });

    const bytes = await downloadAsset(release.asset, archive, (percent) => {
      progress = {
        ...progress,
        stage: "downloading",
        percent,
        message: `Downloading ImageMagick ${release.version}… ${percent}%`,
      };
    });

    progress = { ...progress, stage: "extracting", message: "Extracting the portable build…", percent: 100 };
    extractArchive(archive, staging);

    const extractedRoot = await findExtractedRoot(staging);
    progress = { ...progress, stage: "verifying", message: "Verifying magick.exe and AVIF support…" };
    verifyStagedMagick(path.join(extractedRoot, "magick.exe"), release.version);

    progress = { ...progress, stage: "installing", message: `Installing into imagemagick\\${folderName}…` };
    const backup = await swapIntoPlace(extractedRoot, finalDir);

    try {
      await writeFile(path.join(finalDir, ".picmagik-managed"), `${release.version}\n`, "utf8");
      await writeFile(path.join(IMAGEMAGICK_ROOT, "current.txt"), `${folderName}\n`, "utf8");
    } catch (err) {
      // The build is usable even if the pointer file cannot be written; the
      // versioned folder is still discovered by name.
      if (backup) await rm(backup, { recursive: true, force: true }).catch(() => {});
      console.warn(`ImageMagick installed, but its pointer file was not written: ${errorText(err)}`);
    }

    if (backup) await rm(backup, { recursive: true, force: true }).catch(() => {});
    await pruneManagedVersions(folderName);

    progress = {
      running: false,
      stage: "done",
      message: `ImageMagick ${release.version} installed.`,
      percent: 100,
      version: release.version,
      error: null,
    };
    return {
      version: release.version,
      path: path.join(finalDir, "magick.exe"),
      folder: finalDir,
      bytes,
      replaced: Boolean(backup),
    };
  } catch (err) {
    const message = errorText(err);
    progress = {
      ...progress,
      running: false,
      stage: "error",
      message: "ImageMagick install failed.",
      error: message,
    };
    throw new Error(message);
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    await rm(archive, { force: true }).catch(() => {});
  }
}

async function downloadAsset(
  asset: PortableAsset,
  dest: string,
  onPercent: (percent: number) => void,
): Promise<number> {
  let res: Response;
  try {
    res = await fetch(asset.url, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "application/octet-stream" },
      // Large enough for a slow connection: the archive is ~12 MB.
      signal: AbortSignal.timeout(5 * 60_000),
    });
  } catch (err) {
    throw new Error(`Download failed (${errorText(err)}).`);
  }
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}.`);
  }

  const total = Number(res.headers.get("content-length")) || asset.size;
  const sink = Bun.file(dest).writer();
  const reader = res.body.getReader();
  let received = 0;
  let lastPercent = -1;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      await sink.write(value);
      received += value.byteLength;
      const percent = total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : 0;
      if (percent !== lastPercent) {
        lastPercent = percent;
        onPercent(percent);
      }
    }
    await sink.end();
  } catch (err) {
    try { await sink.end(); } catch { /* already failing */ }
    throw new Error(`Download was interrupted (${errorText(err)}).`);
  }

  if (received < 1024) throw new Error("The downloaded archive was empty.");
  if (asset.size > 0 && received !== asset.size) {
    throw new Error(`Download was incomplete: got ${received} of ${asset.size} bytes.`);
  }
  onPercent(100);
  return received;
}

/** Windows ships bsdtar, which reads 7z. Fall back to 7-Zip if it is installed. */
function extractionCommands(archive: string, dest: string): Array<{ cmd: string; args: string[] }> {
  const out: Array<{ cmd: string; args: string[] }> = [];
  if (process.env.SEVEN_ZIP) {
    out.push({ cmd: process.env.SEVEN_ZIP, args: ["x", "-y", `-o${dest}`, archive] });
  }
  for (const base of [process.env["ProgramFiles"], process.env["ProgramFiles(x86)"]]) {
    if (base) {
      out.push({ cmd: path.join(base, "7-Zip", "7z.exe"), args: ["x", "-y", `-o${dest}`, archive] });
    }
  }
  out.push({ cmd: "7z.exe", args: ["x", "-y", `-o${dest}`, archive] });
  out.push({ cmd: "7za.exe", args: ["x", "-y", `-o${dest}`, archive] });

  if (process.platform === "win32") {
    const sys = process.env.SystemRoot ?? "C:\\Windows";
    out.push({
      cmd: path.join(sys, "System32", "tar.exe"),
      args: ["-xf", archive, "-C", dest],
    });
  } else {
    out.push({ cmd: "tar", args: ["-xf", archive, "-C", dest] });
  }
  return out;
}

function extractArchive(archive: string, dest: string): void {
  let lastError = "";
  for (const { cmd, args } of extractionCommands(archive, dest)) {
    try {
      execFileSync(cmd, args, {
        stdio: ["ignore", "ignore", "pipe"],
        timeout: 5 * 60_000,
        windowsHide: true,
      });
      return;
    } catch (err) {
      const e = err as { stderr?: Buffer | string; message?: string };
      lastError = String(e.stderr ?? e.message ?? "unknown extraction error").trim();
    }
  }
  throw new Error(
    `Could not extract the ImageMagick archive (${lastError.slice(0, 220)}). ` +
      "Windows 10+ includes tar.exe; installing 7-Zip also works.",
  );
}

async function findExtractedRoot(staging: string): Promise<string> {
  if (existsSync(path.join(staging, "magick.exe"))) return staging;
  let entries;
  try {
    entries = await readdir(staging, { withFileTypes: true });
  } catch {
    throw new Error("The download could not be read.");
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(staging, entry.name);
    if (existsSync(path.join(dir, "magick.exe"))) return dir;
  }
  throw new Error("The downloaded archive did not contain magick.exe.");
}

/** Run the staged binary before trusting it. A wrong download must not install. */
function verifyStagedMagick(exe: string, expected: string): void {
  let versionOut: string;
  let formats: string;
  try {
    versionOut = execFileSync(exe, ["-version"], {
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    });
    formats = execFileSync(exe, ["-list", "format"], {
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(`The downloaded magick.exe did not run (${errorText(err)}).`);
  }

  const reported = versionOut.split(/\r?\n/).find((l) => l.startsWith("Version:")) ?? versionOut;
  const parsed = parseVersion(reported);
  if (!parsed || compareVersions(parsed, expected) !== 0) {
    throw new Error(`Downloaded build reports "${reported.trim()}", expected ${expected}.`);
  }

  const avifLine = formats.split(/\r?\n/).find((l) => /^\s*AVIF\s/.test(l));
  const mode = avifLine?.trim().split(/\s+/)[1] ?? "";
  if (!/w/.test(mode)) {
    throw new Error(`The downloaded build cannot write AVIF (AVIF mode "${mode || "missing"}").`);
  }
}

/** Move the staged folder into place, keeping the old one until this succeeds. */
async function swapIntoPlace(sourceDir: string, finalDir: string): Promise<string | null> {
  let backup: string | null = null;
  if (existsSync(finalDir)) {
    backup = `${finalDir}.old-${Date.now()}`;
    await rename(finalDir, backup);
  }
  try {
    await rename(sourceDir, finalDir);
  } catch (err) {
    if (backup) await rename(backup, finalDir).catch(() => {});
    throw err;
  }
  return backup;
}

/** Delete older installs this app created. Hand-placed folders are left alone. */
async function pruneManagedVersions(keep: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(IMAGEMAGICK_ROOT, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === keep) continue;
    const full = path.join(IMAGEMAGICK_ROOT, entry.name);
    const ours = existsSync(path.join(full, ".picmagik-managed"));
    const staleBackup = /^ImageMagick-.+\.old-\d+$/.test(entry.name);
    if (!ours && !staleBackup) continue;
    await rm(full, { recursive: true, force: true }).catch(() => {});
  }
}
