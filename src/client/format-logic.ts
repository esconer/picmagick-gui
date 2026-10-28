/**
 * Pure destination-path helpers, kept out of app.js so they can be tested
 * directly from src/format.check.ts.
 */

/**
 * Remove trailing path separators without destroying a filesystem root.
 * "C:\" must stay "C:\", not become "C:".
 * @param {string} p
 * @returns {string}
 */
export function stripTrailingSeparators(p: string): string {
  const s = String(p);
  if (s === "/" || s === "\\" || /^[A-Za-z]:[\\/]$/.test(s)) return s;
  return s.replace(/[\\/]+$/, "");
}

/**
 * The default destination for a source folder and output suffix.
 * @param {string} source
 * @param {string} suffix
 * @returns {string}
 */
export function defaultDestination(source: string, suffix: string): string {
  return `${stripTrailingSeparators(source)}-${suffix}`;
}

/**
 * Follow a format change only when the current destination is still the old
 * format's default. A custom destination is never rewritten.
 * @param {string} current
 * @param {string} source
 * @param {string} oldSuffix
 * @param {string} newSuffix
 * @param {boolean} caseInsensitive
 * @returns {string}
 */
export function nextDestinationOnFormatChange(
  current: string,
  source: string,
  oldSuffix: string,
  newSuffix: string,
  caseInsensitive: boolean,
): string {
  if (!current) return current;

  const fold = (p: string): string => {
    const s = stripTrailingSeparators(p);
    return caseInsensitive ? s.toLowerCase() : s;
  };

  return fold(current) === fold(defaultDestination(source, oldSuffix))
    ? defaultDestination(source, newSuffix)
    : current;
}
