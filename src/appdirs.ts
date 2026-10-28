/**
 * Writable locations for state this app generates.
 *
 * A source checkout keeps everything beside the project, exactly as before.
 * A packaged Electrobun build has read-only resources, so its main process
 * points `PICMAGIK_DATA_DIR` at the per-user data folder before the server is
 * imported. Everything that writes (managed ImageMagick, compare previews)
 * resolves through here instead of guessing from `import.meta.dir`.
 */
import path from "node:path";

/** Project root in a source checkout; the bundle folder in a packaged app. */
const BUNDLE_ROOT = path.resolve(import.meta.dir, "..");

const configured = process.env.PICMAGIK_DATA_DIR?.trim();

/** Root for writable app-owned state. */
export const DATA_ROOT = configured ? path.resolve(configured) : BUNDLE_ROOT;

/** Official portable ImageMagick / AppImage downloads. */
export const MAGICK_DIR = path.join(DATA_ROOT, "imagemagick");

/** Generated quality-comparison previews. Safe to delete at any time. */
export const PREVIEW_CACHE_DIR = path.join(DATA_ROOT, ".preview-cache");

/** Static browser files. The desktop entrypoint overrides this. */
export const PUBLIC_DIR = process.env.PICMAGIK_PUBLIC_DIR?.trim()
  ? path.resolve(process.env.PICMAGIK_PUBLIC_DIR.trim())
  : path.join(BUNDLE_ROOT, "public");
