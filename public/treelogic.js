/**
 * Pure tree logic, kept out of the DOM code so it can be tested directly.
 *
 * Exclusion is prefix-based on purpose: excluding "backup" also excludes
 * everything beneath it, which is what the user means when they tick a parent.
 * Everything here mirrors that rule.
 *
 * Two sets are tracked:
 *   excluded - folders to skip
 *   included - folders forced back in despite an excluded ancestor
 *
 * Include always beats exclude, so a single subfolder can be rescued without
 * giving up the parent's exclusion.
 */

/** Lowercased copy for case-insensitive matching. */
export const excludedLower = (set) => new Set([...set].map((e) => e.toLowerCase()));

/** Does `prefix` cover `rel`, matching only on a path boundary? */
/**
 * @param {string} prefix
 * @param {string} rel
 * @param {string} dir
 */
function covers(prefix, rel, dir) {
  return dir === prefix || dir.startsWith(prefix + "/") || rel.startsWith(prefix + "/");
}

/**
 * True when this folder, or any ancestor of it, is excluded.
 *
 * Two passes on purpose: an explicit include anywhere along the path must win
 * over an exclusion higher up, so all prefixes are checked for include first.
 */
export function isFullyExcluded(rel, ex, inc = new Set()) {
  if (!rel) return false;
  const parts = rel.split("\\");
  const prefixes = [];
  for (let i = 1; i <= parts.length; i++) {
    prefixes.push(parts.slice(0, i).join("\\").toLowerCase());
  }
  for (const p of prefixes) if (inc.has(p)) return false;
  for (const p of prefixes) if (ex.has(p)) return true;
  return false;
}

/** True when a descendant is excluded but this folder itself is not. */
export function hasExcludedDescendant(node, ex, inc = new Set()) {
  if (node.rel && ex.has(node.rel.toLowerCase())) return true;
  return node.children.some((c) => hasExcludedDescendant(c, ex, inc));
}

/**
 * Toggle one folder without disturbing any other choice.
 *
 * The original rebuilt the entire set from a single toggle, so unchecking a
 * second folder silently re-included the first. Only the folder itself is
 * recorded here, never its descendants: exclusion is prefix-based, so the
 * server already covers the whole subtree and the payload stays small.
 *
 * @param nowExcluded true when the folder should be skipped.
 * @returns {{excluded: Set<string>, included: Set<string>}}
 */
export function toggleFolder(tree, excluded, rel, nowExcluded, included = new Set()) {
  const ex = new Set(excluded);
  const inc = new Set(included);
  const key = rel.toLowerCase();

  // "At or below the target": the target itself, or a recorded descendant.
  // Descendants follow the target, so they are cleared in both directions.
  // Ancestors are deliberately NOT in here: excluding a child must never
  // cancel an exclusion the user set on its parent.
  const atOrBelow = (e) => {
    const k = e.toLowerCase();
    return k === key || k.startsWith(key + "\\");
  };
  const ancestorExcluded = [...ex].some((e) => key.startsWith(e.toLowerCase() + "\\"));

  for (const e of [...ex]) if (atOrBelow(e)) ex.delete(e);
  for (const e of [...inc]) if (atOrBelow(e)) inc.delete(e);

  if (nowExcluded) {
    ex.add(rel);
  } else if (ancestorExcluded) {
    // The parent stays excluded, so this needs an explicit include override or
    // the ancestor's prefix match would swallow it.
    inc.add(rel);
  }

  return { excluded: ex, included: inc };
}

/** Every rel in the tree, depth first. */
export function collectRels(node) {
  return node.children.flatMap((c) => [c.rel, ...collectRels(c)]);
}

/** Top-level folder rels only. */
export function topLevelRels(tree) {
  return tree.children.map((c) => c.rel);
}