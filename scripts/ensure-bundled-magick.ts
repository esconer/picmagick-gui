/**
 * Ensure an official portable ImageMagick build exists in `imagemagick/` for bundling.
 * Used during full desktop packaging in CI or local full builds.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { installLatest } from "../src/imagemagick.ts";
import { findMagick } from "../src/paths.ts";

process.env.PICMAGIK_FORCE_BUNDLE = "1";

const MAGICK_DIR = path.resolve(import.meta.dir, "..", "imagemagick");

function getDirSize(dir: string): number {
  let size = 0;
  if (!existsSync(dir)) return 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        size += getDirSize(full);
      } else if (entry.isFile()) {
        size += statSync(full).size;
      }
    } catch {
      // Ignore unreadable entries
    }
  }
  return size;
}

console.log("Checking for ImageMagick in", MAGICK_DIR);

let usable = false;
try {
  const info = findMagick();
  if (info.path && path.resolve(info.path).startsWith(MAGICK_DIR)) {
    console.log(`Found existing ImageMagick ${info.version} at ${info.path}`);
    usable = true;
  }
} catch {
  usable = false;
}

if (!usable) {
  console.log("Downloading latest ImageMagick for bundling...");
  const res = await installLatest();
  console.log(`ImageMagick ${res.version} is ready for bundling at ${res.path}`);
} else {
  console.log("ImageMagick is already present and ready for bundling.");
}

const totalBytes = getDirSize(MAGICK_DIR);
console.log(
  `Bundled ImageMagick directory ready: ${(totalBytes / (1024 * 1024)).toFixed(1)} MB in ${MAGICK_DIR}`,
);
if (existsSync(MAGICK_DIR)) {
  console.log("Contents:", readdirSync(MAGICK_DIR));
}
