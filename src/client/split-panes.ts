/**
 * Interactive resizable three-pane split layout with equal-width defaults.
 *
 * Persists customized ratios to localStorage and allows double-clicking or
 * pressing Enter/Home on resizers to reset to the equal 1:1:1 split.
 */
import { $ } from "./dom.ts";

const STORAGE_KEY = "picmagick_pane_ratios";
const MIN_PANE_PX = 220;

export function initSplitPanes(): void {
  const workspace = $("workspace");
  const resizerLib = $("resizerLib");
  const resizerPlan = $("resizerPlan");

  if (!workspace || !resizerLib || !resizerPlan) return;

  const applyRatios = (r1: number, r2: number, r3: number, save = true): void => {
    const sum = r1 + r2 + r3;
    if (sum <= 0) return;
    const n1 = (r1 / sum) * 3;
    const n2 = (r2 / sum) * 3;
    const n3 = (r3 / sum) * 3;

    workspace.style.setProperty("--w-pane-1", `${n1.toFixed(4)}fr`);
    workspace.style.setProperty("--w-pane-2", `${n2.toFixed(4)}fr`);
    workspace.style.setProperty("--w-pane-3", `${n3.toFixed(4)}fr`);

    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([n1, n2, n3]));
      } catch {
        // Ignore storage failures
      }
    }
  };

  const resetToEqual = (): void => {
    workspace.style.removeProperty("--w-pane-1");
    workspace.style.removeProperty("--w-pane-2");
    workspace.style.removeProperty("--w-pane-3");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  // Restore saved ratios if valid
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const [r1, r2, r3] = JSON.parse(saved) as [number, number, number];
      if (
        Number.isFinite(r1) &&
        Number.isFinite(r2) &&
        Number.isFinite(r3) &&
        r1 > 0 &&
        r2 > 0 &&
        r3 > 0
      ) {
        applyRatios(r1, r2, r3, false);
      }
    }
  } catch {
    // Default equal-width in CSS (1fr 1fr 1fr)
  }

  // Double-click to reset to equal width
  resizerLib.addEventListener("dblclick", () => resetToEqual());
  resizerPlan.addEventListener("dblclick", () => resetToEqual());

  // Resizer drag handler
  const setupResizer = (resizer: HTMLElement, which: "left" | "right") => {
    resizer.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const panes = workspace.querySelectorAll<HTMLElement>(":scope > .pane");
      if (panes.length < 3) return;

      const p1 = panes[0];
      const p2 = panes[1];
      const p3 = panes[2];

      const startX = event.clientX;
      const startW1 = p1.getBoundingClientRect().width;
      const startW2 = p2.getBoundingClientRect().width;
      const startW3 = p3.getBoundingClientRect().width;
      const totalW = startW1 + startW2 + startW3;
      if (totalW <= 0) return;

      resizer.classList.add("is-active");
      document.body.classList.add("is-resizing");

      const onPointerMove = (e: PointerEvent) => {
        const dx = e.clientX - startX;

        let w1 = startW1;
        let w2 = startW2;
        let w3 = startW3;

        if (which === "left") {
          const maxW1 = startW1 + startW2 - MIN_PANE_PX;
          w1 = Math.max(MIN_PANE_PX, Math.min(maxW1, startW1 + dx));
          w2 = startW1 + startW2 - w1;
        } else {
          const maxW2 = startW2 + startW3 - MIN_PANE_PX;
          w2 = Math.max(MIN_PANE_PX, Math.min(maxW2, startW2 + dx));
          w3 = startW2 + startW3 - w2;
        }

        applyRatios(w1 / totalW, w2 / totalW, w3 / totalW, false);
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        resizer.classList.remove("is-active");
        document.body.classList.remove("is-resizing");

        const curW1 = p1.getBoundingClientRect().width;
        const curW2 = p2.getBoundingClientRect().width;
        const curW3 = p3.getBoundingClientRect().width;
        const curTotal = curW1 + curW2 + curW3;
        if (curTotal > 0) {
          applyRatios(curW1 / curTotal, curW2 / curTotal, curW3 / curTotal, true);
        }
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    });

    // Keyboard accessibility
    resizer.addEventListener("keydown", (e: KeyboardEvent) => {
      const step = e.shiftKey ? 36 : 14;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const panes = workspace.querySelectorAll<HTMLElement>(":scope > .pane");
        if (panes.length < 3) return;
        const startW1 = panes[0].getBoundingClientRect().width;
        const startW2 = panes[1].getBoundingClientRect().width;
        const startW3 = panes[2].getBoundingClientRect().width;
        const totalW = startW1 + startW2 + startW3;
        if (totalW <= 0) return;
        const dx = e.key === "ArrowRight" ? step : -step;

        let w1 = startW1;
        let w2 = startW2;
        let w3 = startW3;

        if (which === "left") {
          const maxW1 = startW1 + startW2 - MIN_PANE_PX;
          w1 = Math.max(MIN_PANE_PX, Math.min(maxW1, startW1 + dx));
          w2 = startW1 + startW2 - w1;
        } else {
          const maxW2 = startW2 + startW3 - MIN_PANE_PX;
          w2 = Math.max(MIN_PANE_PX, Math.min(maxW2, startW2 + dx));
          w3 = startW2 + startW3 - w2;
        }

        applyRatios(w1 / totalW, w2 / totalW, w3 / totalW, true);
      } else if (e.key === "Enter" || e.key === "Home") {
        e.preventDefault();
        resetToEqual();
      }
    });
  };

  setupResizer(resizerLib, "left");
  setupResizer(resizerPlan, "right");
}
