import type { ElectrobunConfig } from "electrobun";

/**
 * Desktop packaging. The Bun main process starts the same local server the
 * browser launchers use, then opens a native window at its loopback URL.
 *
 * `app.version` must match package.json and the `v*` tag being released.
 */
export default {
  app: {
    name: "PicMagick GUI",
    identifier: "com.github.esconer.picmagick-gui",
    version: "1.1.0",
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
    copy: {
      public: "public",
    },
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
