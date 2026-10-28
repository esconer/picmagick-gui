/**
 * Print the CHANGELOG section for a release tag.
 *
 * GitHub's generated release notes only list merged pull requests, so direct
 * commits (and anything else that never had a PR) would be missing. The release
 * workflow prepends this curated section before the generated PR list.
 *
 * Usage: bun run scripts/release-notes.ts v1.1.0
 */
const requested = process.argv[2]?.trim();
if (!requested) {
  console.error("Usage: bun run scripts/release-notes.ts <tag>");
  process.exit(1);
}

const version = requested.replace(/^v/, "");
const lines = (await Bun.file("CHANGELOG.md").text()).split(/\r?\n/);

const isVersionHeading = (line: string) =>
  line === `## ${version}` || line.startsWith(`## ${version} `);

const start = lines.findIndex(isVersionHeading);
if (start < 0) {
  console.error(`No CHANGELOG section found for ${version}.`);
  process.exit(1);
}

let end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
if (end < 0) end = lines.length;

const section = lines.slice(start, end).join("\n").trim();
if (!section) {
  console.error(`The CHANGELOG section for ${version} is empty.`);
  process.exit(1);
}

console.log(section);
