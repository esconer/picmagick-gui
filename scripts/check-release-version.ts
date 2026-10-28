/**
 * Guard the release build: the git tag, package.json, and the Electrobun app
 * version must all agree. Run by .github/workflows/release.yml.
 *
 * `GITHUB_REF_NAME` is set by Actions. Without a tag (manual dispatch or a
 * local run) the versions are only reported, not enforced.
 */
import pkg from "../package.json";
import config from "../electrobun.config.ts";

const tag = process.env.GITHUB_REF_NAME?.replace(/^v/, "");
const packageVersion = pkg.version;
const appVersion = config.app.version;

if (!tag) {
  console.log(`No tag to check (package.json ${packageVersion}, app ${appVersion}).`);
  process.exit(0);
}

if (tag !== packageVersion || tag !== appVersion) {
  console.error(
    `Version mismatch: tag=${tag} package.json=${packageVersion} ` +
      `electrobun.config.ts=${appVersion}`,
  );
  process.exit(1);
}

console.log(`Release version ${tag} matches package.json and electrobun.config.ts.`);
