/**
 * Budget planning: given a byte ceiling, work out what fits.
 *
 * Folders are ranked by value density (output bytes per source byte) so the
 * advice is "add these", not an arbitrary cut.
 */
import type { Preview } from "./policy.ts";

export type BudgetPlan = {
  budgetBytes: number;
  fits: boolean;
  totalEstBytes: number;
  overBy: number;
  /** Cheapest folders that would need to go to get under the cap. */
  dropSuggestions: {
    rel: string;
    estOutputBytes: number;
    runningTotalAfterDrop: number;
    getsUnderBudget: boolean;
  }[];
  /** Folders that could be added while staying under the cap. */
  addSuggestions: { rel: string; estOutputBytes: number; estAfterAdd: number }[];
  perFolder: {
    rel: string;
    convertCount: number;
    copyCount: number;
    estOutputBytes: number;
    sourceBytes: number;
    /** est output per MB of source read */
    density: number;
    share: number; // fraction of the budget
  }[];
};

export function planBudget(preview: Preview, budgetBytes: number): BudgetPlan {
  const perFolder = preview.byFolder.map((f) => {
    const sourceBytes = f.convertBytes + f.copyBytes;
    const density = sourceBytes > 0 ? (f.estOutputBytes * 1024 * 1024) / sourceBytes : 0;
    return {
      rel: f.rel,
      convertCount: f.convertCount,
      copyCount: f.copyCount,
      estOutputBytes: f.estOutputBytes,
      sourceBytes,
      density,
      share: preview.estOutputBytes > 0 ? f.estOutputBytes / preview.estOutputBytes : 0,
    };
  });

  const total = preview.estOutputBytes;
  const fits = total <= budgetBytes;

  // Drop suggestions: shed folders largest-contribution-first until under cap.
  const dropSuggestions: BudgetPlan["dropSuggestions"] = [];
  if (!fits) {
    let running = total;
    const sorted = [...perFolder].sort((a, b) => b.estOutputBytes - a.estOutputBytes);
    for (const f of sorted) {
      running -= f.estOutputBytes;
      dropSuggestions.push({
        rel: f.rel,
        estOutputBytes: f.estOutputBytes,
        runningTotalAfterDrop: Math.max(0, running),
        getsUnderBudget: running <= budgetBytes,
      });
      if (running <= budgetBytes) break;
    }
  }

  // Add suggestions: folders present in the scan but excluded from this run.
  const included = new Set(preview.byFolder.map((f) => f.rel));
  const addSuggestions: BudgetPlan["addSuggestions"] = [];
  for (const f of perFolder) {
    if (included.has(f.rel)) continue;
    if (total + f.estOutputBytes <= budgetBytes) {
      addSuggestions.push({
        rel: f.rel,
        estOutputBytes: f.estOutputBytes,
        estAfterAdd: total + f.estOutputBytes,
      });
    }
  }

  return {
    budgetBytes,
    fits,
    totalEstBytes: total,
    overBy: Math.max(0, total - budgetBytes),
    dropSuggestions,
    addSuggestions,
    perFolder: perFolder.sort((a, b) => b.estOutputBytes - a.estOutputBytes),
  };
}