/**
 * Build the full desktop app with ImageMagick bundled into the package.
 */
import { spawnSync } from "node:child_process";

// 1. Ensure ImageMagick is present in imagemagick/
const ensure = spawnSync("bun", ["run", "scripts/ensure-bundled-magick.ts"], {
  stdio: "inherit",
});
if (ensure.status !== 0) {
  process.exit(ensure.status ?? 1);
}

// 2. Build with PICMAGIK_FLAVOR=full
const build = spawnSync("bun", ["run", "desktop:build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PICMAGIK_FLAVOR: "full",
  },
});

process.exit(build.status ?? 0);
