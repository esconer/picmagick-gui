/**
 * Guard the release build: package.json and the Electrobun app version must
 * always agree, and when a `v*` tag is being built the tag must match too.
 * Run by CI and .github/workflows/release.yml.
 *
 * Actions sets `GITHUB_REF_TYPE` and `GITHUB_REF`; a branch build (or a local
 * run without them) skips the tag comparison.
 */
import pkg from "../package.json";
import config from "../electrobun.config.ts";

const isTag =
  process.env.GITHUB_REF_TYPE === "tag" ||
  process.env.GITHUB_REF?.startsWith("refs/tags/");
const tag = isTag ? process.env.GITHUB_REF_NAME?.replace(/^v/, "") : undefined;
const packageVersion = pkg.version;
const appVersion = config.app.version;

if (packageVersion !== appVersion) {
  console.error(
    `Version mismatch: package.json=${packageVersion} ` +
      `electrobun.config.ts=${appVersion}`,
  );
  process.exit(1);
}

if (!tag) {
  console.log(`Versions agree at ${packageVersion} (no release tag to check).`);
  process.exit(0);
}

if (tag !== packageVersion) {
  console.error(
    `Version mismatch: tag=${tag} package.json=${packageVersion} ` +
      `electrobun.config.ts=${appVersion}`,
  );
  process.exit(1);
}

console.log(`Release version ${tag} matches package.json and electrobun.config.ts.`);
