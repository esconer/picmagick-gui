/**
 * Writable locations for state this app generates.
 *
 * A source checkout keeps everything beside the project, exactly as before.
 * A packaged Electrobun build has read-only resources, so its main process
 * points `COMPAKTA_DATA_DIR` (or `PICMAGIK_DATA_DIR`) at the per-user data folder
 * before the server is imported. Everything that writes (managed ImageMagick,
 * FFmpeg, compare previews) resolves through here instead of guessing from `import.meta.dir`.
 */
import path from "node:path";

/** Project root in a source checkout; the bundle folder in a packaged app. */
const BUNDLE_ROOT = path.resolve(import.meta.dir, "..");

const configured =
  process.env.COMPAKTA_DATA_DIR?.trim() ||
  process.env.PICMAGIK_DATA_DIR?.trim();

/** Root for writable app-owned state. */
export const DATA_ROOT = configured ? path.resolve(configured) : BUNDLE_ROOT;

/** Official portable ImageMagick / AppImage downloads. */
export const MAGICK_DIR = path.join(DATA_ROOT, "imagemagick");

/** Pre-bundled ImageMagick inside the packaged app, if present. */
const bundledMagick =
  process.env.COMPAKTA_BUNDLED_MAGICK_DIR?.trim() ||
  process.env.PICMAGIK_BUNDLED_MAGICK_DIR?.trim();
export const BUNDLED_MAGICK_DIR = bundledMagick
  ? path.resolve(bundledMagick)
  : undefined;

/** Official portable FFmpeg / FFprobe binaries. */
export const FFMPEG_DIR = path.join(DATA_ROOT, "ffmpeg");

/** Pre-bundled FFmpeg inside the packaged app, if present. */
const bundledFfmpeg =
  process.env.COMPAKTA_BUNDLED_FFMPEG_DIR?.trim() ||
  process.env.PICMAGIK_BUNDLED_FFMPEG_DIR?.trim();
export const BUNDLED_FFMPEG_DIR = bundledFfmpeg
  ? path.resolve(bundledFfmpeg)
  : undefined;

/** Generated quality-comparison previews. Safe to delete at any time. */
export const PREVIEW_CACHE_DIR = path.join(DATA_ROOT, ".preview-cache");

/** Static browser files. The desktop entrypoint overrides this. */
const configuredPublic =
  process.env.COMPAKTA_PUBLIC_DIR?.trim() ||
  process.env.PICMAGIK_PUBLIC_DIR?.trim();
export const PUBLIC_DIR = configuredPublic
  ? path.resolve(configuredPublic)
  : path.join(BUNDLE_ROOT, "public");
