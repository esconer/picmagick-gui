/**
 * Full-screen Compare view.
 *
 * The server renders variants at the format's recommended quality ladder. The
 * view is deliberately read-only: choosing a quality only writes the recipe,
 * never the source. Split, side-by-side, and toggle modes share one stage.
 */
import { $, escapeHtml, fmt } from "../dom";
import { state } from "../state";
import type { CompareResponse, CompareVariant } from "../types";
import type { ViewActions } from "./shared";
import { emptyState } from "./shared";

export type CompareViewController = {
  open: (rel?: string) => void;
  close: () => void;
  handleKey: (event: KeyboardEvent) => boolean;
};

export function createCompareView(actions: ViewActions): CompareViewController {
  let split = 50;
  let dimensions: { width: number; height: number } | null = null;
  let busy = false;

  const fileList = () => actions.selectedFiles();

  const syncFileSelect = (rel: string | null): void => {
    const select = $<HTMLSelectElement>("compareFileSelect");
    const files = fileList();
    select.innerHTML = files
      .map((f) => `<option value="${escapeHtml(f.rel)}"${f.rel === rel ? " selected" : ""}>${escapeHtml(f.rel)}</option>`)
      .join("");
  };

  const renderFacts = (data: CompareResponse, variant: CompareVariant | undefined): void => {
    const rows: string[] = [];
    rows.push(`<div class="fact-row"><span>Original</span><span>${fmt(data.originalBytes)}</span></div>`);
    if (variant) {
      rows.push(`<div class="fact-row"><span>${escapeHtml(variant.label)}</span><span>${fmt(variant.bytes)}</span></div>`);
      const saving = data.originalBytes > 0 ? 100 - (variant.bytes / data.originalBytes) * 100 : 0;
      rows.push(`<div class="fact-row"><span>Change</span><span style="color:var(--status-${saving >= 0 ? "success" : "danger"})">${saving >= 0 ? "−" : "+"}${Math.abs(saving).toFixed(0)}%</span></div>`);
    }
    if (dimensions) {
      rows.push(`<div class="fact-row"><span>Dimensions</span><span>${dimensions.width} × ${dimensions.height}</span></div>`);
    }
    rows.push(`<div class="fact-row"><span>Format</span><span>${escapeHtml(data.formatLabel)}</span></div>`);
    $("compareFacts").innerHTML = rows.join("");
  };

  const renderLadder = (data: CompareResponse): void => {
    const max = Math.max(1, ...data.variants.map((v) => v.bytes));
    const host = $("compareLadder");
    host.innerHTML = data.variants
      .map((variant, index) => {
        const active = index === state.compareVariant;
        return `<div class="ladder-item"${active ? ' data-active="true"' : ""}>
          <span class="ladder-label">${escapeHtml(variant.label)}</span>
          <span class="ladder-bytes">${fmt(variant.bytes)}</span>
          <button class="btn link sm" type="button" data-use-quality="${variant.quality}" data-variant-index="${index}">Use</button>
          <div class="meter ladder-meter" style="grid-column:1/-1;height:3px"><div style="transform:scaleX(${(variant.bytes / max).toFixed(4)})"></div></div>
        </div>`;
      })
      .join("");
  };

  const renderStage = (): void => {
    const data = state.compare;
    const stage = $("compareStage");
    if (!data || !data.variants.length) {
      stage.classList.add("hidden");
      $("compareRail").classList.add("hidden");
      $("compareEmpty").classList.remove("hidden");
      return;
    }

    const variant = data.variants[Math.min(state.compareVariant, data.variants.length - 1)];
    state.compareVariant = data.variants.indexOf(variant);
    const scale = state.compareZoom > 0 ? `scale(${state.compareZoom})` : "";
    const showOriginal = state.compareShowOriginal;

    stage.dataset.mode = state.compareMode;
    stage.style.setProperty("--split", `${split}%`);
    stage.innerHTML =
      `<div class="compare-pane original${state.compareMode === "toggle" && !showOriginal ? " hidden" : ""}">
         <img src="${escapeHtml(data.originalUrl)}" alt="Original" draggable="false" style="transform:${scale}">
         <span class="compare-label">Original · ${fmt(data.originalBytes)}</span>
       </div>
       <div class="compare-pane variant">
         <img src="${escapeHtml(variant.url)}" alt="${escapeHtml(variant.label)} variant" draggable="false" style="transform:${scale}">
         <span class="compare-label">${escapeHtml(variant.label)} · ${fmt(variant.bytes)}</span>
       </div>` +
      (state.compareMode === "split"
        ? `<div class="compare-split"><span class="micro-label">Split</span><input type="range" min="0" max="100" step="1" value="${split}" aria-label="Split position"></div>`
        : "");

    stage.classList.remove("hidden");
    $("compareEmpty").classList.add("hidden");
    $("compareRail").classList.remove("hidden");
    $("compareFormat").textContent = data.formatLabel;
    $("compareViewTitle").textContent = data.rel.split(/[\\/]/).pop() ?? data.rel;
    syncFileSelect(data.rel);
    renderFacts(data, variant);
    renderLadder(data);

    $("compareErrors").innerHTML = data.errors.length
      ? data.errors.map((error) => `<p>${escapeHtml(error)}</p>`).join("")
      : "";

    const range = stage.querySelector<HTMLInputElement>(".compare-split input");
    range?.addEventListener("input", () => {
      split = Number(range.value);
      stage.style.setProperty("--split", `${split}%`);
    });

    stage.onclick = (event) => {
      if ((event.target as HTMLElement).closest("input, button")) return;
      if (state.compareMode !== "toggle") return;
      state.compareShowOriginal = !state.compareShowOriginal;
      renderStage();
    };

    const img = stage.querySelector<HTMLImageElement>(".compare-pane.variant img");
    img?.addEventListener("load", () => {
      if (img.naturalWidth && img.naturalHeight) {
        dimensions = { width: img.naturalWidth, height: img.naturalHeight };
        renderFacts(data, variant);
      }
    });
  };

  const renderEmpty = (title: string, note: string): void => {
    $("compareEmpty").innerHTML = emptyState("compare", title, note);
    $("compareEmpty").classList.remove("hidden");
    $("compareStage").classList.add("hidden");
    $("compareRail").classList.add("hidden");
  };

  const run = async (rel: string): Promise<void> => {
    if (busy) return;
    busy = true;
    state.compareRel = rel;
    dimensions = null;
    state.compareVariant = 0;
    $("compareEmpty").innerHTML = `<div class="empty-state"><svg width="24" height="24" aria-hidden="true"><use href="#i-loader"></use></svg><p class="empty-title">Encoding variants…</p><p class="empty-note">${escapeHtml(rel)}</p></div>`;
    $("compareEmpty").classList.remove("hidden");
    $("compareStage").classList.add("hidden");
    $("compareRail").classList.add("hidden");
    try {
      const data = await actions.runCompare(rel);
      state.compare = data;
      if (!data.variants.length) {
        renderEmpty("No variants produced", data.errors[0] ?? "The encoder returned no output for this file.");
        return;
      }
      renderStage();
    } catch (error) {
      state.compare = null;
      renderEmpty("Could not compare this file", (error as Error).message);
    } finally {
      busy = false;
    }
  };

  const open = (rel?: string): void => {
    actions.switchView("compare");
    const files = fileList();
    if (!files.length) {
      renderEmpty("No selected files to compare", "Select at least one image in the Library, then open Compare again.");
      $("compareViewTitle").textContent = "Compare";
      $("compareFormat").textContent = state.formatSpecs[state.currentFormat]?.shortLabel ?? "—";
      return;
    }
    const wanted = rel ?? state.compareRel;
    const chosen = files.some((f) => f.rel === wanted) ? wanted! : files[0].rel;
    syncFileSelect(chosen);
    void run(chosen);
  };

  const close = (): void => {
    actions.switchView("workspace");
  };

  const setMode = (mode: "split" | "side" | "toggle"): void => {
    state.compareMode = mode;
    if (mode === "toggle") state.compareShowOriginal = true;
    for (const button of $("compareModes").querySelectorAll<HTMLButtonElement>("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    }
    renderStage();
  };

  const setZoom = (next: number): void => {
    state.compareZoom = Math.max(0, Math.min(4, next));
    $("compareZoom").textContent = state.compareZoom > 0 ? `${Math.round(state.compareZoom * 100)}%` : "Fit";
    renderStage();
  };

  const zoomIn = (): void => setZoom(state.compareZoom === 0 ? 1 : state.compareZoom + 0.25);
  const zoomOut = (): void => setZoom(state.compareZoom <= 1 ? 0 : state.compareZoom - 0.5);

  $("compareModes").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-mode]");
    if (button?.dataset.mode) setMode(button.dataset.mode as "split" | "side" | "toggle");
  });

  $("compareZoomIn").addEventListener("click", zoomIn);
  $("compareZoomOut").addEventListener("click", zoomOut);
  $("compareClose").addEventListener("click", close);

  $("compareFileSelect").addEventListener("change", () => {
    const value = $<HTMLSelectElement>("compareFileSelect").value;
    if (value) void run(value);
  });

  $("compareLadder").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-use-quality]");
    if (!button) return;
    const quality = Number(button.dataset.useQuality);
    if (!Number.isFinite(quality)) return;
    actions.setQuality(quality);
    actions.toast(`Quality set to q${quality}.`, "success");
  });

  const handleKey = (event: KeyboardEvent): boolean => {
    if (state.view !== "compare") return false;
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return false;

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return true;
    }
    if (event.key === " ") {
      event.preventDefault();
      state.compareShowOriginal = !state.compareShowOriginal;
      renderStage();
      return true;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomIn();
      return true;
    }
    if (event.key === "-") {
      event.preventDefault();
      zoomOut();
      return true;
    }
    if (event.key === "0") {
      event.preventDefault();
      setZoom(0);
      return true;
    }
    if (event.key === "1") {
      event.preventDefault();
      setZoom(1);
      return true;
    }
    if ((event.key === "[" || event.key === "]") && state.compare?.variants.length) {
      event.preventDefault();
      const count = state.compare.variants.length;
      const step = event.key === "]" ? 1 : -1;
      state.compareVariant = (state.compareVariant + step + count) % count;
      renderStage();
      return true;
    }
    return false;
  };

  $("compareZoom").textContent = "Fit";
  return { open, close, handleKey };
}
