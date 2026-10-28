/**
 * Hutch: tasks and the exact Electrobun release used to build the desktop app.
 *
 * Day-to-day source use (`bun start`) does not need Hutch. These tasks are for
 * the packaged desktop build described in README.md → Releasing.
 */
export default {
  packageManager: "bun",
  electrobun: { version: "2.0.5" },
  scripts: {
    install: ["hutch", "install", "--frozen-lockfile"],
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
    "build:canary": ["hutch", "electrobun", "build", "--env=canary"],
  },
};
