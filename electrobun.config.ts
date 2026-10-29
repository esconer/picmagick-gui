import type { ElectrobunConfig } from "electrobun";

const isFull = process.env.PICMAGIK_FLAVOR === "full";
const copy: Record<string, string> = {
  public: "public",
};

if (isFull) {
  copy.imagemagick = "imagemagick";
}

/**
 * Desktop packaging. The Bun main process starts the same local server the
 * browser launchers use, then opens a native window at its loopback URL.
 *
 * `app.version` must match package.json and the `v*` tag being released.
 */
export default {
  app: {
    name: isFull ? "PicMagick GUI Full" : "PicMagick GUI",
    identifier: isFull
      ? "com.github.esconer.picmagick-gui-full"
      : "com.github.esconer.picmagick-gui",
    version: "1.2.1",
    description:
      "Local GUI for converting a photo library to JXL, AVIF, WebP, HEIC, JPEG 2000, JPEG, or PNG.",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/desktop.ts",
      sourcemap: "linked",
    },
    // The server reads these files at runtime; they must travel with the app.
    copy,
    win: {
      icon: "assets/icon.ico",
    },
    linux: {
      icon: "assets/icon.png",
    },
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  // Installers are published on GitHub Releases. No update host is configured,
  // so there is no previous release for Hutch to diff against.
  release: {
    generatePatch: false,
  },
} satisfies ElectrobunConfig;
