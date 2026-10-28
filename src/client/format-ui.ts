/**
 * Output-format cards and the format-specific quality/speed controls.
 *
 * The server owns every label, range, and default. This module only reflects
 * that metadata and remembers the last quality/speed per format so switching
 * away and back does not silently reset the user's choice.
 */
import { $, escapeHtml, icon, input } from "./dom";
import { state } from "./state";
import type { FormatSpec, OutputFormat, Status } from "./types";

export type FormatUiOptions = {
  onSelect: (id: OutputFormat) => void;
  onPreview: () => void;
  onToast: (message: string) => void;
};

export type FormatUi = {
  init: (status: Status) => void;
  apply: (id: OutputFormat, restore: boolean) => void;
  lock: (on: boolean) => void;
  refreshCards: () => void;
  setQuality: (quality: number) => void;
  qualityText: (spec: FormatSpec, quality: number) => string;
  current: () => OutputFormat;
};

const PRIMARY: OutputFormat[] = ["avif", "jxl", "webp", "jpeg"];
const MORE: OutputFormat[] = ["heic", "jp2", "png"];

export function createFormatUi(options: FormatUiOptions): FormatUi {
  let locked = false;
  let moreOpen = false;

  const paint = (node: HTMLInputElement): void => {
    const min = Number(node.min) || 0;
    const max = Number(node.max) || 100;
    const value = node.valueAsNumber;
    const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
    node.style.setProperty("--fill", `${Math.max(0, Math.min(100, percent)).toFixed(2)}%`);
  };

  const writable = (id: OutputFormat): boolean => {
    const magick = state.status?.magick;
    if (!magick) return false;
    const support = magick.formats?.[id];
    if (support) return Boolean(support.writable);
    return id === "avif" ? Boolean(magick.avifWritable) : true;
  };

  const qualityText = (spec: FormatSpec, quality: number): string => {
    if (spec.quality.kind === "compression") return `level ${Math.floor(quality / 10)}`;
    if (spec.quality.kind === "rate") {
      const ratio = spec.quality.rateTable?.[String(quality)];
      return ratio ? `q${quality} (${ratio}:1)` : `q${quality}`;
    }
    return `q${quality}`;
  };

  const card = (spec: FormatSpec): string => {
    const available = writable(spec.id);
    const support = state.status?.magick?.formats?.[spec.id];
    const selected = state.currentFormat === spec.id;
    const meta = spec.summary;
    const title = available
      ? `${spec.label} — ${spec.summary}`
      : `${spec.label} cannot be encoded by this ImageMagick build (format mode "${support?.mode ?? "missing"}").`;
    return `<button class="format-card" type="button" role="radio" aria-checked="${selected}" data-format="${spec.id}"${available ? "" : " disabled aria-disabled=\"true\""} title="${escapeHtml(title)}">
      <span class="format-card-top">
        <span class="format-icon">${escapeHtml(spec.shortLabel)}</span>
        ${spec.id === "avif" ? `<span class="format-recommended">Recommended</span>` : ""}
        ${available ? "" : `<span class="format-lock">${icon("lock", 12)}</span>`}
      </span>
      <span class="format-name">${escapeHtml(spec.label)}</span>
      <span class="format-meta">${escapeHtml(meta)}</span>
    </button>`;
  };

  const refreshCards = (): void => {
    const specs = Object.values(state.formatSpecs);
    const byId = new Map(specs.map((spec) => [spec.id, spec]));
    const make = (ids: OutputFormat[]): string =>
      ids.map((id) => byId.get(id)).filter((spec): spec is FormatSpec => Boolean(spec)).map(card).join("");

    $("formatCards").innerHTML = make(PRIMARY);
    $("moreFormats").innerHTML = make(MORE);
    $("moreFormats").classList.toggle("hidden", !moreOpen);
    $("btnMoreFormats").setAttribute("aria-expanded", String(moreOpen));
    $("btnMoreFormats").textContent = moreOpen ? "Fewer formats" : "More formats";
    if (!moreOpen && MORE.includes(state.currentFormat)) {
      moreOpen = true;
      $("moreFormats").classList.remove("hidden");
      $("btnMoreFormats").setAttribute("aria-expanded", "true");
      $("btnMoreFormats").textContent = "Fewer formats";
    }
  };

  const apply = (id: OutputFormat, restore: boolean): void => {
    const spec = state.formatSpecs[id];
    if (!spec) return;
    state.currentFormat = id;

    $("qualityLabelText").textContent = spec.quality.label;
    $("qualityHint").textContent = spec.quality.hint;
    $("qualityNote").textContent = spec.quality.note;
    $("speedLabelText").textContent = spec.speed.label;
    $("speedHint").textContent = spec.speed.hint;
    $("speedNote").textContent = spec.speed.note;

    const quality = input("quality");
    const speed = input("heicSpeed");
    quality.min = String(spec.quality.min);
    quality.max = String(spec.quality.max);
    quality.step = String(spec.quality.step);
    speed.min = String(spec.speed.min);
    speed.max = String(spec.speed.max);
    speed.step = String(spec.speed.step);

    if (restore) {
      const memory = state.formatMemory[id] ?? {
        quality: spec.quality.default,
        speed: spec.speed.default,
      };
      quality.value = String(Math.min(spec.quality.max, Math.max(spec.quality.min, memory.quality)));
      speed.value = String(Math.min(spec.speed.max, Math.max(spec.speed.min, memory.speed)));
    }

    $("qualityOut").textContent = qualityText(spec, quality.valueAsNumber);
    $("heicSpeedOut").textContent =
      spec.speed.labels?.[String(speed.valueAsNumber)] ?? String(speed.valueAsNumber);
    paint(quality);
    paint(speed);
    $("speedField").classList.toggle("hidden", !spec.speed.visible);
    $("formatNote").textContent = [spec.summary, spec.transparencyNote, spec.animationNote]
      .filter(Boolean)
      .join(" ");
    $("recipeMeta").textContent = spec.shortLabel;
    refreshCards();
  };

  const init = (status: Status): void => {
    const list = Array.isArray(status.formats) && status.formats.length ? status.formats : [];
    state.formatSpecs = {};
    state.formatMemory = {};
    for (const spec of list) {
      state.formatSpecs[spec.id] = spec;
      state.formatMemory[spec.id] = {
        quality: spec.quality.default,
        speed: spec.speed.default,
      };
    }
    const preferred = status.policy?.outputFormat ?? "avif";
    const preferredSpec = state.formatSpecs[preferred];
    const fallback = state.formatSpecs.avif ? "avif" : (Object.keys(state.formatSpecs)[0] as OutputFormat | undefined);
    const chosen = preferredSpec && writable(preferred) ? preferred : fallback;
    if (!chosen) return;
    if (chosen !== preferred) {
      options.onToast(`${state.formatSpecs[preferred]?.label ?? preferred} is not supported by this ImageMagick build; using ${state.formatSpecs[chosen].label}.`);
    }
    if (state.formatSpecs[chosen]) {
      state.formatMemory[chosen] = {
        quality: status.policy?.qualities?.[0] ?? state.formatSpecs[chosen].quality.default,
        speed: status.policy?.heicSpeed ?? state.formatSpecs[chosen].speed.default,
      };
    }
    apply(chosen, true);
  };

  const setQuality = (quality: number): void => {
    const spec = state.formatSpecs[state.currentFormat];
    if (!spec) return;
    const next = Math.min(spec.quality.max, Math.max(spec.quality.min, quality));
    const inputNode = input("quality");
    inputNode.value = String(next);
    paint(inputNode);
    state.formatMemory[state.currentFormat] = {
      quality: next,
      speed: input("heicSpeed").valueAsNumber,
    };
    $("qualityOut").textContent = qualityText(spec, next);
    options.onPreview();
  };

  $("formatCards").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-format]");
    if (!button || button.disabled || locked) return;
    const id = button.dataset.format as OutputFormat | undefined;
    if (id) options.onSelect(id);
  });

  $("moreFormats").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-format]");
    if (!button || button.disabled || locked) return;
    const id = button.dataset.format as OutputFormat | undefined;
    if (id) options.onSelect(id);
  });

  $("btnMoreFormats").addEventListener("click", () => {
    moreOpen = !moreOpen;
    refreshCards();
  });

  input("quality").addEventListener("input", () => {
    const spec = state.formatSpecs[state.currentFormat];
    const value = input("quality").valueAsNumber;
    if (spec) $("qualityOut").textContent = qualityText(spec, value);
    paint(input("quality"));
    state.formatMemory[state.currentFormat] = {
      quality: value,
      speed: input("heicSpeed").valueAsNumber,
    };
    options.onPreview();
  });

  input("heicSpeed").addEventListener("input", () => {
    const spec = state.formatSpecs[state.currentFormat];
    const value = input("heicSpeed").valueAsNumber;
    $("heicSpeedOut").textContent = spec?.speed.labels?.[String(value)] ?? String(value);
    paint(input("heicSpeed"));
    state.formatMemory[state.currentFormat] = {
      quality: input("quality").valueAsNumber,
      speed: value,
    };
  });

  $("btnQualityReset").addEventListener("click", () => {
    const spec = state.formatSpecs[state.currentFormat];
    if (!spec) return;
    state.formatMemory[state.currentFormat] = {
      quality: spec.quality.default,
      speed: spec.speed.default,
    };
    apply(state.currentFormat, true);
    options.onPreview();
  });

  return {
    init,
    apply,
    refreshCards,
    setQuality,
    qualityText,
    current: () => state.currentFormat,
    lock: (on: boolean) => {
      locked = on;
      for (const button of document.querySelectorAll<HTMLButtonElement>("[data-format]")) {
        const id = button.dataset.format as OutputFormat | undefined;
        button.disabled = on || (id ? !writable(id) : false);
      }
    },
  };
}
