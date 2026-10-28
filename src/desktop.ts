/**
 * Electrobun desktop entrypoint.
 *
 * The desktop app is the same server plus a native window: start the loopback
 * listener on a free port, then point a webview at it. Keeping the browser
 * route means every existing API, SSE stream, and relative asset URL works
 * unchanged, and `start.bat` / `start.sh` stay useful for source users.
 *
 * Writable state lives in the per-user data folder because packaged resources
 * are read-only. That covers managed ImageMagick and compare previews.
 */
import { BrowserWindow, PATHS, Utils } from "electrobun/main";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Locate the packaged copy of `public/`.
 *
 * Hutch copies it to `<Resources>/app/public`; the extra candidates keep this
 * working across dev builds and older layouts without guessing a single path.
 */
function findPublicDir(): string {
  const candidates = [
    process.env.PICMAGIK_PUBLIC_DIR,
    path.join(PATHS.RESOURCES_FOLDER, "app", "public"),
    path.join(PATHS.RESOURCES_FOLDER, "public"),
    path.resolve(import.meta.dir, "public"),
    path.resolve(import.meta.dir, "..", "public"),
    path.resolve(import.meta.dir, "..", "..", "public"),
  ].filter((dir): dir is string => Boolean(dir));

  for (const dir of candidates) {
    if (existsSync(path.join(dir, "index.html"))) return dir;
  }

  throw new Error(
    "Could not find the bundled UI files (public/index.html). Looked in:\n  " +
      candidates.join("\n  "),
  );
}

/**
 * Locate pre-bundled ImageMagick inside the packaged app if present.
 */
function findBundledMagickDir(): string | undefined {
  const candidates = [
    process.env.PICMAGIK_BUNDLED_MAGICK_DIR,
    path.join(PATHS.RESOURCES_FOLDER, "app", "imagemagick"),
    path.join(PATHS.RESOURCES_FOLDER, "imagemagick"),
    path.resolve(import.meta.dir, "imagemagick"),
    path.resolve(import.meta.dir, "..", "imagemagick"),
    path.resolve(import.meta.dir, "..", "..", "imagemagick"),
  ].filter((dir): dir is string => Boolean(dir));

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return undefined;
}

/** Per-user writable folder; never inside the installed app bundle. */
function resolveDataDir(): string {
  try {
    return Utils.paths.userData;
  } catch {
    return path.join(Utils.paths.appData, "picmagick-gui");
  }
}

const DATA_DIR = resolveDataDir();
mkdirSync(DATA_DIR, { recursive: true });

// Read by src/appdirs.ts and src/server.ts. Set before the server is imported.
process.env.PICMAGIK_DESKTOP = "1";
process.env.PICMAGIK_DATA_DIR = DATA_DIR;
process.env.PICMAGIK_PUBLIC_DIR = findPublicDir();

const bundledMagick = findBundledMagickDir();
if (bundledMagick) {
  process.env.PICMAGIK_BUNDLED_MAGICK_DIR = bundledMagick;
}

const { startServer } = await import("./server.ts");

const requestedPort = process.env.PORT ? Number(process.env.PORT) : 0;
const { port } = startServer({
  port: Number.isFinite(requestedPort) ? requestedPort : 0,
  open: false,
});

new BrowserWindow({
  title: "PicMagick GUI",
  url: `http://127.0.0.1:${port}/`,
  frame: { width: 1280, height: 860 },
});
