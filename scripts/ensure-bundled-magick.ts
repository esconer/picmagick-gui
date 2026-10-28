/**
 * Ensure an official portable ImageMagick build exists in `imagemagick/` for bundling.
 * Used during full desktop packaging in CI or local full builds.
 */
import path from "node:path";
import { installLatest } from "../src/imagemagick.ts";
import { findMagick } from "../src/paths.ts";

const MAGICK_DIR = path.resolve(import.meta.dir, "..", "imagemagick");

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
