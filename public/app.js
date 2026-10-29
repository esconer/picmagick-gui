// src/client/api.ts
class ApiError extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
async function api(path, opts = {}) {
  const method = opts.method ?? "GET";
  const res = await fetch("/api/" + path, {
    method,
    headers: method === "POST" ? { "content-type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
    cache: "no-store"
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const message = typeof data === "object" && data !== null && "error" in data ? String(data.error) : res.statusText || `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data;
}

// src/client/dom.ts
var $ = (id) => {
  const node = document.getElementById(id);
  if (!node)
    throw new Error(`Missing element #${id}`);
  return node;
};
var maybe = (id) => document.getElementById(id);
var input = (id) => $(id);
var escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => {
  switch (char) {
    case "&":
      return "&amp;";
    case "<":
      return "&lt;";
    case ">":
      return "&gt;";
    case '"':
      return "&quot;";
    default:
      return "&#39;";
  }
});
var fmt = (n) => {
  if (n == null || !Number.isFinite(n))
    return "–";
  if (n >= 1024 ** 3)
    return (n / 1024 ** 3).toFixed(2) + " GB";
  if (n >= 1024 ** 2)
    return (n / 1024 ** 2).toFixed(1) + " MB";
  if (n >= 1024)
    return (n / 1024).toFixed(1) + " KB";
  return Math.round(n) + " B";
};
var dur = (seconds) => {
  if (seconds == null || !Number.isFinite(seconds))
    return "–";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  if (h > 0)
    return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
};
var eta = (seconds) => {
  if (seconds == null || !Number.isFinite(seconds))
    return "–";
  if (seconds < 60)
    return `${Math.max(1, Math.round(seconds))}s`;
  return dur(seconds);
};
var clamp = (n, min, max) => Math.min(max, Math.max(min, n));
var icon = (name, size = 16, className = "icon") => `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
var setWidth = (node, fraction) => {
  node.style.transform = `scaleX(${clamp(fraction, 0, 1)})`;
};
var debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    if (timer !== undefined)
      clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
var toastIcon = {
  info: "info",
  success: "check-circle",
  warning: "alert-triangle",
  danger: "alert-octagon"
};
function toast(message, kind = "info", action) {
  const host = maybe("toasts");
  if (!host)
    return;
  const node = document.createElement("div");
  node.className = `toast toast-${kind}`;
  node.setAttribute("role", kind === "danger" ? "alert" : "status");
  node.innerHTML = `<span class="toast-icon">${icon(toastIcon[kind], 16)}</span>` + `<span class="toast-text">${escapeHtml(message)}</span>` + (action ? `<button class="toast-action" type="button">${escapeHtml(action.label)}</button>` : "") + `<button class="toast-close" type="button" aria-label="Dismiss">${icon("x", 14)}</button>`;
  const dismiss = () => {
    if (!node.isConnected)
      return;
    node.classList.add("toast-out");
    window.setTimeout(() => node.remove(), 180);
  };
  node.querySelector(".toast-close")?.addEventListener("click", dismiss);
  if (action) {
    node.querySelector(".toast-action")?.addEventListener("click", () => {
      action.run();
      dismiss();
    });
  }
  host.append(node);
  while (host.children.length > 3)
    host.firstElementChild?.remove();
  if (kind !== "danger") {
    const timer = window.setTimeout(dismiss, kind === "warning" ? 8000 : 4500);
    node.addEventListener("mouseenter", () => window.clearTimeout(timer), { once: true });
  }
}
function openModal(title, html, size = "md") {
  const dialog = $("modal");
  const titleNode = $("modalTitle");
  const body = $("modalBody");
  titleNode.textContent = title;
  body.innerHTML = html;
  dialog.dataset.size = size;
  if (!dialog.open)
    dialog.showModal();
  window.setTimeout(() => {
    body.querySelector("button, input, select, textarea, [tabindex='0']")?.focus();
  }, 40);
  return dialog;
}
function closeModal() {
  const dialog = maybe("modal");
  if (dialog?.open)
    dialog.close();
}
var shortVersion = (version) => {
  const text = String(version ?? "");
  return text.match(/\d+\.\d+\.\d+(?:-\d+)?/)?.[0] ?? (text.split(/\s+/)[0] || "?");
};
var relativeTime = (timestamp) => {
  if (!timestamp)
    return "never";
  const diff = Date.now() - timestamp;
  if (diff < 45000)
    return "just now";
  if (diff < 3600000)
    return `${Math.round(diff / 60000)} min ago`;
  if (diff < 86400000)
    return `${Math.round(diff / 3600000)} h ago`;
  return new Date(timestamp).toLocaleDateString();
};
var middlePath = (path, max = 54) => {
  if (path.length <= max)
    return path;
  const keep = Math.floor((max - 1) / 2);
  return `${path.slice(0, keep)}…${path.slice(-keep)}`;
};
var isMac = () => /mac/i.test(navigator.platform || "");
var modKey = () => isMac() ? "⌘" : "Ctrl";

// src/client/format-logic.ts
function stripTrailingSeparators(p) {
  const s = String(p);
  if (s === "/" || s === "\\" || /^[A-Za-z]:[\\/]$/.test(s))
    return s;
  return s.replace(/[\\/]+$/, "");
}
function defaultDestination(source, suffix) {
  return `${stripTrailingSeparators(source)}-${suffix}`;
}
function nextDestinationOnFormatChange(current, source, oldSuffix, newSuffix, caseInsensitive) {
  if (!current)
    return current;
  const fold = (p) => {
    const s = stripTrailingSeparators(p);
    return caseInsensitive ? s.toLowerCase() : s;
  };
  return fold(current) === fold(defaultDestination(source, oldSuffix)) ? defaultDestination(source, newSuffix) : current;
}

// src/client/state.ts
var emptyRun = () => ({
  id: null,
  state: "idle",
  total: 0,
  done: 0,
  converted: 0,
  copied: 0,
  skipped: 0,
  failed: 0,
  bytes: 0,
  etaSeconds: null,
  elapsedSeconds: null,
  inFlight: 0,
  startingRel: null,
  startingBytes: null,
  lastRel: null,
  lastStatus: null,
  note: null
});
var state = {
  status: null,
  tree: null,
  lastScan: null,
  excluded: new Set,
  included: new Set,
  excludedFiles: new Set,
  includedFiles: new Set,
  expanded: new Set,
  filterQuery: "",
  formatSpecs: {},
  currentFormat: "avif",
  formatMemory: {},
  preview: null,
  previewSeq: 0,
  previewBusy: false,
  run: emptyRun(),
  currentJob: null,
  lastJobId: null,
  lastSummary: null,
  lastManifestId: null,
  lastJobError: null,
  activity: [],
  running: false,
  starting: false,
  es: null,
  imStatus: null,
  appUpdate: null,
  lastEstimate: null,
  lastSync: null,
  view: "workspace",
  compareRel: null,
  compare: null,
  compareVariant: 0,
  compareMode: "split",
  compareZoom: 0,
  compareShowOriginal: true,
  themeChoice: "auto",
  booted: false
};
var resetRun = (total) => {
  state.run = { ...emptyRun(), total, state: "running" };
  state.activity = [];
  state.lastSummary = null;
  state.lastManifestId = null;
  state.lastJobError = null;
  state.lastJobId = null;
};

// src/client/format-ui.ts
var PRIMARY = ["avif", "jxl", "webp", "jpeg"];
var MORE = ["heic", "jp2", "png"];
function createFormatUi(options) {
  let locked = false;
  let moreOpen = false;
  const paint = (node) => {
    const min = Number(node.min) || 0;
    const max = Number(node.max) || 100;
    const value = node.valueAsNumber;
    const percent = max > min ? (value - min) / (max - min) * 100 : 0;
    node.style.setProperty("--fill", `${Math.max(0, Math.min(100, percent)).toFixed(2)}%`);
  };
  const writable = (id) => {
    const magick = state.status?.magick;
    if (!magick)
      return false;
    const support = magick.formats?.[id];
    if (support)
      return Boolean(support.writable);
    return id === "avif" ? Boolean(magick.avifWritable) : true;
  };
  const qualityText = (spec, quality) => {
    if (spec.quality.kind === "compression")
      return `level ${Math.floor(quality / 10)}`;
    if (spec.quality.kind === "rate") {
      const ratio = spec.quality.rateTable?.[String(quality)];
      return ratio ? `q${quality} (${ratio}:1)` : `q${quality}`;
    }
    return `q${quality}`;
  };
  const card = (spec) => {
    const available = writable(spec.id);
    const support = state.status?.magick?.formats?.[spec.id];
    const selected = state.currentFormat === spec.id;
    const meta = spec.summary;
    const title = available ? `${spec.label} — ${spec.summary}` : `${spec.label} cannot be encoded by this ImageMagick build (format mode "${support?.mode ?? "missing"}").`;
    return `<button class="format-card" type="button" role="radio" aria-checked="${selected}" data-format="${spec.id}"${available ? "" : ' disabled aria-disabled="true"'} title="${escapeHtml(title)}">
      <span class="format-card-top">
        <span class="format-icon">${escapeHtml(spec.shortLabel)}</span>
        ${spec.id === "avif" ? `<span class="format-recommended">Recommended</span>` : ""}
        ${available ? "" : `<span class="format-lock">${icon("lock", 12)}</span>`}
      </span>
      <span class="format-name">${escapeHtml(spec.label)}</span>
      <span class="format-meta">${escapeHtml(meta)}</span>
    </button>`;
  };
  const refreshCards = () => {
    const specs = Object.values(state.formatSpecs);
    const byId = new Map(specs.map((spec) => [spec.id, spec]));
    const make = (ids) => ids.map((id) => byId.get(id)).filter((spec) => Boolean(spec)).map(card).join("");
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
  const apply = (id, restore) => {
    const spec = state.formatSpecs[id];
    if (!spec)
      return;
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
        speed: spec.speed.default
      };
      quality.value = String(Math.min(spec.quality.max, Math.max(spec.quality.min, memory.quality)));
      speed.value = String(Math.min(spec.speed.max, Math.max(spec.speed.min, memory.speed)));
    }
    $("qualityOut").textContent = qualityText(spec, quality.valueAsNumber);
    $("heicSpeedOut").textContent = spec.speed.labels?.[String(speed.valueAsNumber)] ?? String(speed.valueAsNumber);
    paint(quality);
    paint(speed);
    $("speedField").classList.toggle("hidden", !spec.speed.visible);
    $("formatNote").textContent = [spec.summary, spec.transparencyNote, spec.animationNote].filter(Boolean).join(" ");
    $("recipeMeta").textContent = spec.shortLabel;
    refreshCards();
  };
  const init = (status) => {
    const list = Array.isArray(status.formats) && status.formats.length ? status.formats : [];
    state.formatSpecs = {};
    state.formatMemory = {};
    for (const spec of list) {
      state.formatSpecs[spec.id] = spec;
      state.formatMemory[spec.id] = {
        quality: spec.quality.default,
        speed: spec.speed.default
      };
    }
    const preferred = status.policy?.outputFormat ?? "avif";
    const preferredSpec = state.formatSpecs[preferred];
    const fallback = state.formatSpecs.avif ? "avif" : Object.keys(state.formatSpecs)[0];
    const chosen = preferredSpec && writable(preferred) ? preferred : fallback;
    if (!chosen)
      return;
    if (chosen !== preferred) {
      options.onToast(`${state.formatSpecs[preferred]?.label ?? preferred} is not supported by this ImageMagick build; using ${state.formatSpecs[chosen].label}.`);
    }
    if (state.formatSpecs[chosen]) {
      state.formatMemory[chosen] = {
        quality: status.policy?.qualities?.[0] ?? state.formatSpecs[chosen].quality.default,
        speed: status.policy?.heicSpeed ?? state.formatSpecs[chosen].speed.default
      };
    }
    apply(chosen, true);
  };
  const setQuality = (quality) => {
    const spec = state.formatSpecs[state.currentFormat];
    if (!spec)
      return;
    const next = Math.min(spec.quality.max, Math.max(spec.quality.min, quality));
    const inputNode = input("quality");
    inputNode.value = String(next);
    paint(inputNode);
    state.formatMemory[state.currentFormat] = {
      quality: next,
      speed: input("heicSpeed").valueAsNumber
    };
    $("qualityOut").textContent = qualityText(spec, next);
    options.onPreview();
  };
  $("formatCards").addEventListener("click", (event) => {
    const button = event.target.closest("[data-format]");
    if (!button || button.disabled || locked)
      return;
    const id = button.dataset.format;
    if (id)
      options.onSelect(id);
  });
  $("moreFormats").addEventListener("click", (event) => {
    const button = event.target.closest("[data-format]");
    if (!button || button.disabled || locked)
      return;
    const id = button.dataset.format;
    if (id)
      options.onSelect(id);
  });
  $("btnMoreFormats").addEventListener("click", () => {
    moreOpen = !moreOpen;
    refreshCards();
  });
  input("quality").addEventListener("input", () => {
    const spec = state.formatSpecs[state.currentFormat];
    const value = input("quality").valueAsNumber;
    if (spec)
      $("qualityOut").textContent = qualityText(spec, value);
    paint(input("quality"));
    state.formatMemory[state.currentFormat] = {
      quality: value,
      speed: input("heicSpeed").valueAsNumber
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
      speed: value
    };
  });
  $("btnQualityReset").addEventListener("click", () => {
    const spec = state.formatSpecs[state.currentFormat];
    if (!spec)
      return;
    state.formatMemory[state.currentFormat] = {
      quality: spec.quality.default,
      speed: spec.speed.default
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
    lock: (on) => {
      locked = on;
      for (const button of document.querySelectorAll("[data-format]")) {
        const id = button.dataset.format;
        button.disabled = on || (id ? !writable(id) : false);
      }
    }
  };
}

// src/client/tree-logic.ts
var excludedLower = (set, caseInsensitive = true) => new Set([...set].map((e) => caseInsensitive ? e.toLowerCase() : e));
var pathOptions = (opts) => ({
  sep: opts?.sep === "/" ? "/" : "\\",
  caseInsensitive: opts?.caseInsensitive !== false
});
var fold = (s, caseInsensitive) => caseInsensitive ? s.toLowerCase() : s;
function isFullyExcluded(rel, ex, inc = new Set, opts = {}) {
  if (!rel)
    return false;
  const { sep, caseInsensitive } = pathOptions(opts);
  const parts = rel.split(sep);
  const prefixes = [];
  for (let i = 1;i <= parts.length; i++) {
    prefixes.push(fold(parts.slice(0, i).join(sep), caseInsensitive));
  }
  for (const p of prefixes)
    if (inc.has(p))
      return false;
  for (const p of prefixes)
    if (ex.has(p))
      return true;
  return false;
}
function hasExcludedDescendant(node, ex, inc = new Set, opts = {}) {
  const { caseInsensitive } = pathOptions(opts);
  if (node.rel && ex.has(fold(node.rel, caseInsensitive)))
    return true;
  return node.children.some((c) => hasExcludedDescendant(c, ex, inc, opts));
}
function isFileExcluded(rel, exFolders, incFolders, exFiles, incFiles, opts = {}) {
  const { caseInsensitive } = pathOptions(opts);
  const key = fold(rel, caseInsensitive);
  if (incFiles.has(key))
    return false;
  if (exFiles.has(key))
    return true;
  return isFullyExcluded(rel, exFolders, incFolders, opts);
}
function toggleFile(rel, nowExcluded, excludedFiles = new Set, includedFiles = new Set, opts = {}) {
  const { caseInsensitive } = pathOptions(opts);
  const key = fold(rel, caseInsensitive);
  const ex = new Set(excludedFiles);
  const inc = new Set(includedFiles);
  for (const e of [...ex])
    if (fold(e, caseInsensitive) === key)
      ex.delete(e);
  for (const e of [...inc])
    if (fold(e, caseInsensitive) === key)
      inc.delete(e);
  if (nowExcluded)
    ex.add(rel);
  else
    inc.add(rel);
  return { excludedFiles: ex, includedFiles: inc };
}
function clearFileOverridesUnder(rel, excludedFiles, includedFiles, opts = {}) {
  const { sep, caseInsensitive } = pathOptions(opts);
  const key = fold(rel, caseInsensitive);
  const atOrBelow = (p) => {
    const k = fold(p, caseInsensitive);
    return k === key || k.startsWith(key + sep);
  };
  return {
    excludedFiles: new Set([...excludedFiles].filter((p) => !atOrBelow(p))),
    includedFiles: new Set([...includedFiles].filter((p) => !atOrBelow(p)))
  };
}
function countSelection(node, isSelected, out = new Map) {
  let total = 0;
  let selected = 0;
  for (const f of node.files ?? []) {
    total++;
    if (isSelected(f))
      selected++;
  }
  for (const c of node.children ?? []) {
    const child = countSelection(c, isSelected, out);
    total += child.total;
    selected += child.selected;
  }
  out.set(node.rel, { total, selected });
  return { total, selected };
}
function toggleFolder(tree, excluded, rel, nowExcluded, included = new Set, opts = {}) {
  const ex = new Set(excluded);
  const inc = new Set(included);
  const { sep, caseInsensitive } = pathOptions(opts);
  const key = fold(rel, caseInsensitive);
  const atOrBelow = (e) => {
    const k = fold(e, caseInsensitive);
    return k === key || k.startsWith(key + sep);
  };
  const ancestorExcluded = [...ex].some((e) => key.startsWith(fold(e, caseInsensitive) + sep));
  for (const e of [...ex])
    if (atOrBelow(e))
      ex.delete(e);
  for (const e of [...inc])
    if (atOrBelow(e))
      inc.delete(e);
  if (nowExcluded) {
    ex.add(rel);
  } else if (ancestorExcluded) {
    inc.add(rel);
  }
  return { excluded: ex, included: inc };
}
function collectRels(node) {
  return node.children.flatMap((c) => [c.rel, ...collectRels(c)]);
}
function topLevelRels(tree) {
  return tree.children.map((c) => c.rel);
}

// src/client/library.ts
var DISPLAYABLE = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"]);
var byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
var flatten = (node) => [
  ...node.files,
  ...node.children.flatMap(flatten)
];
function createLibrary(opts) {
  const box = $("tree");
  const filterInput = input("treeFilter");
  const clearFilter = $("btnClearFilter");
  const pathOptions = () => ({
    sep: state.status?.pathSeparator ?? "\\",
    caseInsensitive: state.status?.caseInsensitive ?? true
  });
  const fold = (value) => state.status?.caseInsensitive ?? true ? value.toLowerCase() : value;
  const allFiles = () => state.tree ? flatten(state.tree) : [];
  const selected = () => {
    if (!state.tree)
      return [];
    const o = pathOptions();
    const ci = o.caseInsensitive;
    const ex = excludedLower(state.excluded, ci);
    const inc = excludedLower(state.included, ci);
    const exFiles = excludedLower(state.excludedFiles, ci);
    const incFiles = excludedLower(state.includedFiles, ci);
    return allFiles().filter((file) => !isFileExcluded(file.rel, ex, inc, exFiles, incFiles, o));
  };
  const selectedBytes = () => selected().reduce((sum, file) => sum + file.size, 0);
  const prune = () => {
    if (!state.tree)
      return;
    const folders = new Set(collectRels(state.tree).map(fold));
    const files = new Set(allFiles().map((file) => fold(file.rel)));
    state.excluded = new Set([...state.excluded].filter((rel) => folders.has(fold(rel))));
    state.included = new Set([...state.included].filter((rel) => folders.has(fold(rel))));
    state.excludedFiles = new Set([...state.excludedFiles].filter((rel) => files.has(fold(rel))));
    state.includedFiles = new Set([...state.includedFiles].filter((rel) => files.has(fold(rel))));
  };
  const nodeMatches = (node, query) => {
    if (!query)
      return true;
    if (node.rel.toLowerCase().includes(query))
      return true;
    if (node.files.some((file) => file.rel.toLowerCase().includes(query)))
      return true;
    return node.children.some((child) => nodeMatches(child, query));
  };
  const visibleFiles = (files, query, ancestorMatched) => {
    const list = !query || ancestorMatched ? files : files.filter((file) => file.rel.toLowerCase().includes(query));
    return [...list].sort(byName);
  };
  const thumb = (file) => {
    const node = document.createElement("span");
    node.className = "tree-thumb";
    const ext = String(file.ext || "?").toUpperCase();
    if (file.category === "image" && file.size <= 8 * 1024 ** 2 && DISPLAYABLE.has(file.ext.toLowerCase())) {
      const img = document.createElement("img");
      img.src = `/api/source-file?rel=${encodeURIComponent(file.rel)}`;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => {
        img.remove();
        node.textContent = ext.slice(0, 4);
        node.classList.add("tree-ext");
      });
      node.append(img);
    } else {
      node.textContent = ext.slice(0, 4);
      node.classList.add("tree-ext");
      if (file.category === "raw")
        node.classList.add("raw");
      if (file.category === "video" || file.category === "other")
        node.classList.add("other");
    }
    return node;
  };
  const fileRow = (file, depth, ctx) => {
    const row = document.createElement("div");
    row.className = "tree-row";
    row.dataset.rel = file.rel;
    row.dataset.kind = "file";
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.title = file.rel;
    const included = !isFileExcluded(file.rel, ctx.ex, ctx.inc, ctx.exFiles, ctx.incFiles, ctx.opts);
    if (!included)
      row.classList.add("excluded");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "tree-check";
    check.checked = included;
    check.setAttribute("aria-label", `Include ${file.name}`);
    check.addEventListener("change", () => setFileSelected(file, check.checked));
    const spacer = document.createElement("span");
    spacer.className = "tree-caret leaf";
    const name = document.createElement("button");
    name.type = "button";
    name.className = "tree-name";
    name.textContent = file.name;
    name.title = file.rel;
    name.addEventListener("click", () => {
      check.checked = !check.checked;
      setFileSelected(file, check.checked);
    });
    const size = document.createElement("span");
    size.className = "tree-size";
    size.textContent = fmt(file.size);
    const text = document.createElement("span");
    text.className = "tree-file-text";
    text.append(name, size);
    const pills = document.createElement("span");
    pills.className = "tree-pills";
    const keep = document.createElement("button");
    keep.type = "button";
    keep.className = "tree-pill" + (included ? " on" : "");
    keep.textContent = "Keep";
    keep.title = "Include this file in the conversion plan";
    keep.setAttribute("aria-pressed", String(included));
    keep.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!check.checked) {
        check.checked = true;
        setFileSelected(file, true);
      }
    });
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "tree-pill" + (included ? "" : " on");
    skip.textContent = "Skip";
    skip.title = "Leave this file out of the conversion plan";
    skip.setAttribute("aria-pressed", String(!included));
    skip.addEventListener("click", (event) => {
      event.stopPropagation();
      if (check.checked) {
        check.checked = false;
        setFileSelected(file, false);
      }
    });
    pills.append(keep, skip);
    row.append(check, spacer, thumb(file), text, pills);
    if (file.category === "video" || file.category === "other") {
      const badge = document.createElement("span");
      badge.className = "tree-badge" + (file.category === "other" ? " dead" : "");
      badge.textContent = file.category;
      if (file.category === "other")
        badge.title = "Not an image format; this file is always skipped.";
      row.append(badge);
    }
    return row;
  };
  const context = () => {
    const o = pathOptions();
    const ci = o.caseInsensitive;
    return {
      opts: o,
      ex: excludedLower(state.excluded, ci),
      inc: excludedLower(state.included, ci),
      exFiles: excludedLower(state.excludedFiles, ci),
      incFiles: excludedLower(state.includedFiles, ci),
      q: state.filterQuery.trim().toLowerCase(),
      counts: new Map
    };
  };
  const nodeElement = (node, ctx, ancestorMatched = false) => {
    const selfMatch = !ctx.q || ancestorMatched || node.rel.toLowerCase().includes(ctx.q);
    if (ctx.q && !selfMatch && !nodeMatches(node, ctx.q))
      return null;
    const stats = ctx.counts.get(node.rel) ?? { total: 0, selected: 0 };
    const fully = isFullyExcluded(node.rel, ctx.ex, ctx.inc, ctx.opts);
    let checked;
    let indeterminate = false;
    if (stats.total > 0) {
      checked = stats.selected === stats.total;
      indeterminate = stats.selected > 0 && stats.selected < stats.total;
    } else {
      checked = !fully;
      indeterminate = !fully && hasExcludedDescendant(node, ctx.ex, ctx.inc, ctx.opts);
    }
    const wrap = document.createElement("div");
    const hasKids = node.children.length > 0 || node.files.length > 0;
    const isOpen = ctx.q ? true : state.expanded.has(node.rel);
    const row = document.createElement("div");
    row.className = "tree-row";
    if (stats.total > 0 ? stats.selected === 0 : fully)
      row.classList.add("excluded");
    row.dataset.rel = node.rel;
    row.dataset.kind = "folder";
    row.style.paddingLeft = `${8 + node.depth * 14}px`;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "tree-check";
    check.checked = checked;
    check.indeterminate = indeterminate;
    check.setAttribute("aria-label", `Include ${node.name} and everything in it`);
    check.addEventListener("click", (event) => event.stopPropagation());
    check.addEventListener("change", () => setExcluded(node.rel, !check.checked));
    const caret = document.createElement("button");
    caret.type = "button";
    caret.className = "tree-caret" + (hasKids ? "" : " leaf");
    caret.setAttribute("aria-expanded", isOpen ? "true" : "false");
    caret.setAttribute("aria-label", isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`);
    caret.innerHTML = hasKids ? icon("chevron-right", 11) : "";
    const folder = document.createElement("span");
    folder.className = "tree-thumb";
    folder.innerHTML = icon("folder", 14);
    const name = document.createElement("button");
    name.type = "button";
    name.className = "tree-name";
    name.textContent = node.name;
    name.title = node.rel;
    if (hasKids)
      name.setAttribute("aria-expanded", isOpen ? "true" : "false");
    const count = document.createElement("span");
    count.className = "tree-count";
    count.textContent = node.count.toLocaleString();
    count.title = `${node.count.toLocaleString()} files in this folder and below`;
    const size = document.createElement("span");
    size.className = "tree-size";
    size.textContent = fmt(node.bytes);
    row.append(check, caret, folder, name);
    if (node.count > 0)
      row.append(count);
    row.append(size);
    if (node.rawBytes > 0) {
      const badge = document.createElement("span");
      badge.className = "tree-badge raw";
      badge.textContent = `RAW ${fmt(node.rawBytes)}`;
      row.append(badge);
    }
    if (node.imageCount + node.rawCount === 0) {
      const badge = document.createElement("span");
      badge.className = "tree-badge dead";
      badge.textContent = "nothing convertible";
      badge.title = `${node.otherCount} other files, ${fmt(node.otherBytes)} (junk, video or cache)`;
      row.append(badge);
    }
    const kids = document.createElement("div");
    kids.className = "tree-kids" + (isOpen ? " open" : "");
    let built = false;
    const buildKids = () => {
      if (built)
        return;
      built = true;
      for (const file of visibleFiles(node.files, ctx.q, selfMatch)) {
        kids.append(fileRow(file, node.depth + 1, ctx));
      }
      for (const child of [...node.children].sort(byName)) {
        const el = nodeElement(child, ctx, selfMatch);
        if (el)
          kids.append(el);
      }
    };
    const toggleOpen = () => {
      if (!hasKids)
        return;
      const open = !kids.classList.contains("open");
      if (open)
        buildKids();
      kids.classList.toggle("open", open);
      if (open)
        state.expanded.add(node.rel);
      else
        state.expanded.delete(node.rel);
      caret.setAttribute("aria-expanded", open ? "true" : "false");
      caret.setAttribute("aria-label", open ? `Collapse ${node.name}` : `Expand ${node.name}`);
      name.setAttribute("aria-expanded", open ? "true" : "false");
    };
    caret.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleOpen();
    });
    name.addEventListener("click", toggleOpen);
    wrap.append(row, kids);
    if (isOpen)
      buildKids();
    return wrap;
  };
  const render = () => {
    const focusedRel = document.activeElement?.closest("[data-rel]")?.dataset.rel ?? null;
    const scrollTop = box.scrollTop;
    box.innerHTML = "";
    if (!state.tree) {
      box.innerHTML = `<div class="empty-state">
        <svg width="22" height="22" aria-hidden="true"><use href="#i-folder"></use></svg>
        <p class="empty-title">No library yet</p>
        <p class="empty-note">Pick a folder above, then press <b>Scan</b>.</p>
      </div>`;
      $("scanSummary").textContent = "not scanned";
      clearFilter.classList.add("hidden");
      $("treeFilterInfo").classList.add("hidden");
      return;
    }
    const ctx = context();
    countSelection(state.tree, (file) => !isFileExcluded(file.rel, ctx.ex, ctx.inc, ctx.exFiles, ctx.incFiles, ctx.opts), ctx.counts);
    const rootFiles = visibleFiles(state.tree.files, ctx.q, false);
    if (rootFiles.length) {
      const label = document.createElement("div");
      label.className = "tree-group-label";
      label.textContent = "Files in source root";
      box.append(label);
      for (const file of rootFiles)
        box.append(fileRow(file, 0, ctx));
    }
    for (const child of [...state.tree.children].sort(byName)) {
      const el = nodeElement(child, ctx, false);
      if (el)
        box.append(el);
    }
    if (!box.children.length) {
      box.innerHTML = `<div class="empty-state">
        <p class="empty-title">${ctx.q ? "No files match this filter" : "No files found"}</p>
        <p class="empty-note">${ctx.q ? "Try a shorter search." : "This folder has nothing to convert."}</p>
      </div>`;
    }
    const selectedInfo = ctx.counts.get(state.tree.rel) ?? { total: 0, selected: 0 };
    const scan = state.lastScan;
    $("scanSummary").textContent = scan ? `${scan.totals.count.toLocaleString()} files · ${fmt(scan.totals.bytes)} · ${selectedInfo.selected.toLocaleString()} selected · ${(scan.durationMs / 1000).toFixed(1)}s` : `${selectedInfo.selected.toLocaleString()} selected`;
    clearFilter.classList.toggle("hidden", !filterInput.value);
    if (!ctx.q) {
      $("treeFilterInfo").classList.add("hidden");
      $("treeFilterInfo").textContent = "";
    } else {
      const matches = allFiles().filter((file) => file.rel.toLowerCase().includes(ctx.q)).length;
      $("treeFilterInfo").classList.remove("hidden");
      $("treeFilterInfo").textContent = `${matches.toLocaleString()} matching file${matches === 1 ? "" : "s"}`;
    }
    box.scrollTop = scrollTop;
    if (focusedRel) {
      box.querySelector(`[data-rel="${CSS.escape(focusedRel)}"] input`)?.focus();
    }
  };
  const notify = (preview = true) => {
    opts.onChange();
    if (preview)
      opts.onPreview();
  };
  const setExcluded = (rel, exclude) => {
    if (!state.tree)
      return;
    const result = toggleFolder(state.tree, state.excluded, rel, exclude, state.included, pathOptions());
    state.excluded = result.excluded;
    state.included = result.included;
    const files = clearFileOverridesUnder(rel, state.excludedFiles, state.includedFiles, pathOptions());
    state.excludedFiles = files.excludedFiles;
    state.includedFiles = files.includedFiles;
    if (exclude)
      state.expanded.add(rel);
    prune();
    render();
    notify();
  };
  const setFileSelected = (file, select) => {
    const result = toggleFile(file.rel, !select, state.excludedFiles, state.includedFiles, pathOptions());
    state.excludedFiles = result.excludedFiles;
    state.includedFiles = result.includedFiles;
    prune();
    render();
    notify();
  };
  const resetSelection = () => {
    state.excluded = new Set;
    state.included = new Set;
    state.excludedFiles = new Set;
    state.includedFiles = new Set;
  };
  const setScan = (scan, reset) => {
    state.lastScan = scan;
    state.tree = scan.tree;
    if (reset) {
      resetSelection();
      state.expanded = new Set;
      state.filterQuery = "";
      filterInput.value = "";
    }
    prune();
    render();
    opts.onChange();
  };
  filterInput.addEventListener("input", () => {
    state.filterQuery = filterInput.value;
    box.scrollTop = 0;
    render();
  });
  filterInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape")
      return;
    filterInput.value = "";
    state.filterQuery = "";
    box.scrollTop = 0;
    render();
  });
  clearFilter.addEventListener("click", () => {
    filterInput.value = "";
    state.filterQuery = "";
    filterInput.focus();
    render();
  });
  $("btnExpandAll").addEventListener("click", () => {
    if (!state.tree)
      return;
    state.expanded = new Set(collectRels(state.tree));
    render();
  });
  $("btnCollapseAll").addEventListener("click", () => {
    state.expanded = new Set;
    render();
  });
  $("btnAll").addEventListener("click", () => {
    if (!state.tree)
      return;
    resetSelection();
    render();
    notify();
  });
  $("btnNone").addEventListener("click", () => {
    if (!state.tree)
      return;
    state.excluded = new Set(topLevelRels(state.tree));
    state.included = new Set;
    state.excludedFiles = new Set(state.tree.files.map((file) => file.rel));
    state.includedFiles = new Set;
    render();
    notify();
  });
  const focus = () => {
    filterInput.focus();
    filterInput.select();
  };
  return {
    setScan,
    refresh: render,
    selected,
    selectedBytes,
    focus,
    resetSelection
  };
}

// src/client/plan.ts
var warningIcon = (severity) => {
  if (severity === "blocker")
    return "alert-octagon";
  if (severity === "warning")
    return "alert-triangle";
  if (severity === "success")
    return "check-circle";
  return "info";
};
var folderRows = (p) => {
  if (!p.byFolder.length) {
    return `<p class="empty-note">No files are selected yet.</p>`;
  }
  const max = Math.max(1, ...p.byFolder.map((folder) => folder.estOutputBytes));
  return p.byFolder.slice(0, 12).map((folder) => {
    const count = folder.convertCount + folder.copyCount;
    const width = Math.max(2, folder.estOutputBytes / max * 100);
    return `<div class="folder-row">
        <span class="folder-name" title="${escapeHtml(folder.rel)}">${escapeHtml(folder.rel)}</span>
        <span class="folder-counts">${count.toLocaleString()} files</span>
        <span class="folder-counts">${fmt(folder.estOutputBytes)}</span>
        <div class="folder-bar" aria-hidden="true"><div style="width:${width.toFixed(1)}%"></div></div>
      </div>`;
  }).join("");
};
var healthWarnings = (health) => {
  if (!health)
    return [];
  const out = [];
  const failed = health.checks.filter((check) => check.status === "fail");
  const warned = health.checks.filter((check) => check.status === "warn");
  for (const check of failed.slice(0, 2)) {
    out.push({
      severity: "blocker",
      title: check.label,
      body: check.detail,
      action: { label: "Open health", kind: "health" }
    });
  }
  if (failed.length > 2) {
    out.push({
      severity: "blocker",
      title: `${failed.length - 2} more blocking checks`,
      body: "Open Health to see every check before starting.",
      action: { label: "Open health", kind: "health" }
    });
  }
  for (const check of warned.slice(0, 2)) {
    out.push({ severity: "warning", title: check.label, body: check.detail });
  }
  return out;
};
var warningsFor = (p) => {
  const out = [];
  const total = p.convert + p.copy;
  if (!total) {
    out.push({
      severity: "info",
      title: "Nothing selected",
      body: "Use the Library pane or the Select step to include at least one image."
    });
  }
  if (!p.budget.fits) {
    const first = p.budget.dropSuggestions[0];
    out.push({
      severity: "warning",
      title: `Over budget by ${fmt(p.budget.overBy)}`,
      body: first ? `Dropping ${first.rel} would bring the plan to ${fmt(first.runningTotalAfterDrop)}${first.getsUnderBudget ? " — under budget." : ", still over budget."}` : "The projected output is larger than the storage budget.",
      action: { label: "Review by folder", kind: "budget" }
    });
  }
  if (p.freeBytes != null && p.estOutputBytes > p.freeBytes) {
    out.push({
      severity: "blocker",
      title: "Not enough free space",
      body: `The plan needs ${fmt(p.estOutputBytes)}, but only ${fmt(p.freeBytes)} is free on the destination volume.`
    });
  }
  if (p.health) {
    out.push(...healthWarnings(p.health));
  }
  if (p.skip > 0) {
    out.push({
      severity: "info",
      title: `${p.skip.toLocaleString()} file${p.skip === 1 ? "" : "s"} will be skipped`,
      body: "They are outside the selected source types, under the size floor, or excluded by the recipe."
    });
  }
  const scan = state.lastScan;
  if (scan?.riskyNames.length) {
    out.push({
      severity: "warning",
      title: `${scan.riskyNames.length} risky folder name${scan.riskyNames.length === 1 ? "" : "s"}`,
      body: "A non-standard slash character can break copied paths. Review the Library before running."
    });
  }
  if (scan?.deadFolders.length) {
    out.push({
      severity: "info",
      title: `${scan.deadFolders.length} unreadable folder${scan.deadFolders.length === 1 ? "" : "s"} skipped`,
      body: "The scan could not enter these folders. The rest of the library is unaffected."
    });
  }
  if (scan && scan.skipped.length) {
    out.push({
      severity: "info",
      title: `${scan.skipped.length} file${scan.skipped.length === 1 ? "" : "s"} skipped during scan`,
      body: "Files that could not be read are left out of the plan."
    });
  }
  if ((state.status?.redundantRoots ?? []).length === 0 && total > 0) {
    out.push({
      severity: "info",
      title: "Originals are the only copy",
      body: "Conversion never modifies them. Keep a separate backup before any cleanup."
    });
  }
  if (state.running) {
    out.push({
      severity: "info",
      title: "A run is in progress",
      body: "The Plan updates after the run finishes. Open Run to watch live progress."
    });
  }
  return out;
};
function createPlan(opts) {
  const warningHost = $("planWarnings");
  const render = () => {
    const p = state.preview;
    const spec = state.formatSpecs[state.currentFormat];
    if (!p) {
      $("planHeroFrom").textContent = "–";
      $("planHeroTo").textContent = "–";
      $("planHeroSub").textContent = "Scan a library to see what will be produced.";
      const delta = document.getElementById("planHeroDelta");
      if (delta)
        delta.textContent = "";
      for (const id of ["statConvert", "statCopy", "statSkip"])
        $(id).textContent = "–";
      $("statOut").textContent = "–";
      $("budgetNote").textContent = "No scan yet.";
      $("budgetFill").style.transform = "scaleX(0)";
      $("budgetFill").classList.remove("over");
      warningHost.innerHTML = "";
      $("folderSplit").innerHTML = `<p class="empty-note">Scan a library to see the folder split.</p>`;
      $("folderMeta").textContent = "";
      $("planHeadMeta").textContent = "Waiting for scan";
      $("btnStart").disabled = true;
      $("btnStart").textContent = "Start conversion";
      $("startHint").textContent = "Choose a source folder to begin.";
      $("syncMeta").textContent = "what's new";
      $("estimateMeta").textContent = "real sample";
      $("compareMeta").textContent = "visual";
      $("auditMeta").textContent = "3 reports";
      return;
    }
    const totalBytes = p.sourceBytes;
    const saved = totalBytes > 0 ? 100 - p.estOutputBytes / totalBytes * 100 : null;
    $("planHeroFrom").textContent = fmt(totalBytes);
    $("planHeroTo").textContent = fmt(p.estOutputBytes);
    const delta = document.getElementById("planHeroDelta");
    if (delta) {
      delta.textContent = saved == null ? "" : `${saved >= 0 ? "−" : "+"}${Math.abs(saved).toFixed(0)}%`;
      delta.dataset.tone = saved != null && saved >= 0 ? "good" : "bad";
    }
    $("planHeroSub").textContent = `${p.formatLabel} q${spec ? Math.round(Number($("quality").value)) : "—"} · ${p.estOutputFiles.toLocaleString()} output files`;
    $("statConvert").textContent = p.convert.toLocaleString();
    $("statCopy").textContent = p.copy.toLocaleString();
    $("statSkip").textContent = p.skip.toLocaleString();
    $("statOut").textContent = fmt(p.estOutputBytes);
    const budget = p.budget;
    const frac = budget.budgetBytes > 0 ? budget.totalEstBytes / budget.budgetBytes : 0;
    setWidth($("budgetFill"), frac);
    $("budgetFill").classList.toggle("over", !budget.fits);
    $("budgetCard").classList.toggle("over", !budget.fits);
    let budgetNote = "";
    if (!budget.fits) {
      budgetNote = `Over the ${fmt(budget.budgetBytes)} budget by ${fmt(budget.overBy)}. `;
      const first = budget.dropSuggestions[0];
      if (first) {
        budgetNote += `Dropping "${first.rel}" would bring it to ${fmt(first.runningTotalAfterDrop)}` + (first.getsUnderBudget ? " (under budget)." : ", still not enough.");
      }
    } else {
      budgetNote = `Fits the ${fmt(budget.budgetBytes)} budget · ${(frac * 100).toFixed(2)}% used.`;
    }
    $("budgetNote").textContent = budgetNote;
    $("budgetNoteShort").textContent = `Headroom for the projected output. Currently ${fmt(budget.budgetBytes)}.`;
    $("planHeadMeta").textContent = `${p.formatLabel} · ${p.estOutputFiles.toLocaleString()} outputs`;
    const warnings = warningsFor(p);
    warningHost.innerHTML = warnings.map((warning) => `<div class="warning-card" data-severity="${warning.severity}">
        <span class="warning-icon">${icon(warningIcon(warning.severity), 15)}</span>
        <span class="warning-text"><b>${escapeHtml(warning.title)}</b>${warning.body ? `<br>${escapeHtml(warning.body)}` : ""}</span>
        ${warning.action ? `<button class="warning-action" type="button" data-plan-action="${warning.action.kind}">${escapeHtml(warning.action.label)}</button>` : ""}
      </div>`).join("");
    $("folderSplit").innerHTML = folderRows(p);
    $("folderMeta").textContent = `${p.byFolder.length.toLocaleString()} folder${p.byFolder.length === 1 ? "" : "s"} in scope`;
    const canRun = p.health?.canRun !== false;
    const total = p.convert + p.copy;
    $("btnStart").disabled = state.running || state.starting || total === 0 || !canRun;
    $("btnStart").textContent = state.running ? "Run in progress" : state.starting ? "Starting…" : total > 0 ? `Convert ${total.toLocaleString()} file${total === 1 ? "" : "s"}` : "Nothing selected";
    const estimate = state.lastEstimate;
    const projection = `${fmt(p.sourceBytes)} → ${fmt(p.estOutputBytes)}`;
    const time = estimate ? ` · ~${fmtDuration(estimate.projectedSeconds)}` : "";
    $("startHint").textContent = state.running ? "Progress is in the floating run dock." : total === 0 ? "Include at least one file in the Library." : `${projection}${time} · undo available after the run`;
    $("syncMeta").textContent = state.lastSync ? `${state.lastSync.pendingCount.toLocaleString()} pending` : "what's new";
    $("estimateMeta").textContent = estimate ? `${estimate.sampleSize.toLocaleString()} sampled` : "real sample";
    $("compareMeta").textContent = total ? `${Math.min(6, total)} picks` : "visual";
    $("auditMeta").textContent = "3 reports";
  };
  $("btnStart").addEventListener("click", opts.onStart);
  $("btnEstimate").addEventListener("click", opts.onEstimate);
  $("btnSync").addEventListener("click", opts.onSync);
  $("btnCompare").addEventListener("click", opts.onCompare);
  $("btnAudit").addEventListener("click", opts.onAudit);
  warningHost.addEventListener("click", (event) => {
    const target = event.target.closest("[data-plan-action]");
    if (!target)
      return;
    if (target.dataset.planAction === "health")
      opts.onHealth();
    if (target.dataset.planAction === "budget")
      opts.onReviewBudget();
  });
  return { render };
}
var fmtDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0)
    return "—";
  if (seconds < 60)
    return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};

// src/client/run-lifecycle.ts
function createRunLifecycle(options) {
  let jobsTimer = null;
  let reconnecting = false;
  const isActive = () => state.running || state.starting;
  const render = () => {
    options.render();
  };
  const setActivity = (file) => {
    if (!file)
      return;
    state.activity.push(file);
    if (state.activity.length > 500)
      state.activity.splice(0, state.activity.length - 500);
    state.run.lastRel = file.rel;
    state.run.lastStatus = file.status;
  };
  const finish = (p) => {
    state.es?.close();
    state.es = null;
    state.currentJob = null;
    state.running = false;
    state.starting = false;
    state.lastJobId = p.jobId ?? state.run.id;
    state.lastSummary = p.summary ?? null;
    state.lastManifestId = p.manifestId ?? null;
    const summary = p.summary;
    if (summary) {
      state.run.total = summary.total;
      state.run.done = summary.done;
      state.run.converted = summary.converted;
      state.run.copied = summary.copied;
      state.run.skipped = summary.skipped;
      state.run.failed = summary.failed;
      state.run.bytes = summary.bytes;
      state.run.elapsedSeconds = summary.elapsedSeconds;
      state.run.etaSeconds = null;
    }
    state.run.state = summary?.note === "cancelled" ? "cancelled" : p.state === "failed" || (summary?.failed ?? 0) > 0 && summary?.converted === 0 && summary?.copied === 0 ? "failed" : "done";
    state.run.note = null;
    state.run.startingRel = null;
    state.run.startingBytes = null;
    state.run.inFlight = 0;
    options.lockFormat(false);
    render();
    if (summary?.note === "cancelled") {
      options.onInfo(`Cancelled. ${(summary?.done ?? 0).toLocaleString()} of ${(summary?.total ?? 0).toLocaleString()} done; those files stay on disk and will be skipped next time.`);
    } else if (summary) {
      const failed = summary.failed ? `, ${summary.failed.toLocaleString()} failed` : "";
      options.onInfo(`Done. ${summary.converted.toLocaleString()} converted, ${summary.copied.toLocaleString()} copied${failed} → ${fmt(summary.bytes)}.`);
    }
    options.onFinished();
  };
  const handleEvent = (event) => {
    if (event.type === "hello") {
      if (event.jobId)
        state.run.id = event.jobId;
      if (event.state) {
        state.run.state = event.state;
        if (event.state === "paused")
          state.run.note = "Paused";
      }
    } else if (event.type === "start" || event.type === "resumed") {
      state.run.state = "running";
      state.running = true;
      state.starting = false;
      if (event.total != null)
        state.run.total = event.total;
      state.run.note = event.message ?? null;
    } else if (event.type === "progress") {
      state.run.state = "running";
      state.running = true;
      state.starting = false;
      state.run.total = event.total ?? state.run.total;
      state.run.done = event.done ?? state.run.done;
      state.run.converted = event.converted ?? state.run.converted;
      state.run.copied = event.copied ?? state.run.copied;
      state.run.skipped = event.skipped ?? state.run.skipped;
      state.run.failed = event.failed ?? state.run.failed;
      state.run.bytes = event.bytes ?? state.run.bytes;
      state.run.etaSeconds = event.etaSeconds ?? null;
      state.run.elapsedSeconds = event.elapsedSeconds ?? state.run.elapsedSeconds;
      state.run.inFlight = event.inFlight ?? state.run.inFlight;
      if (event.starting) {
        state.run.startingRel = event.starting.rel;
        state.run.startingBytes = event.starting.bytes;
      }
      setActivity(event.file);
      if (event.file) {
        state.run.startingRel = null;
        state.run.startingBytes = null;
      }
      state.run.note = event.inFlight ? `Converting · ${event.inFlight} in flight` : null;
    } else if (event.type === "paused") {
      state.run.state = "paused";
      state.running = true;
      state.starting = false;
      state.run.note = event.message ?? "Paused";
      state.run.inFlight = 0;
      state.run.startingRel = null;
      state.run.startingBytes = null;
      options.onInfo(event.message ?? "Paused after the current files finished.");
    } else if (event.type === "finish") {
      finish(event);
      return;
    } else if (event.type === "error") {
      state.es?.close();
      state.es = null;
      state.currentJob = null;
      state.running = false;
      state.starting = false;
      state.run.state = "failed";
      state.run.note = event.message ?? "The run failed.";
      state.lastJobError = event.message ?? "The run failed.";
      state.run.inFlight = 0;
      state.run.startingRel = null;
      state.run.startingBytes = null;
      options.lockFormat(false);
      options.onError(event.message ?? "The run failed.");
      options.onFinished();
    }
    render();
  };
  const stream = (jobId) => {
    state.es?.close();
    const source = new EventSource(`/api/stream/${encodeURIComponent(jobId)}`);
    state.es = source;
    source.onmessage = (message) => {
      try {
        handleEvent(JSON.parse(message.data));
      } catch {}
    };
    source.onerror = () => {
      if (!state.running || state.es !== source) {
        source.close();
        return;
      }
      source.close();
      state.es = null;
      if (reconnecting)
        return;
      reconnecting = true;
      state.run.note = "Connection lost — reconnecting…";
      render();
      window.setTimeout(() => {
        (async () => {
          try {
            await api(`job/state?id=${encodeURIComponent(jobId)}`);
            await attach(jobId, true);
          } catch {
            state.running = false;
            state.currentJob = null;
            state.run.state = "failed";
            state.run.note = "Lost contact with the server. The files already written stay on disk.";
            options.lockFormat(false);
            options.onError(state.run.note);
            render();
          } finally {
            reconnecting = false;
          }
        })();
      }, 1200);
    };
  };
  const hydrate = (snapshot) => {
    state.run.id = snapshot.id;
    state.run.state = snapshot.state === "idle" ? "running" : snapshot.state;
    state.run.total = snapshot.total;
    state.run.done = snapshot.done;
    state.run.converted = snapshot.converted;
    state.run.copied = snapshot.copied;
    state.run.skipped = snapshot.skipped;
    state.run.failed = snapshot.failed;
    state.run.bytes = snapshot.bytes;
    state.run.inFlight = snapshot.inFlight;
    state.run.note = snapshot.state === "paused" ? "Paused after the current files finished." : snapshot.state === "running" ? null : state.run.note;
    state.running = snapshot.state === "running" || snapshot.state === "paused";
    state.starting = false;
    state.currentJob = snapshot.id;
    state.lastJobId = snapshot.id;
    options.lockFormat(true);
    const jobs = document.getElementById("jobs");
    if (jobs && snapshot.jobs) {
      jobs.value = String(snapshot.jobs);
      const out = document.getElementById("jobsOut");
      if (out)
        out.textContent = String(snapshot.jobs);
    }
    const cpuLimit = document.getElementById("cpuLimit");
    if (cpuLimit && snapshot.cpuLimit) {
      cpuLimit.value = String(snapshot.cpuLimit);
      const out = document.getElementById("cpuLimitOut");
      if (out)
        out.textContent = `${snapshot.cpuLimit}%`;
    }
    render();
  };
  const attach = async (jobId, replay) => {
    state.currentJob = jobId;
    state.running = true;
    state.starting = true;
    state.run.id = jobId;
    state.run.state = "running";
    options.lockFormat(true);
    render();
    if (replay) {
      try {
        const snapshot = await api(`job/state?id=${encodeURIComponent(jobId)}`);
        hydrate(snapshot);
      } catch {
        state.running = false;
        state.starting = false;
        state.currentJob = null;
        options.lockFormat(false);
        render();
        throw new Error("That run is no longer available.");
      }
    }
    state.starting = false;
    state.running = true;
    stream(jobId);
    render();
  };
  const start = async (runOptions = {}) => {
    if (isActive())
      return;
    state.starting = true;
    render();
    try {
      await options.save();
      const jobsInput = document.getElementById("jobs");
      const cpuLimitInput = document.getElementById("cpuLimit");
      const overwrite = document.getElementById("overwrite");
      const onlyNew = document.getElementById("onlyNew");
      const response = await api("run", {
        method: "POST",
        body: {
          jobs: jobsInput?.valueAsNumber ?? 2,
          cpuLimit: cpuLimitInput?.valueAsNumber ?? 70,
          overwrite: Boolean(overwrite?.checked),
          onlyNew: Boolean(runOptions.onlyNew ?? onlyNew?.checked),
          policy: options.policy()
        }
      });
      resetRun(response.total);
      state.run.id = response.jobId;
      state.run.state = "running";
      state.starting = false;
      state.running = true;
      state.currentJob = response.jobId;
      state.lastJobId = response.jobId;
      state.lastManifestId = null;
      state.lastJobError = null;
      options.lockFormat(true);
      options.openRunView();
      render();
      stream(response.jobId);
    } catch (error) {
      state.starting = false;
      state.running = false;
      state.currentJob = null;
      options.lockFormat(false);
      render();
      options.onError(error.message);
    }
  };
  const post = async (path, success) => {
    if (!state.currentJob)
      return false;
    try {
      await api(path, { method: "POST" });
      if (success) {
        state.run.note = success;
        render();
      }
      return true;
    } catch (error) {
      options.onError(error.message);
      return false;
    }
  };
  const pause = async () => {
    await post(`pause/${encodeURIComponent(state.currentJob ?? "")}`, "Pausing after the current files finish…");
  };
  const resume = async () => {
    if (!state.currentJob)
      return;
    const ok = await post(`resume/${encodeURIComponent(state.currentJob)}`);
    if (!ok)
      return;
    state.run.state = "running";
    state.run.note = "Resuming…";
    state.running = true;
    render();
  };
  const cancel = async () => {
    await post(`cancel/${encodeURIComponent(state.currentJob ?? "")}`, "Cancelling…");
  };
  const setJobs = (jobs) => {
    if (!state.currentJob)
      return;
    if (jobsTimer)
      clearTimeout(jobsTimer);
    jobsTimer = setTimeout(() => {
      api(`jobs/${encodeURIComponent(state.currentJob ?? "")}`, {
        method: "POST",
        body: { jobs }
      }).catch((error) => options.onError(error.message));
    }, 200);
  };
  let cpuLimitTimer = null;
  const setCpuLimit = (cpuLimit) => {
    if (!state.currentJob)
      return;
    if (cpuLimitTimer)
      clearTimeout(cpuLimitTimer);
    cpuLimitTimer = setTimeout(() => {
      api(`jobs/${encodeURIComponent(state.currentJob ?? "")}`, {
        method: "POST",
        body: { cpuLimit }
      }).catch((error) => options.onError(error.message));
    }, 200);
  };
  return { start, attach, pause, resume, cancel, setJobs, setCpuLimit };
}

// src/client/split-panes.ts
var STORAGE_KEY = "picmagick_pane_ratios";
var MIN_PANE_PX = 220;
function initSplitPanes() {
  const workspace = $("workspace");
  const resizerLib = $("resizerLib");
  const resizerPlan = $("resizerPlan");
  if (!workspace || !resizerLib || !resizerPlan)
    return;
  const applyRatios = (r1, r2, r3, save = true) => {
    const sum = r1 + r2 + r3;
    if (sum <= 0)
      return;
    const n1 = r1 / sum * 3;
    const n2 = r2 / sum * 3;
    const n3 = r3 / sum * 3;
    workspace.style.setProperty("--w-pane-1", `${n1.toFixed(4)}fr`);
    workspace.style.setProperty("--w-pane-2", `${n2.toFixed(4)}fr`);
    workspace.style.setProperty("--w-pane-3", `${n3.toFixed(4)}fr`);
    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([n1, n2, n3]));
      } catch {}
    }
  };
  const resetToEqual = () => {
    workspace.style.removeProperty("--w-pane-1");
    workspace.style.removeProperty("--w-pane-2");
    workspace.style.removeProperty("--w-pane-3");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const [r1, r2, r3] = JSON.parse(saved);
      if (Number.isFinite(r1) && Number.isFinite(r2) && Number.isFinite(r3) && r1 > 0 && r2 > 0 && r3 > 0) {
        applyRatios(r1, r2, r3, false);
      }
    }
  } catch {}
  resizerLib.addEventListener("dblclick", () => resetToEqual());
  resizerPlan.addEventListener("dblclick", () => resetToEqual());
  const setupResizer = (resizer, which) => {
    resizer.addEventListener("pointerdown", (event) => {
      if (event.button !== 0)
        return;
      event.preventDefault();
      const panes = workspace.querySelectorAll(":scope > .pane");
      if (panes.length < 3)
        return;
      const p1 = panes[0];
      const p2 = panes[1];
      const p3 = panes[2];
      const startX = event.clientX;
      const startW1 = p1.getBoundingClientRect().width;
      const startW2 = p2.getBoundingClientRect().width;
      const startW3 = p3.getBoundingClientRect().width;
      const totalW = startW1 + startW2 + startW3;
      if (totalW <= 0)
        return;
      resizer.classList.add("is-active");
      document.body.classList.add("is-resizing");
      const onPointerMove = (e) => {
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
    resizer.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 36 : 14;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const panes = workspace.querySelectorAll(":scope > .pane");
        if (panes.length < 3)
          return;
        const startW1 = panes[0].getBoundingClientRect().width;
        const startW2 = panes[1].getBoundingClientRect().width;
        const startW3 = panes[2].getBoundingClientRect().width;
        const totalW = startW1 + startW2 + startW3;
        if (totalW <= 0)
          return;
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

// src/client/views/audit.ts
var loading = (label) => `<div class="empty-state"><span class="spinner"></span><p class="empty-title">${escapeHtml(label)}</p><p class="empty-note">This runs locally; nothing leaves your machine.</p></div>`;
var errorBox = (message) => `<p class="inline-msg">${escapeHtml(message)}</p>`;
var base = (rel) => rel.split(/[\\/]/).pop() ?? rel;
function createAuditView(actions) {
  let tab = "sync";
  let busy = null;
  let lastFocus = null;
  let syncData = null;
  let dupeData = null;
  let datesData = null;
  const drawer = $("auditDrawer");
  const backdrop = $("auditBackdrop");
  const setTab = (next, fetchIt = true) => {
    tab = next;
    const tabs = { sync: "tabSync", duplicates: "tabDuplicates", dates: "tabDates" };
    const panels = { sync: "syncBox", duplicates: "dupeBox", dates: "datesBox" };
    for (const [name, id] of Object.entries(tabs)) {
      const button = $(id);
      button.setAttribute("aria-selected", String(name === next));
    }
    for (const [name, id] of Object.entries(panels)) {
      $(id).classList.toggle("hidden", name !== next);
    }
    if (!fetchIt)
      return;
    if (next === "sync")
      runSync();
    if (next === "duplicates")
      runDuplicates();
    if (next === "dates")
      runDates();
  };
  const renderSync = (data) => {
    syncData = data;
    state.lastSync = data;
    const pending = data.pendingCount;
    const changed = data.changed.slice(0, 6).map((entry) => escapeHtml(base(entry.rel))).join(", ");
    $("syncMeta").textContent = pending ? `${pending.toLocaleString()} pending` : "up to date";
    $("syncBox").innerHTML = `<div class="result-box">
      <h4>Sync <small>${data.upToDateCount.toLocaleString()} already done</small></h4>
      <div class="summary-stats">
        <div class="summary-stat"><span class="micro-label">New files</span><b${data.newCount ? ' style="color:var(--status-warning)"' : ""}>${data.newCount.toLocaleString()}</b></div>
        <div class="summary-stat"><span class="micro-label">Changed</span><b${data.changedCount ? ' style="color:var(--status-warning)"' : ""}>${data.changedCount.toLocaleString()}</b></div>
        <div class="summary-stat"><span class="micro-label">Up to date</span><b style="color:var(--status-success)">${data.upToDateCount.toLocaleString()}</b></div>
        <div class="summary-stat"><span class="micro-label">Pending output</span><b>${fmt(data.estOutputBytes)}</b></div>
      </div>
      <p>${data.pendingSourceBytes ? `${fmt(data.pendingSourceBytes)} of source still needs work.` : "No source bytes are pending."}</p>
      ${data.orphanCount ? `<p class="warn">${data.orphanCount.toLocaleString()} output file(s) (${fmt(data.orphanBytes)}) have no matching source. Left alone — nothing is deleted automatically.</p>` : ""}
      ${changed ? `<p class="muted">Changed: ${changed}${data.changed.length > 6 ? "…" : ""}</p>` : ""}
      ${pending ? `<div class="drawer-actions"><button class="btn primary sm" type="button" data-sync-run>Convert pending ${pending.toLocaleString()}</button><button class="btn ghost sm" type="button" data-audit-run="sync">Run again</button></div>` : `<p class="ok">Everything in scope is already converted.</p><div class="drawer-actions"><button class="btn ghost sm" type="button" data-audit-run="sync">Run again</button></div>`}
    </div>`;
  };
  const runSync = async () => {
    if (busy)
      return;
    busy = "sync";
    $("syncBox").innerHTML = loading("Comparing input against output…");
    try {
      const data = await api("sync", { method: "POST", body: { policy: actions.policy() } });
      renderSync(data);
    } catch (error) {
      $("syncBox").innerHTML = `<h4>Sync</h4>${errorBox(error.message)}<div class="drawer-actions"><button class="btn ghost sm" type="button" data-audit-run="sync">Try again</button></div>`;
      $("syncMeta").textContent = "unavailable";
    } finally {
      busy = null;
    }
  };
  const renderDuplicates = (data) => {
    dupeData = data;
    $("auditMeta").textContent = data.groupCount ? `${data.groupCount} groups` : "3 reports";
    if (!data.groupCount) {
      $("dupeBox").innerHTML = `<div class="result-box">
        <h4>Duplicates <small>${data.hashedFiles.toLocaleString()} hashed</small></h4>
        <p class="ok">No duplicates found in ${data.hashedFiles.toLocaleString()} hashed files.</p>
        <div class="drawer-actions"><button class="btn ghost sm" type="button" data-audit-run="duplicates">Run again</button></div>
      </div>`;
      return;
    }
    const groups = data.groups.slice(0, 10);
    const listed = groups.reduce((sum, group) => sum + Math.max(0, group.members.length - 1), 0);
    $("dupeBox").innerHTML = `<div class="result-box">
      <h4>Duplicates <small>${data.groupCount.toLocaleString()} groups</small></h4>
      <p><b>${data.duplicateFiles.toLocaleString()}</b> files are duplicates, wasting <b>${fmt(data.duplicateBytes)}</b> if all converted.</p>
      ${groups.map((group) => `<div class="dupe-group">
        <div class="dupe-head"><span>${escapeHtml(base(group.members[0].rel))}</span><span class="muted">${group.members.length} copies · ${fmt(group.size)}</span></div>
        <div class="dupe-members">${group.members.slice(0, 3).map((m) => escapeHtml(base(m.rel))).join(" · ")}${group.members.length > 3 ? " …" : ""}${group.spreadAcrossFolders ? " · across folders" : ""}</div>
      </div>`).join("")}
      ${data.groupCount > groups.length ? `<p class="muted">Showing the first ${groups.length} of ${data.groupCount.toLocaleString()} groups.</p>` : ""}
      <div class="drawer-actions">
        <button class="btn sm" type="button" data-exclude-dupes="${listed}">Exclude ${listed.toLocaleString()} duplicates</button>
        <button class="btn ghost sm" type="button" data-audit-run="duplicates">Run again</button>
      </div>
    </div>`;
  };
  const runDuplicates = async () => {
    if (busy)
      return;
    busy = "duplicates";
    $("dupeBox").innerHTML = loading("Hashing files…");
    try {
      const data = await api("duplicates", { method: "POST", body: { maxHash: 6000 } });
      renderDuplicates(data);
    } catch (error) {
      $("dupeBox").innerHTML = `<h4>Duplicates</h4>${errorBox(error.message)}<div class="drawer-actions"><button class="btn ghost sm" type="button" data-audit-run="duplicates">Try again</button></div>`;
    } finally {
      busy = null;
    }
  };
  const renderDates = (data) => {
    datesData = data;
    const years = Object.entries(data.byYear).sort((a, b) => Number(b[0]) - Number(a[0]));
    $("datesBox").innerHTML = `<div class="result-box">
      <h4>Dates <small>${data.scanned.toLocaleString()} files read</small></h4>
      <div class="summary-stats">
        <div class="summary-stat"><span class="micro-label">With EXIF date</span><b style="color:var(--status-success)">${data.withExif.toLocaleString()}</b></div>
        <div class="summary-stat"><span class="micro-label">From filename</span><b>${data.fromNameOnly.toLocaleString()}</b></div>
        <div class="summary-stat"><span class="micro-label">Undated</span><b style="color:var(--status-${data.undated.length ? "warning" : "success"})">${data.undated.length.toLocaleString()}</b></div>
        <div class="summary-stat"><span class="micro-label">In scope</span><b>${data.inScope.toLocaleString()}</b></div>
      </div>
      ${data.undated.length ? `<p>e.g. ${data.undated.slice(0, 3).map((path) => escapeHtml(base(path))).join(", ")}</p>` : `<p class="ok">Every scanned file has a date.</p>`}
      ${data.truncated ? `<p class="warn">${data.omitted.toLocaleString()} files were outside the sampled limit; raise the limit for a complete audit.</p>` : ""}
      ${years.length ? `<div class="year-grid">${years.map(([year, count]) => `<span class="year-chip">${escapeHtml(year)} <b>${count.toLocaleString()}</b></span>`).join("")}</div>` : ""}
      <div class="drawer-actions"><button class="btn ghost sm" type="button" data-audit-run="dates">Run again</button></div>
    </div>`;
  };
  const runDates = async () => {
    if (busy)
      return;
    busy = "dates";
    $("datesBox").innerHTML = loading("Reading EXIF dates…");
    try {
      const data = await api("dates", { method: "POST", body: {} });
      renderDates(data);
    } catch (error) {
      $("datesBox").innerHTML = `<h4>Dates</h4>${errorBox(error.message)}<div class="drawer-actions"><button class="btn ghost sm" type="button" data-audit-run="dates">Try again</button></div>`;
    } finally {
      busy = null;
    }
  };
  const open = (next = "sync") => {
    lastFocus = document.activeElement;
    drawer.classList.remove("hidden");
    backdrop.classList.remove("hidden");
    drawer.setAttribute("aria-hidden", "false");
    $("auditTitle").textContent = next === "sync" ? "Library sync" : next === "duplicates" ? "Duplicate files" : "Capture dates";
    setTab(next, true);
    window.setTimeout(() => $(next === "sync" ? "tabSync" : next === "duplicates" ? "tabDuplicates" : "tabDates").focus(), 30);
  };
  const close = () => {
    drawer.classList.add("hidden");
    backdrop.classList.add("hidden");
    drawer.setAttribute("aria-hidden", "true");
    lastFocus?.focus?.();
  };
  const isOpen = () => !drawer.classList.contains("hidden");
  const handleKey = (event) => {
    if (!isOpen())
      return false;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return true;
    }
    return false;
  };
  $("tabSync").addEventListener("click", () => setTab("sync", true));
  $("tabDuplicates").addEventListener("click", () => setTab("duplicates", true));
  $("tabDates").addEventListener("click", () => setTab("dates", true));
  $("auditClose").addEventListener("click", close);
  backdrop.addEventListener("click", close);
  drawer.addEventListener("click", (event) => {
    const target = event.target;
    if (target.closest("[data-audit-run]")) {
      const which = target.closest("[data-audit-run]")?.dataset.auditRun;
      if (which === "sync")
        runSync();
      if (which === "duplicates")
        runDuplicates();
      if (which === "dates")
        runDates();
      return;
    }
    if (target.closest("[data-sync-run]")) {
      close();
      actions.startRun({ onlyNew: true });
      return;
    }
    const exclude = target.closest("[data-exclude-dupes]");
    if (exclude) {
      const listed = dupeData?.groups.slice(0, 10) ?? [];
      const count = listed.reduce((sum, group) => sum + Math.max(0, group.members.length - 1), 0);
      if (!count)
        return;
      (async () => {
        const ok = await actions.confirm({
          title: "Exclude duplicate files?",
          body: `<p class="modal-copy">This deselects <strong>${count.toLocaleString()} duplicate files</strong> from the conversion. The originals stay on disk; only the selection changes.</p>
                 <p class="modal-copy">The first file in each duplicate group stays selected.</p>`,
          confirmLabel: `Exclude ${count.toLocaleString()} files`,
          danger: true
        });
        if (!ok)
          return;
        let removed = 0;
        for (const group of listed) {
          for (const member of group.members.slice(1)) {
            state.excludedFiles.add(member.rel);
            state.includedFiles.delete(member.rel);
            removed++;
          }
        }
        actions.refreshTree();
        actions.refreshPreview();
        actions.toast(`Excluded ${removed.toLocaleString()} duplicate files from the selection.`, "success");
      })();
    }
  });
  return { open, close, isOpen, handleKey };
}

// src/client/views/shared.ts
var emptyState = (iconName, title, note) => `<div class="empty-state">
     <svg width="24" height="24" aria-hidden="true"><use href="#i-${iconName}"></use></svg>
     <p class="empty-title">${title}</p>
     <p class="empty-note">${note}</p>
   </div>`;
var checkIcon = (status) => {
  if (status === "ok")
    return "check-circle";
  if (status === "warn")
    return "alert-triangle";
  return "alert-octagon";
};
var statusWord = (status) => status === "ok" ? "OK" : status === "warn" ? "Warning" : "Failed";

// src/client/views/compare.ts
function createCompareView(actions) {
  let split = 50;
  let dimensions = null;
  let busy = false;
  let compareBg = "checker";
  let activeFormat = state.currentFormat;
  let isDraggingSplitter = false;
  const fileList = () => actions.selectedFiles();
  const syncFileSelect = (rel) => {
    const select = $("compareFileSelect");
    const files = fileList();
    if (!files.length && rel) {
      select.innerHTML = `<option value="${escapeHtml(rel)}" selected>${escapeHtml(rel.split(/[\\/]/).pop() ?? rel)}</option>`;
      return;
    }
    select.innerHTML = files.map((f) => {
      const name = f.rel.split(/[\\/]/).pop() ?? f.rel;
      return `<option value="${escapeHtml(f.rel)}"${f.rel === rel ? " selected" : ""}>${escapeHtml(name)}</option>`;
    }).join("");
  };
  const syncFormatSelect = (current) => {
    const select = $("compareFormatSelect");
    const specs = Object.values(state.formatSpecs);
    if (!specs.length) {
      select.innerHTML = `<option value="${current}" selected>${current.toUpperCase()}</option>`;
      return;
    }
    select.innerHTML = specs.map((s) => `<option value="${s.id}"${s.id === current ? " selected" : ""}>${escapeHtml(s.shortLabel || s.label)}</option>`).join("");
  };
  const syncModeSelect = (mode) => {
    const select = $("compareModeSelect");
    if (select)
      select.value = mode;
    for (const button of $("compareModes").querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    }
    const dock = document.getElementById("canvasDock");
    if (dock) {
      for (const btn of dock.querySelectorAll("[data-dock-mode]")) {
        btn.classList.toggle("active", btn.dataset.dockMode === mode);
      }
    }
  };
  const formatDate = (mtime) => {
    if (!mtime)
      return "Captured 2026-01-14 10:32";
    const d = new Date(mtime);
    const pad = (n) => String(n).padStart(2, "0");
    return `Captured ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const renderFacts = (data, _variant) => {
    const origExt = data.originalExt ? data.originalExt.replace(/^\./, "").toUpperCase() : "JPEG";
    const dimText = dimensions ? `${dimensions.width} × ${dimensions.height}` : "4032 × 3024";
    const dateText = formatDate(data.mtime);
    const pathText = data.rel;
    $("compareFacts").innerHTML = `
      <div class="meta-line-primary">${dimText} · ${escapeHtml(origExt)} · ${fmt(data.originalBytes)}</div>
      <div class="meta-line-secondary">${escapeHtml(dateText)}</div>
      <div class="meta-line-secondary" title="${escapeHtml(pathText)}">${escapeHtml(pathText)}</div>
    `;
  };
  const calculateSignalBars = (index, total, quality) => {
    if (total <= 1)
      return 3;
    if (quality <= 35)
      return 1;
    if (quality <= 55)
      return 2;
    if (quality <= 65)
      return 3;
    if (quality <= 75)
      return 4;
    return 5;
  };
  const renderLadder = (data) => {
    const host = $("compareLadder");
    const total = data.variants.length;
    host.innerHTML = data.variants.map((variant, index) => {
      const active = index === state.compareVariant;
      const saving = data.originalBytes > 0 ? Math.max(0, 100 - variant.bytes / data.originalBytes * 100) : 0;
      const savingText = `${saving.toFixed(1)}% smaller`;
      const litBars = calculateSignalBars(index, total, variant.quality);
      let barsHtml = "";
      for (let b = 1;b <= 5; b++) {
        barsHtml += `<span class="signal-bar${b <= litBars ? " lit" : ""}"></span>`;
      }
      return `
          <div class="ladder-card${active ? " active" : ""}" data-variant-index="${index}" data-quality="${variant.quality}">
            <div class="ladder-radio">${active ? '<span class="radio-pip"></span>' : ""}</div>
            <span class="ladder-q">q${variant.quality}</span>
            <span class="ladder-stats">${fmt(variant.bytes)} <span class="ladder-pct">(${savingText})</span></span>
            <div class="signal-meter">${barsHtml}</div>
          </div>
        `;
    }).join("");
    updateActionsFootnote(data);
  };
  const updateActionsFootnote = (data) => {
    const variant = data.variants[Math.min(state.compareVariant, data.variants.length - 1)];
    const applyBtn = document.getElementById("btnCompareApply");
    if (applyBtn && variant) {
      applyBtn.textContent = `[ Use q${variant.quality} ]`;
    }
    const footnote = document.getElementById("compareFootnote");
    if (footnote && variant) {
      const spec = state.formatSpecs[data.format];
      const formatLabel = spec?.shortLabel ?? data.format.toUpperCase();
      footnote.textContent = `${formatLabel} preserves transparency and animation. q${variant.quality} is recommended.`;
    }
  };
  const renderStage = () => {
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
    const zoomScale = state.compareZoom > 0 ? state.compareZoom : 1;
    const scale = state.compareZoom > 0 ? `transform: scale(${zoomScale});` : "";
    const showOriginal = state.compareShowOriginal;
    stage.dataset.mode = state.compareMode;
    stage.dataset.bg = compareBg;
    stage.style.setProperty("--split", `${split}%`);
    const formatLabel = data.format.toUpperCase();
    const saving = data.originalBytes > 0 ? Math.max(0, 100 - variant.bytes / data.originalBytes * 100) : 0;
    const savingText = `${saving.toFixed(1)}% smaller`;
    let stageHtml = "";
    stageHtml += `
      <div class="compare-pane original${state.compareMode === "toggle" && !showOriginal ? " hidden" : ""}">
        <img src="${escapeHtml(data.originalUrl)}" alt="Original" draggable="false" style="${scale}">
      </div>
      <div class="compare-pane variant" style="${state.compareMode === "split" ? `clip-path: inset(0 0 0 ${split}%);` : ""}">
        <img src="${escapeHtml(variant.url)}" alt="${escapeHtml(variant.label)} variant" draggable="false" style="${scale}">
      </div>
    `;
    if (state.compareMode === "split") {
      stageHtml += `
        <div class="compare-split-line" style="left: ${split}%"></div>
        <div class="compare-split-handle" style="left: ${split}%" aria-label="Splitter handle" role="separator" aria-valuenow="${Math.round(split)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18-6-6 6-6"/>
            <path d="m15 6 6 6-6 6"/>
            <path d="M3 12h18"/>
          </svg>
        </div>
      `;
    }
    if (state.compareMode === "split") {
      stageHtml += `
        <div class="frosted-badge stage-badge-top-left">
          <span class="badge-title">ORIGINAL</span>
          <span class="badge-sub">${fmt(data.originalBytes)}</span>
        </div>
        <div class="frosted-badge stage-badge-top-right">
          <span class="badge-title">${escapeHtml(formatLabel)} q${variant.quality}</span>
          <span class="badge-sub">${fmt(variant.bytes)} (${savingText})</span>
        </div>
        ${split > 22 ? `<div class="frosted-badge stage-badge-mid-left">
                 <span class="badge-title">ORIGINAL</span>
                 <span class="badge-sub">${fmt(data.originalBytes)}</span>
               </div>` : ""}
        ${split < 78 ? `<div class="frosted-badge stage-badge-mid-right">
                 <span class="badge-title">${escapeHtml(formatLabel)} q${variant.quality}</span>
                 <span class="badge-sub">${fmt(variant.bytes)} (${savingText})</span>
               </div>` : ""}
      `;
    } else if (state.compareMode === "side") {
      stageHtml += `
        <div class="frosted-badge stage-badge-top-left">
          <span class="badge-title">ORIGINAL</span>
          <span class="badge-sub">${fmt(data.originalBytes)}</span>
        </div>
        <div class="frosted-badge stage-badge-top-right">
          <span class="badge-title">${escapeHtml(formatLabel)} q${variant.quality}</span>
          <span class="badge-sub">${fmt(variant.bytes)} (${savingText})</span>
        </div>
      `;
    } else {
      stageHtml += `
        <div class="frosted-badge stage-badge-top-left">
          <span class="badge-title">${showOriginal ? "ORIGINAL" : `${escapeHtml(formatLabel)} q${variant.quality}`}</span>
          <span class="badge-sub">${fmt(showOriginal ? data.originalBytes : variant.bytes)}</span>
        </div>
      `;
    }
    stageHtml += `
      <div class="canvas-dock" id="canvasDock">
        <div class="dock-group">
          <button id="btnDockFit" class="dock-btn${state.compareZoom === 0 ? " active" : ""}" type="button">Fit</button>
          <button id="btnDock100" class="dock-btn${state.compareZoom === 1 ? " active" : ""}" type="button">100%</button>
        </div>
        <span class="dock-sep"></span>
        <div class="dock-group" id="dockModeGroup">
          <button class="dock-btn${state.compareMode === "toggle" ? " active" : ""}" data-dock-mode="toggle" type="button">Original only</button>
          <button class="dock-btn${state.compareMode === "split" ? " active" : ""}" data-dock-mode="split" type="button">Split</button>
          <button class="dock-btn${state.compareMode === "side" ? " active" : ""}" data-dock-mode="side" type="button">Side-by-side</button>
        </div>
        <span class="dock-sep"></span>
        <div class="dock-select-wrap">
          <select id="compareBgSelect" class="dock-select" aria-label="Canvas background">
            <option value="checker"${compareBg === "checker" ? " selected" : ""}>Background: Checker</option>
            <option value="dark"${compareBg === "dark" ? " selected" : ""}>Background: Dark</option>
            <option value="light"${compareBg === "light" ? " selected" : ""}>Background: Light</option>
          </select>
        </div>
        <span class="dock-sep"></span>
        <button id="btnDockFullscreen" class="dock-btn icon-btn" type="button" title="Toggle fullscreen" aria-label="Toggle fullscreen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
        </button>
      </div>
    `;
    stage.innerHTML = stageHtml;
    stage.classList.remove("hidden");
    $("compareEmpty").classList.add("hidden");
    $("compareRail").classList.remove("hidden");
    $("compareFormat").textContent = data.formatLabel;
    $("compareViewTitle").textContent = data.rel.split(/[\\/]/).pop() ?? data.rel;
    syncFileSelect(data.rel);
    syncFormatSelect(data.format);
    syncModeSelect(state.compareMode);
    renderFacts(data, variant);
    renderLadder(data);
    $("compareErrors").innerHTML = data.errors.length ? data.errors.map((error) => `<p>${escapeHtml(error)}</p>`).join("") : "";
    setupSplitterEvents(stage);
    setupDockEvents();
    const img = stage.querySelector(".compare-pane.original img");
    if (img) {
      if (img.complete && img.naturalWidth) {
        dimensions = { width: img.naturalWidth, height: img.naturalHeight };
        renderFacts(data, variant);
      } else {
        img.addEventListener("load", () => {
          if (img.naturalWidth && img.naturalHeight) {
            dimensions = { width: img.naturalWidth, height: img.naturalHeight };
            renderFacts(data, variant);
          }
        });
      }
    }
  };
  const updateSplitterPosition = (pct) => {
    split = Math.max(2, Math.min(98, pct));
    const stage = $("compareStage");
    stage.style.setProperty("--split", `${split}%`);
    const line = stage.querySelector(".compare-split-line");
    if (line)
      line.style.left = `${split}%`;
    const handle = stage.querySelector(".compare-split-handle");
    if (handle) {
      handle.style.left = `${split}%`;
      handle.setAttribute("aria-valuenow", String(Math.round(split)));
    }
    const variantPane = stage.querySelector(".compare-pane.variant");
    if (variantPane) {
      variantPane.style.clipPath = `inset(0 0 0 ${split}%)`;
    }
    const midLeft = stage.querySelector(".stage-badge-mid-left");
    if (midLeft) {
      midLeft.style.left = `calc(${split}% - 165px)`;
      midLeft.style.display = split > 22 ? "" : "none";
    }
    const midRight = stage.querySelector(".stage-badge-mid-right");
    if (midRight) {
      midRight.style.left = `calc(${split}% + 40px)`;
      midRight.style.display = split < 78 ? "" : "none";
    }
  };
  const setupSplitterEvents = (stage) => {
    if (state.compareMode !== "split")
      return;
    const handle = stage.querySelector(".compare-split-handle");
    if (!handle)
      return;
    const onPointerMove = (e) => {
      if (!isDraggingSplitter)
        return;
      const rect = stage.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width * 100;
      updateSplitterPosition(pct);
    };
    const onPointerUp = (e) => {
      if (isDraggingSplitter) {
        isDraggingSplitter = false;
        handle.classList.remove("is-dragging");
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch {}
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingSplitter = true;
      handle.classList.add("is-dragging");
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {}
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    });
    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".canvas-dock, .frosted-badge, .compare-split-handle")) {
        return;
      }
      if (state.compareMode === "toggle") {
        state.compareShowOriginal = !state.compareShowOriginal;
        renderStage();
        return;
      }
      if (state.compareMode === "split") {
        const rect = stage.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width * 100;
        updateSplitterPosition(pct);
        isDraggingSplitter = true;
        handle.classList.add("is-dragging");
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
      }
    });
  };
  const setupDockEvents = () => {
    const btnFit = document.getElementById("btnDockFit");
    btnFit?.addEventListener("click", () => setZoom(0));
    const btn100 = document.getElementById("btnDock100");
    btn100?.addEventListener("click", () => setZoom(1));
    const dockGroup = document.getElementById("dockModeGroup");
    dockGroup?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-dock-mode]");
      if (btn?.dataset.dockMode) {
        setMode(btn.dataset.dockMode);
      }
    });
    const bgSelect = document.getElementById("compareBgSelect");
    bgSelect?.addEventListener("change", () => {
      compareBg = bgSelect.value || "checker";
      $("compareStage").dataset.bg = compareBg;
    });
    const btnFs = document.getElementById("btnDockFullscreen");
    btnFs?.addEventListener("click", () => {
      const screen = $("viewCompare");
      if (!document.fullscreenElement) {
        screen.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  };
  const renderEmpty = (title, note) => {
    $("compareEmpty").innerHTML = emptyState("compare", title, note);
    $("compareEmpty").classList.remove("hidden");
    $("compareStage").classList.add("hidden");
    $("compareRail").classList.add("hidden");
  };
  const run = async (rel, format) => {
    if (busy)
      return;
    busy = true;
    state.compareRel = rel;
    if (format)
      activeFormat = format;
    dimensions = null;
    state.compareVariant = 0;
    $("compareEmpty").innerHTML = `
      <div class="empty-state">
        <svg width="24" height="24" aria-hidden="true"><use href="#i-loader"></use></svg>
        <p class="empty-title">Encoding variants…</p>
        <p class="empty-note">${escapeHtml(rel)}</p>
      </div>
    `;
    $("compareEmpty").classList.remove("hidden");
    $("compareStage").classList.add("hidden");
    $("compareRail").classList.add("hidden");
    try {
      const data = await actions.runCompare(rel, activeFormat);
      state.compare = data;
      if (!data.variants.length) {
        renderEmpty("No variants produced", data.errors[0] ?? "The encoder returned no output for this file.");
        return;
      }
      renderStage();
    } catch (error) {
      state.compare = null;
      renderEmpty("Could not compare this file", error.message);
    } finally {
      busy = false;
    }
  };
  const open = (rel) => {
    actions.switchView("compare");
    activeFormat = state.currentFormat;
    const files = fileList();
    if (!files.length) {
      renderEmpty("No selected files to compare", "Select at least one image in the Library, then open Compare again.");
      $("compareViewTitle").textContent = "Compare";
      $("compareFormat").textContent = state.formatSpecs[state.currentFormat]?.shortLabel ?? "—";
      return;
    }
    const wanted = rel ?? state.compareRel;
    const chosen = files.some((f) => f.rel === wanted) ? wanted : files[0].rel;
    syncFileSelect(chosen);
    syncFormatSelect(activeFormat);
    run(chosen, activeFormat);
  };
  const close = () => {
    actions.switchView("workspace");
  };
  const setMode = (mode) => {
    state.compareMode = mode;
    if (mode === "toggle")
      state.compareShowOriginal = true;
    syncModeSelect(mode);
    renderStage();
  };
  const setZoom = (next) => {
    state.compareZoom = Math.max(0, Math.min(3, next));
    const slider = document.getElementById("compareZoomSlider");
    if (slider) {
      slider.value = String(Math.round(state.compareZoom * 100));
    }
    $("compareZoom").textContent = state.compareZoom > 0 ? `${Math.round(state.compareZoom * 100)}%` : "Fit";
    renderStage();
  };
  const zoomIn = () => setZoom(state.compareZoom === 0 ? 1 : Math.min(3, state.compareZoom + 0.25));
  const zoomOut = () => setZoom(state.compareZoom <= 0.25 ? 0 : Math.max(0, state.compareZoom - 0.25));
  const modeSelect = document.getElementById("compareModeSelect");
  modeSelect?.addEventListener("change", () => {
    const val = modeSelect.value;
    if (val)
      setMode(val);
  });
  $("compareModes").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (button?.dataset.mode)
      setMode(button.dataset.mode);
  });
  const zoomSlider = document.getElementById("compareZoomSlider");
  zoomSlider?.addEventListener("input", () => {
    const val = Number(zoomSlider.value);
    setZoom(val === 0 ? 0 : val / 100);
  });
  $("compareZoomIn").addEventListener("click", zoomIn);
  $("compareZoomOut").addEventListener("click", zoomOut);
  $("compareClose").addEventListener("click", close);
  $("compareFileSelect").addEventListener("change", () => {
    const value = $("compareFileSelect").value;
    if (value)
      run(value, activeFormat);
  });
  const formatSelect = document.getElementById("compareFormatSelect");
  formatSelect?.addEventListener("change", () => {
    const chosenFormat = formatSelect.value;
    if (chosenFormat && state.compareRel) {
      activeFormat = chosenFormat;
      run(state.compareRel, chosenFormat);
    }
  });
  $("compareLadder").addEventListener("click", (event) => {
    const card = event.target.closest(".ladder-card");
    if (!card)
      return;
    const index = Number(card.dataset.variantIndex);
    if (!Number.isFinite(index) || !state.compare)
      return;
    state.compareVariant = index;
    renderStage();
  });
  const applyBtn = document.getElementById("btnCompareApply");
  applyBtn?.addEventListener("click", () => {
    if (!state.compare)
      return;
    const variant = state.compare.variants[state.compareVariant];
    if (!variant)
      return;
    actions.setQuality(variant.quality);
    const fmtName = state.compare.format.toUpperCase();
    actions.toast(`Quality set to q${variant.quality} for ${fmtName}.`, "success");
  });
  const setDefaultBtn = document.getElementById("btnCompareSetDefault");
  setDefaultBtn?.addEventListener("click", () => {
    if (!state.compare)
      return;
    const variant = state.compare.variants[state.compareVariant];
    if (!variant)
      return;
    actions.setQuality(variant.quality);
    const fmtName = state.compare.format.toUpperCase();
    actions.toast(`q${variant.quality} set as default for ${fmtName}.`, "success");
  });
  const handleKey = (event) => {
    if (state.view !== "compare")
      return false;
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA")
      return false;
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
  $("compareZoom").textContent = "100%";
  return { open, close, handleKey };
}

// src/client/views/health.ts
function createHealthView(actions) {
  let busy = false;
  let lastHealth = null;
  let lastIm = null;
  const supportRow = (format) => {
    const spec = state.formatSpecs[format];
    const support = lastHealth?.magick?.formats?.[format] ?? state.status?.magick?.formats?.[format];
    const writable = support?.writable ?? false;
    return `<tr>
      <td>${escapeHtml(spec?.label ?? format)}</td>
      <td class="mono">.${escapeHtml(spec?.ext ?? format)}</td>
      <td class="mono">${escapeHtml(support?.mode ?? "—")}</td>
      <td class="${writable ? "support-yes" : "support-no"}">${writable ? "Writable" : "Not writable"}</td>
      <td class="muted">${escapeHtml(support?.detail ?? "No encoder reported.")}</td>
    </tr>`;
  };
  const imCard = () => {
    const im = lastIm;
    if (!im)
      return `<section class="health-section"><h3>ImageMagick</h3><p class="health-note">Could not read update status.</p></section>`;
    const installed = im.installed;
    const kind = im.assetKind === "appimage" ? "AppImage" : "portable build";
    const platform = state.status?.platform === "linux" ? "Linux" : "Windows";
    const update = im.updateAvailable && im.latest;
    const lines = [];
    if (installed) {
      lines.push(`<div class="fact-row"><span>Installed</span><span>${escapeHtml(shortVersion(installed.version))}${installed.avifWritable ? "" : " · AVIF unavailable"}</span></div>`);
      lines.push(`<div class="fact-row"><span>Path</span><span class="mono" title="${escapeHtml(installed.path)}">${escapeHtml(installed.path)}</span></div>`);
      if (installed.libheif)
        lines.push(`<div class="fact-row"><span>libheif</span><span>${escapeHtml(installed.libheif)}</span></div>`);
    } else {
      lines.push(`<div class="fact-row"><span>Installed</span><span style="color:var(--status-danger)">Not found</span></div>`);
    }
    lines.push(`<div class="fact-row"><span>Source</span><span>${im.managed ? `Managed ${escapeHtml(kind)}` : "System ImageMagick"}</span></div>`);
    lines.push(`<div class="fact-row"><span>${im.assetKind === "appimage" ? "AppImage folder" : "Portable folder"}</span><span class="mono" title="${escapeHtml(im.installDir)}">${escapeHtml(im.installDir)}</span></div>`);
    if (im.latest) {
      lines.push(`<div class="fact-row"><span>Latest on GitHub</span><span>${escapeHtml(im.latest.version)}${im.online ? "" : " (cached)"}</span></div>`);
      lines.push(`<div class="fact-row"><span>${kind}</span><span>${escapeHtml(im.latest.asset.name)} · ${fmt(im.latest.asset.size)}</span></div>`);
    }
    lines.push(`<div class="fact-row"><span>Checked</span><span>${escapeHtml(relativeTime(im.checkedAt))}</span></div>`);
    const notes = [];
    if (!im.supported) {
      notes.push(`Automatic downloads are not available on this ${platform} build. Install ImageMagick 7 with AVIF support using your package manager.`);
    } else if (!im.online) {
      notes.push(`Could not reach github.com${im.error ? `: ${im.error}` : "."} The installed build is still usable.`);
    } else if (im.installed && !im.managed && update && im.assetKind === "appimage") {
      notes.push("The system ImageMagick cannot encode AVIF; the AppImage will take priority after installation.");
    }
    const actions = [];
    if (im.supported && update && im.latest) {
      actions.push(`<button class="btn primary sm" type="button" data-health-install>${im.installed ? "Download update" : "Install ImageMagick"} ${escapeHtml(im.latest.version)}</button>`);
    }
    return `<section class="health-section">
      <div class="section-head"><h3>ImageMagick</h3><span class="chip ${im.supported ? im.online ? "ok" : "warn" : "warn"}">${im.supported ? im.online ? "Supported" : "Offline" : "Manual install"}</span></div>
      <div class="fact-list">${lines.join("")}</div>
      ${notes.map((note) => `<p class="health-note">${escapeHtml(note)}</p>`).join("")}
      <div class="health-actions">${actions.join("")}</div>
    </section>`;
  };
  const render = () => {
    const health = lastHealth;
    if (!health) {
      $("healthBody").innerHTML = `<p class="empty-note">Could not read health checks.</p>`;
      return;
    }
    const fails = health.checks.filter((c) => c.status === "fail").length;
    const warns = health.checks.filter((c) => c.status === "warn").length;
    const tone = fails ? "bad" : warns ? "warn" : "ok";
    const pill = $("healthVerdictPill");
    pill.dataset.state = tone === "ok" ? "ok" : tone === "warn" ? "warn" : "bad";
    pill.textContent = fails ? "Needs attention" : warns ? "Usable, with warnings" : "Ready";
    const banner = `<div class="health-banner" data-tone="${tone}">
      <span class="health-icon">${icon(checkIcon(tone === "ok" ? "ok" : tone === "warn" ? "warn" : "fail"), 20)}</span>
      <div>
        <h2>${fails ? "Needs attention before converting" : warns ? "Ready, with warnings" : "Ready to convert"}</h2>
        <p>${health.checks.length} checks · ${fails} failed · ${warns} warnings${health.freeBytes != null ? ` · ${fmt(health.freeBytes)} free` : ""}</p>
      </div>
    </div>`;
    const checks = `<div class="health-grid">${health.checks.map((check) => `<div class="health-check" data-status="${check.status}">
        <span class="health-check-icon">${icon(checkIcon(check.status), 16)}</span>
        <div><h4>${escapeHtml(check.label)} <span class="muted">· ${statusWord(check.status)}</span></h4><p>${escapeHtml(check.detail)}</p></div>
      </div>`).join("")}</div>`;
    const matrix = `<section class="health-section">
      <div class="section-head"><h3>Format support</h3><span class="section-meta">${health.magick ? escapeHtml(shortVersion(health.magick.version)) : "ImageMagick not found"}</span></div>
      <table class="data-table support-table">
        <thead><tr><th>Format</th><th>Extension</th><th>Mode</th><th>Status</th><th>Encoder</th></tr></thead>
        <tbody>${(Object.keys(state.formatSpecs).length ? Object.keys(state.formatSpecs) : ["jxl", "avif", "webp", "heic", "jp2", "jpeg", "png"]).map((id) => supportRow(id)).join("")}</tbody>
      </table>
    </section>`;
    $("healthBody").innerHTML = banner + checks + matrix + imCard();
  };
  const refresh = async () => {
    if (busy)
      return;
    busy = true;
    $("healthBody").innerHTML = `<p class="empty-note">Reading ImageMagick, source, destination, and disk state…</p>`;
    try {
      const [health, im] = await Promise.all([
        api("health"),
        actions.checkMagick(false)
      ]);
      lastHealth = health;
      lastIm = im;
      render();
    } catch (error) {
      $("healthBody").innerHTML = `<p class="inline-msg">${escapeHtml(error.message)}</p>`;
    } finally {
      busy = false;
    }
  };
  $("healthRecheck").addEventListener("click", () => void refresh());
  $("healthBody").addEventListener("click", (event) => {
    if (!event.target.closest("[data-health-install]"))
      return;
    actions.installMagick().then(refresh);
  });
  const open = () => {
    actions.switchView("health");
    refresh();
  };
  return { open, refresh };
}

// src/client/views/run.ts
var stateWord = (value) => {
  switch (value) {
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "done":
      return "Complete";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
    default:
      return "Idle";
  }
};
var statusIcon = (status) => {
  switch (status) {
    case "converted":
      return "check-circle";
    case "copied":
      return "folder";
    case "failed":
      return "alert-octagon";
    case "cancelled":
      return "x";
    default:
      return "chevron-right";
  }
};
function createRunView(actions) {
  let dockDismissed = false;
  let lastDockState = "";
  const percent = () => state.run.total > 0 ? Math.min(100, state.run.done / state.run.total * 100) : 0;
  const countsHtml = () => {
    const r = state.run;
    return [
      `<span>${r.done.toLocaleString()} / ${r.total.toLocaleString()}</span>`,
      `<span class="ok">${r.converted.toLocaleString()} converted</span>`,
      `<span>${r.copied.toLocaleString()} copied</span>`,
      `<span>${r.skipped.toLocaleString()} skipped</span>`,
      `<span class="${r.failed ? "bad" : ""}">${r.failed.toLocaleString()} failed</span>`
    ].join("");
  };
  const renderDock = () => {
    const bar = $("runbar");
    const r = state.run;
    const visible = !dockDismissed && r.id !== null && r.state !== "idle";
    bar.classList.toggle("hidden", !visible);
    $("app").classList.toggle("dock-open", visible);
    if (!visible)
      return;
    bar.dataset.state = r.state;
    const dot = $("runDot");
    dot.className = "status-dot " + (r.state === "running" ? "running" : r.state === "paused" ? "warn" : r.state === "done" ? "ok" : r.state === "failed" ? "bad" : "warn");
    let status = "";
    if (r.state === "running") {
      status = r.note ?? (r.done > 0 ? `Converting — ${r.done.toLocaleString()} of ${r.total.toLocaleString()}` : `Converting ${r.total.toLocaleString()} files`);
    } else if (r.state === "paused") {
      status = `Paused — ${Math.max(0, r.total - r.done).toLocaleString()} files left`;
    } else if (r.state === "done") {
      status = "Run complete";
    } else if (r.state === "cancelled") {
      status = "Run cancelled";
    } else if (r.state === "failed") {
      status = r.note ?? "Run failed";
    }
    $("runStatus").textContent = status;
    $("runPct").textContent = `${Math.round(percent())}%`;
    setWidth($("runFill"), percent() / 100);
    $("runFill").classList.toggle("done", r.state === "done");
    $("runCounts").textContent = `${r.done.toLocaleString()}/${r.total.toLocaleString()} · ${r.converted.toLocaleString()} conv · ${r.copied.toLocaleString()} copy · ${r.skipped.toLocaleString()} skip · ${r.failed.toLocaleString()} fail`;
    $("runEta").textContent = r.state === "running" && r.etaSeconds != null ? `ETA ${eta(r.etaSeconds)} · elapsed ${dur(r.elapsedSeconds)}` : r.state === "done" ? `elapsed ${dur(r.elapsedSeconds)}` : "";
    $("runBytes").textContent = r.bytes > 0 ? fmt(r.bytes) : "";
    $("runFile").textContent = r.startingRel ? `encoding ${r.startingRel}${r.startingBytes != null ? ` (${fmt(r.startingBytes)})` : ""}` : r.lastRel ? `${r.lastStatus ?? "done"} ${r.lastRel}` : "";
    const live = r.state === "running";
    const paused = r.state === "paused";
    const terminal = r.state === "done" || r.state === "cancelled" || r.state === "failed";
    $("btnPause").classList.toggle("hidden", !live);
    $("btnCancel").classList.toggle("hidden", !live);
    $("runPaused").classList.toggle("hidden", !paused);
    $("runComplete").classList.toggle("hidden", !terminal);
    if (paused) {
      $("btnPause").classList.add("hidden");
      $("btnCancel").classList.add("hidden");
    }
    if (terminal) {
      const s = state.lastSummary;
      const text = s ? `${s.converted.toLocaleString()} converted · ${s.copied.toLocaleString()} copied · ${fmt(s.bytes)}${s.failed ? ` · ${s.failed} failed` : ""}` : r.state === "failed" ? state.lastJobError ?? "The run failed." : "The run finished.";
      $("runCompleteText").textContent = text;
      $("btnQuickUndo").classList.toggle("hidden", !state.lastManifestId);
    }
    lastDockState = r.state;
  };
  const activityHtml = () => {
    if (!state.activity.length) {
      return `<p class="empty-note" style="padding:14px">Results appear here as files finish.</p>`;
    }
    const rows = state.activity.slice(-200).reverse();
    return rows.map((f) => {
      const out = f.outBytes > 0 ? fmt(f.outBytes) : "—";
      return `<div class="activity-row">
          <span class="activity-status ${f.status}">${icon(statusIcon(f.status), 14)}</span>
          <span class="activity-name" title="${escapeHtml(f.rel)}">${escapeHtml(f.rel)}</span>
          <span class="activity-type">${f.status}</span>
          <span class="activity-time">${f.seconds > 0 ? f.seconds.toFixed(1) + "s" : "—"}</span>
          <span class="activity-size">${out}</span>
        </div>`;
    }).join("");
  };
  const resultsHtml = () => {
    const s = state.lastSummary;
    if (!s)
      return "";
    const failed = s.failed > 0;
    const tone = state.run.state === "failed" || failed ? "bad" : "ok";
    const title = state.run.state === "failed" ? "Run failed" : s.note === "cancelled" ? "Run cancelled" : "Run complete";
    const sub = s.note === "cancelled" ? `Stopped after ${dur(s.elapsedSeconds)}. Completed files are on disk and will be skipped next time.` : `Finished in ${dur(s.elapsedSeconds)} · ${fmt(s.bytes)} written`;
    return `<div class="run-results" data-tone="${tone}">
      <div class="results-head">
        <span class="health-icon" style="background:var(--status-${failed ? "danger" : "success"}-soft);color:var(--status-${failed ? "danger" : "success"})">${icon(failed ? "alert-octagon" : "check-circle", 18)}</span>
        <div><h2>${title}</h2><p>${sub}</p></div>
      </div>
      <div class="results-stats">
        <div class="result-card"><span class="micro-label">Converted</span><b>${s.converted.toLocaleString()}</b></div>
        <div class="result-card"><span class="micro-label">Copied</span><b>${s.copied.toLocaleString()}</b></div>
        <div class="result-card"><span class="micro-label">Skipped</span><b>${s.skipped.toLocaleString()}</b></div>
        <div class="result-card"><span class="micro-label">Failed</span><b style="${failed ? "color:var(--status-danger)" : ""}">${s.failed.toLocaleString()}</b></div>
      </div>
      <div class="results-actions">
        <button class="btn secondary sm" type="button" data-run-action="workspace">Convert more</button>
        ${state.lastJobId ? `<button class="btn sm" type="button" data-run-action="verify">Verify outputs</button>` : ""}
        ${state.lastManifestId ? `<button class="btn danger sm" type="button" data-run-action="undo">Undo this run</button>` : ""}
      </div>
      <div id="verifyResult"></div>
    </div>`;
  };
  const renderView = () => {
    const r = state.run;
    const pct = percent();
    $("runViewTitle").textContent = r.id ? `Run · ${r.id.slice(-8)}` : "Run";
    const pill = $("runViewState");
    pill.dataset.state = r.state;
    pill.textContent = stateWord(r.state);
    $("runHeroPct").textContent = `${Math.round(pct)}%`;
    $("runHeroLabel").textContent = r.state === "running" ? r.note ?? "Converting…" : r.state === "paused" ? "Paused — completed files stay on disk" : r.state === "done" ? "Complete" : r.state === "cancelled" ? "Cancelled" : r.state === "failed" ? state.lastJobError ?? "Failed" : "No run yet";
    setWidth($("runViewFill"), pct / 100);
    $("runViewFill").classList.toggle("done", r.state === "done");
    $("runViewCounts").innerHTML = countsHtml();
    const live = r.state === "running";
    const paused = r.state === "paused";
    $("viewPause").classList.toggle("hidden", !live);
    $("viewResume").classList.toggle("hidden", !paused);
    $("viewCancel").classList.toggle("hidden", !(live || paused));
    const results = $("runResults");
    const html = resultsHtml();
    results.classList.toggle("hidden", !html);
    results.innerHTML = html;
    $("runActivity").innerHTML = activityHtml();
    $("runActivityMeta").textContent = state.activity.length ? `${state.activity.length.toLocaleString()} finished · since this page opened` : "Since this page opened";
    const jobs = $("jobs");
    const viewJobs = $("viewJobs");
    if (document.activeElement !== viewJobs)
      viewJobs.value = jobs.value;
    $("viewJobsOut").textContent = viewJobs.value;
    const cpuLimit = $("cpuLimit");
    const viewCpuLimit = $("viewCpuLimit");
    if (document.activeElement !== viewCpuLimit)
      viewCpuLimit.value = cpuLimit.value;
    $("viewCpuLimitOut").textContent = `${viewCpuLimit.value}%`;
  };
  $("runResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-run-action]");
    if (!button)
      return;
    const action = button.dataset.runAction;
    if (action === "workspace")
      actions.switchView("workspace");
    if (action === "undo" && state.lastManifestId) {
      actions.undoManifest(state.lastManifestId, state.lastSummary ?? undefined);
    }
    if (action === "verify" && state.lastJobId) {
      verify();
    }
  });
  const verify = async () => {
    const jobId = state.lastJobId;
    if (!jobId)
      return;
    const host = $("verifyResult");
    host.innerHTML = `<p class="empty-note">Checking outputs…</p>`;
    try {
      const report = await actions.verifyJob(jobId);
      const failed = report.failed > 0;
      host.innerHTML = `<div class="verify-card">
        <h3>${failed ? "Verification found problems" : "Outputs verified"}</h3>
        <p>${report.checked.toLocaleString()} checked · ${report.passed.toLocaleString()} passed · ${report.failed.toLocaleString()} failed · dates kept on ${report.dateSurvived.toLocaleString()} (${dur(report.durationMs / 1000)})</p>
        ${failed ? `<div class="result-box" style="margin-top:10px"><table class="data-table"><thead><tr><th>File</th><th>Problems</th></tr></thead><tbody>${report.rows.slice(0, 50).map((row) => `<tr><td class="path-cell" title="${escapeHtml(row.rel)}">${escapeHtml(row.rel)}</td><td>${escapeHtml(row.problems.join(", "))}</td></tr>`).join("")}</tbody></table></div>` : ""}
      </div>`;
    } catch (error) {
      host.innerHTML = `<p class="inline-msg">${escapeHtml(error.message)}</p>`;
    }
  };
  $("btnDockClose").addEventListener("click", () => {
    dockDismissed = true;
    renderDock();
  });
  $("btnExpandRun").addEventListener("click", () => open());
  $("btnViewResults").addEventListener("click", () => open());
  $("btnQuickUndo").addEventListener("click", () => {
    if (state.lastManifestId) {
      actions.undoManifest(state.lastManifestId, state.lastSummary ?? undefined);
    }
  });
  const open = () => {
    actions.switchView("run");
    renderView();
  };
  return {
    renderDock,
    renderView,
    open,
    resetDock: () => {
      dockDismissed = false;
    }
  };
}

// src/client/views/runs.ts
function createRunsView(actions) {
  let busy = false;
  const row = (manifest) => {
    const spec = state.formatSpecs[manifest.outputFormat];
    const format = spec?.shortLabel ?? manifest.outputFormat;
    const quality = manifest.quality.length ? manifest.quality.join(", ") : "—";
    return `<tr>
      <td class="run-id">${escapeHtml(manifest.id)}</td>
      <td title="${new Date(manifest.createdAt).toLocaleString()}">${escapeHtml(relativeTime(manifest.createdAt))}</td>
      <td>${escapeHtml(format)} <span class="muted">q${escapeHtml(quality)}</span></td>
      <td class="num">${manifest.summary.converted.toLocaleString()}</td>
      <td class="num">${manifest.summary.copied.toLocaleString()}</td>
      <td class="num"${manifest.summary.failed ? ' style="color:var(--status-danger)"' : ""}>${manifest.summary.failed.toLocaleString()}</td>
      <td class="num">${fmt(manifest.summary.bytes)}</td>
      <td><span class="run-destination" title="${escapeHtml(manifest.destination)}">${escapeHtml(manifest.destination)}</span></td>
      <td class="actions-cell">
        <button class="btn ghost sm" type="button" data-undo-id="${escapeHtml(manifest.id)}">Undo</button>
      </td>
    </tr>`;
  };
  const refresh = async () => {
    if (busy)
      return;
    busy = true;
    $("runsBody").innerHTML = `<p class="empty-note">Loading run records…</p>`;
    try {
      const data = await api("manifests");
      const manifests = data.manifests ?? [];
      $("runsCount").textContent = `${manifests.length.toLocaleString()} recorded`;
      if (!manifests.length) {
        $("runsBody").innerHTML = emptyState("history", "No runs recorded yet", "Finish a conversion and its manifest will appear here for safe undo.");
        return;
      }
      $("runsBody").innerHTML = `<div class="runs-table-wrap"><table class="data-table">
        <thead><tr><th>Run</th><th>When</th><th>Format</th><th>Converted</th><th>Copied</th><th>Failed</th><th>Size</th><th>Destination</th><th></th></tr></thead>
        <tbody>${manifests.map(row).join("")}</tbody>
      </table></div>`;
    } catch (error) {
      $("runsBody").innerHTML = `<p class="inline-msg">${escapeHtml(error.message)}</p>`;
    } finally {
      busy = false;
    }
  };
  $("runsBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-undo-id]");
    if (!button?.dataset.undoId)
      return;
    const id = button.dataset.undoId;
    actions.undoManifest(id).then(refresh);
  });
  $("runsRefresh").addEventListener("click", () => void refresh());
  const open = () => {
    actions.switchView("runs");
    refresh();
  };
  return { open, refresh };
}

// src/client/main.ts
var THEME_IDS = ["midnight", "daylight", "ink", "sepia", "nord", "rose"];
var library;
var formatUi;
var plan;
var runLifecycle;
var runView;
var compareView;
var runsView;
var healthView;
var auditView;
var previewTimer = null;
var extEnabled = {};
var scanning = false;
var themeChoice = "auto";
var previewSeq = 0;
var imStatus = null;
var installing = false;
var baseName = (value) => {
  const trimmed = value.replace(/[\\/]+$/, "");
  if (!trimmed)
    return value;
  return trimmed.split(/[\\/]/).pop() ?? trimmed;
};
var platformName = (platform) => {
  if (platform === "win32")
    return "Windows";
  if (platform === "linux")
    return "Linux";
  if (platform === "darwin")
    return "macOS";
  return platform || "Desktop";
};
var formatError = (error) => error instanceof Error ? error.message : String(error);
var policy = () => ({
  excludedFolders: [...state.excluded],
  includedFolders: [...state.included],
  excludedFiles: [...state.excludedFiles],
  includedFiles: [...state.includedFiles],
  extEnabled: { ...extEnabled },
  minSizeBytes: Math.round(input("minsize").valueAsNumber * 1024 * 1024),
  copyUndersized: input("copyUndersized").checked,
  includeRaw: input("includeRaw").checked,
  outputFormat: state.currentFormat,
  qualities: [input("quality").valueAsNumber],
  flattenGif: input("flattenGif").checked,
  heicSpeed: input("heicSpeed").valueAsNumber
});
var budgetBytes = () => Math.max(1, Math.round(input("budget").valueAsNumber)) * 1024 ** 3;
var save = async () => {
  const destination = input("destination").value.trim();
  await api("config", {
    method: "POST",
    body: {
      destination,
      budgetBytes: budgetBytes(),
      policy: policy()
    }
  });
  if (state.status)
    state.status.destination = destination;
};
var schedulePreview = debounce(() => {
  refreshPreview();
}, 180);
var refreshPreview = async () => {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
  if (!state.tree)
    return;
  const seq = ++previewSeq;
  state.previewSeq = seq;
  state.previewBusy = true;
  try {
    await save();
    const preview = await api("preview", {
      method: "POST",
      body: { policy: policy() }
    });
    if (seq !== previewSeq)
      return;
    state.preview = preview;
    state.lastSync = null;
    state.previewBusy = false;
    plan.render();
    updateChrome();
  } catch (error) {
    if (seq !== previewSeq)
      return;
    state.previewBusy = false;
    plan.render();
    updateChrome();
    toast(formatError(error), "danger");
  }
};
var refreshStatus = async () => {
  try {
    const status = await api("status");
    applyStatusMeta(status);
    formatUi.refreshCards();
    return status;
  } catch (error) {
    toast(formatError(error), "danger");
    return null;
  }
};
var applyStatusMeta = (status) => {
  state.status = status;
  const destination = input("destination");
  if (document.activeElement !== destination)
    destination.value = status.destination;
  const source = input("sourceRoot");
  if (document.activeElement !== source)
    source.value = status.sourceRoot;
  const budget = clamp(Math.round(status.budgetBytes / 1024 ** 3), 1, 100);
  input("budget").value = String(budget);
  paintRange("budget");
  $("budgetOut").textContent = `${budget} GB`;
  const freeBytes = status.freeBytes;
  $("freeChip").textContent = freeBytes == null ? "" : `${fmt(freeBytes)} free`;
  $("freeChip").title = freeBytes == null ? "Free space on the destination volume is unavailable" : `Free space on the destination volume: ${status.freeLabel}`;
  $("freeLine").textContent = freeBytes == null ? "Free space on the destination volume is unavailable." : `Free on destination volume: ${status.freeLabel}`;
  $("statusPlatform").textContent = platformName(status.platform);
  $("statusMagick").textContent = status.magick ? shortVersion(status.magick.version) : "No ImageMagick";
  $("magickLine").textContent = status.magick ? `ImageMagick ${shortVersion(status.magick.version)}` : "ImageMagick not found";
  $("envChip").title = status.magick ? `${status.magick.path}${status.magick.libheif ? ` · libheif ${status.magick.libheif}` : ""}` : "ImageMagick is required to convert photos";
  const healthDot = $("healthDot");
  healthDot.className = "dot " + (status.magick?.avifWritable ? "ok" : status.magick ? "warn" : "bad");
  $("libraryName").textContent = status.sourceRoot ? baseName(status.sourceRoot) : "No library";
  $("libraryPill").title = status.sourceRoot || "Choose a source folder";
  $("stepSourceMeta").textContent = status.scanned ? `${status.fileCount.toLocaleString()} files` : "No folder";
  $("statusVersion").textContent = "v1.2.0";
  if (status.canPickFolder === false) {
    $("btnPickSource").classList.add("hidden");
    $("btnPick").classList.add("hidden");
    input("sourceRoot").placeholder = "Type the folder path";
    input("destination").placeholder = "Type the output path";
  }
};
var selectedSummary = () => {
  const files = library.selected();
  return { files, bytes: files.reduce((sum, file) => sum + file.size, 0) };
};
var updateRail = () => {
  const selected = selectedSummary();
  const total = state.lastScan?.totals.count ?? 0;
  const p = state.preview;
  const spec = state.formatSpecs[state.currentFormat];
  $("stepSourceMeta").textContent = state.tree ? `${total.toLocaleString()} files` : scanning ? "Scanning…" : "No folder";
  $("stepSelectMeta").textContent = state.tree ? `${selected.files.length.toLocaleString()} of ${total.toLocaleString()}` : "None";
  $("stepOutputMeta").textContent = spec ? `${spec.shortLabel} ${$("qualityOut").textContent}` : "—";
  $("stepReviewMeta").textContent = p ? p.budget.fits ? fmt(p.estOutputBytes) : "Over budget" : state.tree ? "Waiting" : "Waiting";
  const runPct = state.run.total > 0 ? Math.round(state.run.done / state.run.total * 100) : 0;
  $("stepRunMeta").textContent = state.running ? state.run.state === "paused" ? "Paused" : `Running ${runPct}%` : state.run.state === "done" ? "Done" : state.run.state === "failed" ? "Failed" : state.run.state === "cancelled" ? "Cancelled" : "Ready";
  const states = {
    source: state.tree ? "done" : "current",
    select: state.tree ? selected.files.length ? "done" : "current" : "pending",
    output: state.tree && selected.files.length && spec ? "done" : selected.files.length ? "current" : "pending",
    review: state.running ? "done" : p ? "current" : selected.files.length ? "current" : "pending",
    run: state.running ? "current" : ["done", "failed", "cancelled"].includes(state.run.state) ? "done" : "pending"
  };
  const numbers = { source: "1", select: "2", output: "3", review: "4", run: "5" };
  for (const [step, value] of Object.entries(states)) {
    const button = document.getElementById(`step${step.charAt(0).toUpperCase()}${step.slice(1)}`);
    if (!button)
      continue;
    button.dataset.state = value;
    const iconNode = button.querySelector(".rail-icon");
    if (iconNode) {
      iconNode.innerHTML = value === "done" ? icon("check", 12) : numbers[step];
    }
  }
};
var updateChrome = () => {
  const selected = selectedSummary();
  const total = state.lastScan?.totals.count ?? 0;
  if (state.tree) {
    $("statusSelection").textContent = `${selected.files.length.toLocaleString()} of ${total.toLocaleString()} selected · ${fmt(selected.bytes)}`;
  } else {
    $("statusSelection").textContent = "No scan";
  }
  $("statusScan").textContent = scanning ? "Scanning…" : state.running ? state.run.state === "paused" ? "Paused" : `Running · ${state.run.done.toLocaleString()} of ${state.run.total.toLocaleString()}` : state.lastScan ? `Scanned ${state.lastScan.durationMs} ms · ${total.toLocaleString()} files` : "Ready";
  $("statusMagick").textContent = state.status?.magick ? shortVersion(state.status.magick.version) : "No ImageMagick";
  $("sourceInfo").textContent = state.lastScan ? `${state.lastScan.durationMs} ms · ${state.lastScan.totals.count.toLocaleString()} files` : "";
  $("libraryName").textContent = input("sourceRoot").value.trim() ? baseName(input("sourceRoot").value.trim()) : "No library";
  const free = state.preview?.freeBytes ?? state.status?.freeBytes ?? null;
  $("freeChip").textContent = free == null ? "" : `${fmt(free)} free`;
  $("recipeMeta").textContent = state.formatSpecs[state.currentFormat]?.shortLabel ?? "—";
  paintRange("viewJobs");
  paintRange("viewCpuLimit");
  updateRail();
  updateStartOptions();
};
var updateStartOptions = () => {
  const onlyNew = input("onlyNew").checked;
  const hint = document.getElementById("startHint");
  if (hint && state.preview && !state.running && onlyNew && state.preview.convert + state.preview.copy > 0) {
    hint.textContent = "Skip already converted files is on — the run will check the destination first.";
  }
};
var showSourceError = (message, kind = "bad") => {
  const node = $("sourceError");
  node.className = `inline-msg ${kind}`;
  node.textContent = message;
};
var clearSourceError = () => {
  const node = $("sourceError");
  node.className = "inline-msg hidden";
  node.textContent = "";
};
var showDestError = (message) => {
  const node = $("destError");
  node.className = "inline-msg bad";
  node.textContent = message;
};
var clearDestError = () => {
  const node = $("destError");
  node.className = "inline-msg hidden";
  node.textContent = "";
};
var applySource = async () => {
  const source = input("sourceRoot").value.trim();
  const previousSource = state.status?.sourceRoot ?? "";
  if (!source) {
    showSourceError("Enter a folder path.");
    input("sourceRoot").focus();
    return;
  }
  scanning = true;
  clearSourceError();
  $("btnScan").disabled = true;
  $("btnScan").textContent = "Scanning…";
  $("sourceInfo").textContent = "Validating…";
  updateChrome();
  try {
    const check = await api("validate", {
      method: "POST",
      body: { sourceRoot: source, destination: input("destination").value.trim() }
    });
    if (!check.ok) {
      throw new Error(check.error || "That folder is not readable.");
    }
    if (!check.isDirectory)
      throw new Error("That path is a file, not a folder.");
    await api("config", {
      method: "POST",
      body: {
        sourceRoot: source,
        destination: input("destination").value.trim(),
        budgetBytes: budgetBytes(),
        policy: policy()
      }
    });
    if (state.status) {
      state.status.sourceRoot = source;
      state.status.scanned = false;
    }
    const scan = await api("scan", {
      method: "POST",
      body: { sourceRoot: source }
    });
    state.status && (state.status.scanned = true);
    library.setScan(scan, true);
    state.lastEstimate = null;
    state.lastSync = null;
    state.preview = null;
    updateChrome();
    await refreshPreview();
    toast(`Scanned ${scan.totals.count.toLocaleString()} files in ${(scan.durationMs / 1000).toFixed(1)}s.`, "success");
    if (scan.riskyNames.length) {
      showSourceError(`${scan.riskyNames.length} folder name(s) can break copied paths: ${scan.riskyNames.slice(0, 2).map((entry) => entry.rel).join(", ")}. Using a non-standard slash character.`, "warn");
    }
  } catch (error) {
    showSourceError(formatError(error));
    if (!state.tree) {
      $("scanSummary").textContent = "not scanned";
    } else if (previousSource) {
      input("sourceRoot").value = previousSource;
    }
  } finally {
    scanning = false;
    $("btnScan").disabled = false;
    $("btnScan").textContent = "Scan";
    updateChrome();
  }
};
var applyDestination = async (previous) => {
  const destination = input("destination").value.trim();
  if (!destination) {
    showDestError("Choose an output folder.");
    input("destination").value = previous;
    return;
  }
  clearDestError();
  try {
    await save();
    await refreshPreview();
  } catch (error) {
    input("destination").value = previous;
    showDestError(formatError(error));
    toast(formatError(error), "danger");
  }
};
var pickFolder = async (kind) => {
  try {
    const result = await api("pick", {
      method: "POST",
      body: { title: kind === "source" ? "Choose the source photo folder" : "Choose the output folder" }
    });
    if (!result.path)
      return;
    if (kind === "source") {
      input("sourceRoot").value = result.path;
      await applySource();
    } else {
      const previous = input("destination").value;
      input("destination").value = result.path;
      await applyDestination(previous);
    }
  } catch (error) {
    toast(formatError(error), "danger");
  }
};
var chooseFormat = async (id) => {
  if (state.running || state.starting)
    return;
  if (id === state.currentFormat)
    return;
  const oldId = state.currentFormat;
  const oldSpec = state.formatSpecs[oldId];
  const newSpec = state.formatSpecs[id];
  if (!oldSpec || !newSpec)
    return;
  const oldMemory = state.formatMemory[oldId] ?? {
    quality: input("quality").valueAsNumber,
    speed: input("heicSpeed").valueAsNumber
  };
  state.formatMemory[oldId] = {
    quality: input("quality").valueAsNumber,
    speed: input("heicSpeed").valueAsNumber
  };
  const oldDestination = input("destination").value;
  const nextDestination = nextDestinationOnFormatChange(oldDestination, input("sourceRoot").value, oldSpec.destinationSuffix, newSpec.destinationSuffix, state.status?.caseInsensitive ?? true);
  formatUi.apply(id, true);
  if (nextDestination !== oldDestination) {
    input("destination").value = nextDestination;
    toast(`Destination updated to ${nextDestination}.`, "info");
  }
  try {
    await save();
    await refreshPreview();
  } catch (error) {
    state.formatMemory[oldId] = oldMemory;
    input("destination").value = oldDestination;
    formatUi.apply(oldId, true);
    toast(formatError(error), "danger");
  }
};
var renderExtToggles = () => {
  const host = $("extToggles");
  host.innerHTML = "";
  for (const [ext, enabled] of Object.entries(extEnabled)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ext-chip" + (enabled ? " on" : "");
    chip.textContent = `.${ext}`;
    chip.title = `${enabled ? "Include" : "Skip"} .${ext} files`;
    chip.addEventListener("click", () => {
      extEnabled[ext] = !extEnabled[ext];
      chip.classList.toggle("on", extEnabled[ext]);
      chip.title = `${extEnabled[ext] ? "Include" : "Skip"} .${ext} files`;
      schedulePreview();
    });
    host.append(chip);
  }
};
var setUndersize = (copy) => {
  input("copyUndersized").checked = copy;
  $("copyUnder").setAttribute("aria-pressed", String(copy));
  $("skipUnder").setAttribute("aria-pressed", String(!copy));
  $("minsizeNote").textContent = copy ? "Files under the floor are copied byte-for-byte, so no pixels are lost." : "Files under the floor are skipped. Nothing is written for them.";
  schedulePreview();
};
var updateMinSizeReadout = () => {
  $("minsizeOut").textContent = `${input("minsize").valueAsNumber.toFixed(2)} MB`;
};
var updateJobsReadout = () => {
  $("jobsOut").textContent = input("jobs").value;
  paintRange("jobs");
};
var updateCpuLimitReadout = () => {
  $("cpuLimitOut").textContent = `${input("cpuLimit").value}%`;
  paintRange("cpuLimit");
};
var paintRange = (id) => {
  const node = input(id);
  const min = Number(node.min) || 0;
  const max = Number(node.max) || 100;
  const value = node.valueAsNumber;
  const percent = max > min ? (value - min) / (max - min) * 100 : 0;
  node.style.setProperty("--fill", `${clamp(percent, 0, 100).toFixed(2)}%`);
};
var paintRanges = () => {
  for (const id of ["minsize", "jobs", "cpuLimit", "budget", "viewJobs", "viewCpuLimit"])
    paintRange(id);
};
var runEstimate = async () => {
  if (!state.tree) {
    toast("Scan a library first.", "warning");
    return;
  }
  const box = $("estimateBox");
  box.classList.remove("hidden");
  box.innerHTML = `<h4>Estimate <small>sampling real files</small></h4>
    <p class="empty-note">Encoding up to 120 images at the current recipe…</p>`;
  try {
    const estimate = await api("estimate", {
      method: "POST",
      body: {
        sampleSize: 120,
        jobs: clamp(input("jobs").valueAsNumber, 1, 16),
        policy: policy()
      }
    });
    state.lastEstimate = estimate;
    const ratio = estimate.ratio > 0 ? `${(1 / estimate.ratio).toFixed(1)}:1` : "—";
    box.innerHTML = `<h4>Estimate <small>${estimate.sampleSize.toLocaleString()} files sampled · ${escapeHtml(state.formatSpecs[estimate.format]?.shortLabel ?? estimate.format)}</small></h4>
      <dl class="kv">
        <dt>Measured ratio</dt><dd class="mono">${ratio}</dd>
        <dt>Mean output</dt><dd class="mono">${fmt(estimate.meanOutputBytes)}</dd>
        <dt>Projected output</dt><dd class="mono">${fmt(estimate.projectedOutputBytes)}</dd>
        <dt>Projected time</dt><dd class="mono">${dur(estimate.projectedSeconds)}</dd>
        <dt>Method</dt><dd>${estimate.method === "sampled" ? "Sampled encode" : "Flat ratio"} · ${dur(estimate.durationMs / 1000)}</dd>
      </dl>`;
    plan.render();
    await refreshPreview();
  } catch (error) {
    box.innerHTML = `<h4>Estimate</h4><p class="inline-msg">${escapeHtml(formatError(error))}</p>`;
  }
};
var undoManifest = async (id, summary) => {
  const detail = summary ? `${summary.converted.toLocaleString()} converted and ${summary.copied.toLocaleString()} copied files (${fmt(summary.bytes)}) are recorded in this manifest.` : `Every output recorded in manifest ${id} is a candidate.`;
  const ok = await ask({
    title: "Undo this run?",
    body: `<p class="modal-copy">${escapeHtml(detail)}</p>
      <p class="modal-copy">Only files recorded in the manifest are removed. Files outside the destination, or files changed since the run, are refused for safety. The source library is never touched.</p>`,
    confirmLabel: "Remove run outputs",
    danger: true
  });
  if (!ok)
    return;
  try {
    const result = await api("undo", { method: "POST", body: { id } });
    const refused = result.refused ? ` · ${result.refused.toLocaleString()} refused for safety` : "";
    const errors = result.errors.length ? ` · ${result.errors.length.toLocaleString()} errors` : "";
    toast(`Removed ${result.removed.toLocaleString()} files, freed ${fmt(result.bytesFreed)}${refused}${errors}.`, "success");
    if (state.lastManifestId === id) {
      state.lastManifestId = null;
      state.lastSummary = null;
      runView.renderDock();
      if (state.view === "run")
        runView.renderView();
    }
    await refreshPreview();
    await refreshStatus();
  } catch (error) {
    toast(formatError(error), "danger");
  }
};
var verifyJob = async (jobId) => api("verify", { method: "POST", body: { jobId } });
var runCompare = async (rel, format) => {
  const chosenFormat = format ?? state.currentFormat;
  const spec = state.formatSpecs[chosenFormat];
  return api("compare", {
    method: "POST",
    body: {
      rel,
      format: chosenFormat,
      qualities: spec?.compareQualities ?? [30, 50, 60, 70, 80]
    }
  });
};
var confirmResolve = null;
var setModalFoot = (html) => {
  const foot = $("modalFoot");
  if (!html) {
    foot.classList.add("hidden");
    foot.innerHTML = "";
    return;
  }
  foot.innerHTML = html;
  foot.classList.remove("hidden");
};
var plainModal = (title, html, size = "md") => {
  setModalFoot("");
  openModal(title, html, size);
};
var settleConfirm = (ok) => {
  const resolve = confirmResolve;
  confirmResolve = null;
  closeModal();
  setModalFoot("");
  resolve?.(ok);
};
var ask = (opts) => {
  if (confirmResolve)
    settleConfirm(false);
  openModal(opts.title, opts.body, "sm");
  setModalFoot(`<button id="modalCancel" class="btn ghost" type="button">${escapeHtml(opts.cancelLabel ?? "Cancel")}</button>` + `<button id="modalConfirm" class="btn ${opts.danger ? "danger" : "primary"}" type="button">${escapeHtml(opts.confirmLabel)}</button>`);
  $("modalCancel").addEventListener("click", () => settleConfirm(false));
  $("modalConfirm").addEventListener("click", () => settleConfirm(true));
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
};
var switchView = (view) => {
  state.view = view;
  $("workspace").classList.toggle("hidden", view !== "workspace");
  $("viewRun").classList.toggle("hidden", view !== "run");
  $("viewCompare").classList.toggle("hidden", view !== "compare");
  $("viewRuns").classList.toggle("hidden", view !== "runs");
  $("viewHealth").classList.toggle("hidden", view !== "health");
  if (view === "run")
    runView.renderView();
};
var actions = {
  switchView,
  refreshPreview,
  refreshTree: () => {
    library.refresh();
    updateChrome();
  },
  policy,
  toast,
  confirm: ask,
  startRun: (opts) => runLifecycle.start(opts),
  undoManifest,
  verifyJob,
  runCompare,
  selectedFiles: () => library.selected(),
  setQuality: (quality) => formatUi.setQuality(quality),
  checkMagick: (force) => checkMagick(force),
  refreshStatusMagick: async () => {
    await refreshStatus();
  },
  installMagick: () => installMagick()
};
var imKind = (im) => im.assetKind === "appimage" ? "AppImage" : "portable build";
var renderImPill = (im) => {
  const pill = $("imUpdate");
  if (im.updateAvailable && im.latest) {
    pill.classList.remove("hidden");
    pill.classList.toggle("warn", Boolean(im.installed));
    pill.textContent = im.installed ? `ImageMagick ${im.latest.version} available` : `Download ImageMagick ${im.latest.version}`;
    pill.title = im.installed ? `Installed ${shortVersion(im.installed.version)} — click to update` : `ImageMagick was not found — click to download the ${imKind(im)}`;
  } else if (!im.installed) {
    pill.classList.remove("hidden");
    pill.classList.add("warn");
    pill.textContent = "ImageMagick not found";
    pill.title = im.supported === false ? "Install ImageMagick 7 with AVIF support from your distribution" : `Click to download the ${imKind(im)}`;
  } else {
    pill.classList.add("hidden");
  }
};
var checkMagick = async (force = false) => {
  const im = await api(`imagemagick/check${force ? "?force=1" : ""}`);
  imStatus = im;
  state.imStatus = im;
  renderImPill(im);
  return im;
};
var startInstall = async (im) => {
  if (installing)
    return;
  installing = true;
  plainModal("Installing ImageMagick", `<p class="modal-copy">Downloading and verifying ImageMagick ${escapeHtml(im.latest?.version ?? "")}…</p>
     <div class="meter" style="margin-top:14px"><div id="imInstallFill"></div></div>
     <p id="imInstallNote" class="note" aria-live="polite">Starting the download…</p>`, "sm");
  const timer = window.setInterval(() => {
    (async () => {
      try {
        const p = await api("imagemagick/progress");
        const note = document.getElementById("imInstallNote");
        const fill = document.getElementById("imInstallFill");
        if (note && p.message)
          note.textContent = p.message;
        if (fill)
          setWidth(fill, Math.max(0, Math.min(100, p.percent)) / 100);
      } catch {}
    })();
  }, 700);
  try {
    const result = await api("imagemagick/install", {
      method: "POST",
      body: {}
    });
    try {
      localStorage.removeItem("imUpdateDismissed");
    } catch {}
    toast(`ImageMagick ${result.version} installed. Reloading…`, "success");
    window.setTimeout(() => window.location.reload(), 1200);
  } catch (error) {
    const note = document.getElementById("imInstallNote");
    const fill = document.getElementById("imInstallFill");
    if (note) {
      note.className = "inline-msg bad";
      note.textContent = formatError(error);
    }
    if (fill)
      fill.classList.add("over");
    toast(formatError(error), "danger");
    installing = false;
  } finally {
    window.clearInterval(timer);
  }
};
var openMagickModal = (im) => {
  const installed = im.installed ? `Installed <b>${escapeHtml(shortVersion(im.installed.version))}</b>${im.installed.avifWritable ? "" : " · AVIF unavailable"}` : `<span class="bad">ImageMagick was not found on this device.</span>`;
  const latest = im.latest ? `Latest on GitHub <b>${escapeHtml(im.latest.version)}</b>` : im.online ? "Latest version: unknown" : "Could not reach github.com.";
  const rows = [];
  if (im.latest) {
    rows.push(`<div class="fact-row"><span>${imKind(im)}</span><span class="mono">${escapeHtml(im.latest.asset.name)}</span></div>`);
    rows.push(`<div class="fact-row"><span>Download size</span><span>${fmt(im.latest.asset.size)}</span></div>`);
    rows.push(`<div class="fact-row"><span>Install into</span><span class="mono" title="${escapeHtml(im.installDir)}">${escapeHtml(im.installDir)}</span></div>`);
  }
  const notes = [];
  if (!im.supported) {
    notes.push("Automatic downloads are not available on this build. Install ImageMagick 7 with AVIF support using your package manager.");
  } else if (!im.online) {
    notes.push(`Could not reach github.com${im.error ? `: ${im.error}` : ""}. You can download the ${imKind(im)} manually and place it in the folder above.`);
  } else if (im.installed && !im.updateAvailable) {
    notes.push("ImageMagick is up to date.");
  }
  plainModal(im.installed ? "ImageMagick" : "ImageMagick is not installed", `<p class="modal-copy">${installed} &nbsp;·&nbsp; ${latest}</p>
     ${rows.length ? `<div class="fact-list" style="margin-top:12px">${rows.join("")}</div>` : ""}
     ${notes.map((note) => `<p class="note">${escapeHtml(note)}</p>`).join("")}
     <p class="note">A managed build lives inside this app's data folder. Originals are never touched.</p>`, "sm");
  const canInstall = im.supported && im.latest && (im.updateAvailable || !im.installed);
  setModalFoot(`<button id="imLater" class="btn ghost" type="button">${im.updateAvailable ? "Not now" : "Close"}</button>` + `<button id="imRecheck" class="btn ghost" type="button">Check again</button>` + (canInstall ? `<button id="imInstall" class="btn primary" type="button">${im.installed ? "Download update" : "Install ImageMagick"}</button>` : ""));
  $("imLater").addEventListener("click", () => {
    if (im.installed && im.updateAvailable && im.latest) {
      try {
        localStorage.setItem("imUpdateDismissed", im.latest.version);
      } catch {}
    }
    closeModal();
    setModalFoot("");
  });
  $("imRecheck").addEventListener("click", () => {
    const button = $("imRecheck");
    button.disabled = true;
    button.textContent = "Checking…";
    (async () => {
      try {
        const next = await checkMagick(true);
        openMagickModal(next);
      } catch (error) {
        button.disabled = false;
        button.textContent = "Check again";
        toast(formatError(error), "danger");
      }
    })();
  });
  document.getElementById("imInstall")?.addEventListener("click", () => {
    startInstall(im);
  });
};
var installMagick = async () => {
  if (installing)
    return;
  try {
    const im = imStatus ?? await checkMagick(false);
    openMagickModal(im);
  } catch (error) {
    toast(formatError(error), "danger");
  }
};
var appUpdateTimer = null;
var renderAppPill = (status) => {
  const pill = $("appUpdate");
  if (status.stage === "ready") {
    pill.classList.remove("hidden", "warn");
    pill.classList.add("ready");
    pill.textContent = `Update Ready (v${status.latestVersion}) — Click to Apply`;
    pill.title = `PicMagick GUI v${status.latestVersion} is downloaded and ready. Click to restart and apply.`;
  } else if (status.stage === "downloading") {
    pill.classList.remove("hidden", "ready");
    pill.classList.add("warn");
    pill.textContent = `Downloading App v${status.latestVersion} (${status.percent}%)`;
    pill.title = `Downloading update: ${status.percent}%`;
  } else if (status.updateAvailable && status.latestVersion) {
    pill.classList.remove("hidden", "ready");
    pill.classList.add("warn");
    pill.textContent = `PicMagick v${status.latestVersion} available`;
    pill.title = `New version v${status.latestVersion} available — click to review`;
  } else {
    pill.classList.add("hidden");
  }
};
var pollAppDownloadProgress = () => {
  if (appUpdateTimer !== null)
    return;
  appUpdateTimer = window.setInterval(() => {
    (async () => {
      try {
        const p = await api("app/update/progress");
        state.appUpdate = p;
        renderAppPill(p);
        const fill = document.getElementById("appDownloadFill");
        const note = document.getElementById("appDownloadNote");
        if (fill)
          setWidth(fill, Math.max(0, Math.min(100, p.percent)) / 100);
        if (note && p.message)
          note.textContent = p.message;
        if (p.stage === "ready") {
          if (appUpdateTimer !== null) {
            window.clearInterval(appUpdateTimer);
            appUpdateTimer = null;
          }
          toast(`PicMagick GUI v${p.latestVersion} is ready to install!`, "success");
          if (document.getElementById("appDownloadFill")) {
            openAppUpdateModal(p);
          }
        } else if (p.stage === "error") {
          if (appUpdateTimer !== null) {
            window.clearInterval(appUpdateTimer);
            appUpdateTimer = null;
          }
          toast(p.message || "Update download failed.", "danger");
        }
      } catch {}
    })();
  }, 750);
};
var openAppUpdateModal = (status) => {
  if (status.stage === "ready") {
    const isJobActive = state.running || state.run.state === "running" || state.run.state === "paused";
    plainModal("Update Ready to Install", `<p class="modal-copy">PicMagick GUI <strong>v${escapeHtml(status.latestVersion ?? "")}</strong> is downloaded and ready to install.</p>
       <div class="fact-list">
         <div class="fact-row"><span>New version</span><span class="mono">v${escapeHtml(status.latestVersion ?? "")}</span></div>
         <div class="fact-row"><span>Current version</span><span class="mono">v${escapeHtml(status.currentVersion)}</span></div>
         <div class="fact-row"><span>Package</span><span>Lean update (${escapeHtml(status.assetName ?? "package")})</span></div>
       </div>
       <p class="note">Applying the update will launch the installer and restart the app. Any bundled ImageMagick is preserved automatically.</p>
       ${isJobActive ? `<div class="inline-msg warn" style="margin-top:10px">A conversion job is in progress. Wait for it to complete or pause/cancel it before updating.</div>` : ""}`, "sm");
    setModalFoot(`<button id="btnAppReadyLater" class="btn ghost" type="button">Later</button>` + `<button id="btnAppApply" class="btn primary" type="button" ${isJobActive ? 'disabled="disabled"' : ""}>Restart & Apply Update</button>`);
    $("btnAppReadyLater").addEventListener("click", () => {
      closeModal();
      setModalFoot("");
    });
    $("btnAppApply").addEventListener("click", () => {
      (async () => {
        try {
          const btn = $("btnAppApply");
          btn.disabled = true;
          btn.textContent = "Restarting…";
          plainModal("Applying Update", `<p class="modal-copy ok">Launching the installer and restarting PicMagick GUI…</p>
             <p class="note">This window will close as the installer updates your application.</p>`, "sm");
          setModalFoot("");
          await api("app/update/apply", { method: "POST", body: {} });
        } catch (err) {
          toast(formatError(err), "danger");
          closeModal();
        }
      })();
    });
    return;
  }
  if (status.stage === "downloading") {
    plainModal(`Downloading PicMagick GUI v${escapeHtml(status.latestVersion ?? "")}`, `<p class="modal-copy">Downloading the update in the background…</p>
       <div class="meter" style="margin-top:14px"><div id="appDownloadFill"></div></div>
       <p id="appDownloadNote" class="note" aria-live="polite">${escapeHtml(status.message)}</p>
       <p class="note" style="margin-top:10px">You can close this dialog at any time. The download will continue in the background while you work.</p>`, "sm");
    const fill = document.getElementById("appDownloadFill");
    if (fill)
      setWidth(fill, Math.max(0, Math.min(100, status.percent)) / 100);
    setModalFoot(`<button id="btnAppDownloadDismiss" class="btn ghost" type="button">Hide (keep downloading)</button>`);
    $("btnAppDownloadDismiss").addEventListener("click", () => {
      closeModal();
      setModalFoot("");
    });
    pollAppDownloadProgress();
    return;
  }
  if (!status.isDesktop) {
    plainModal("PicMagick GUI Update Available", `<p class="modal-copy">PicMagick GUI <strong>v${escapeHtml(status.latestVersion ?? "")}</strong> is available on GitHub (current: v${escapeHtml(status.currentVersion)}).</p>
       <p class="modal-copy">You are running from a source checkout. Run <code>git pull && bun install</code> to update.</p>`, "sm");
    setModalFoot(`<button id="btnAppLater" class="btn ghost" type="button">Close</button>` + (status.releaseUrl ? `<a href="${escapeHtml(status.releaseUrl)}" target="_blank" class="btn primary" style="display:inline-flex;align-items:center;text-decoration:none">View on GitHub</a>` : ""));
    $("btnAppLater").addEventListener("click", () => {
      closeModal();
      setModalFoot("");
    });
    return;
  }
  plainModal("New Version of PicMagick Available", `<p class="modal-copy">PicMagick GUI <strong>v${escapeHtml(status.latestVersion ?? "")}</strong> is now available (you are on v${escapeHtml(status.currentVersion)}). Would you like to download it now?</p>
     <div class="fact-list">
       <div class="fact-row"><span>New version</span><span class="mono">v${escapeHtml(status.latestVersion ?? "")}</span></div>
       <div class="fact-row"><span>Current version</span><span class="mono">v${escapeHtml(status.currentVersion)}</span></div>
       <div class="fact-row"><span>Package</span><span>Lean update (${escapeHtml(status.assetName ?? "Setup")})</span></div>
       <div class="fact-row"><span>Download size</span><span>${fmt(status.totalBytes)}</span></div>
     </div>
     <p class="note">The update will download quietly in the background without interrupting your work. You can apply it whenever you are ready.</p>`, "sm");
  setModalFoot(`<button id="btnAppLater" class="btn ghost" type="button">Not now</button>` + `<button id="btnAppDownload" class="btn primary" type="button">Download update</button>`);
  $("btnAppLater").addEventListener("click", () => {
    try {
      if (status.latestVersion) {
        sessionStorage.setItem("appUpdateDismissed", status.latestVersion);
      }
    } catch {}
    closeModal();
    setModalFoot("");
  });
  $("btnAppDownload").addEventListener("click", () => {
    (async () => {
      try {
        toast(`Downloading PicMagick GUI v${status.latestVersion} in the background…`, "info");
        await api("app/update/download", { method: "POST", body: {} });
        status.stage = "downloading";
        status.percent = 0;
        status.message = "Starting download…";
        renderAppPill(status);
        openAppUpdateModal(status);
        pollAppDownloadProgress();
      } catch (err) {
        toast(formatError(err), "danger");
      }
    })();
  });
};
var checkApp = async (force = false, promptUser = false) => {
  const status = await api(`app/update${force ? "?force=1" : ""}`);
  state.appUpdate = status;
  renderAppPill(status);
  if (status.stage === "downloading") {
    pollAppDownloadProgress();
  } else if (status.stage === "ready") {
    if (promptUser) {
      openAppUpdateModal(status);
    }
  } else if (status.updateAvailable && status.latestVersion) {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem("appUpdateDismissed") === status.latestVersion;
    } catch {}
    if (promptUser || !dismissed) {
      openAppUpdateModal(status);
    }
  }
  return status;
};
var handleAppUpdateClick = () => {
  if (state.appUpdate) {
    openAppUpdateModal(state.appUpdate);
  } else {
    checkApp(false, true);
  }
};
var openAbout = () => {
  const status = state.status;
  plainModal("About picmagick-gui", `<p class="modal-copy">A local-first photo converter. The source library is only ever read; every output is written to a separate destination and recorded in an undoable manifest.</p>
     <div class="fact-list">
       <div class="fact-row"><span>Version</span><span>v1.2.0</span></div>
       <div class="fact-row"><span>Check for updates</span><button id="btnAboutCheckUpdate" class="btn ghost sm" type="button">Check now</button></div>
       <div class="fact-row"><span>Platform</span><span>${escapeHtml(platformName(status?.platform ?? ""))} · ${escapeHtml(status?.arch ?? "—")}</span></div>
       <div class="fact-row"><span>ImageMagick</span><span>${status?.magick ? escapeHtml(shortVersion(status.magick.version)) : "not found"}</span></div>
       <div class="fact-row"><span>Destination</span><span class="mono" title="${escapeHtml(status?.destination ?? "")}">${escapeHtml(middlePath(status?.destination ?? "—", 56))}</span></div>
     </div>
     <h3 style="margin:18px 0 8px">Keyboard</h3>
     <div class="fact-list">
       <div class="fact-row"><span>${escapeHtml(modKey())} + Enter</span><span>Start conversion</span></div>
       <div class="fact-row"><span>/</span><span>Focus the library filter</span></div>
       <div class="fact-row"><span>Esc</span><span>Close the current view, drawer, or dialog</span></div>
     </div>`, "sm");
  document.getElementById("btnAboutCheckUpdate")?.addEventListener("click", () => {
    closeModal();
    checkApp(true, true);
  });
};
var showServerStopped = () => {
  plainModal("Server closed", `<p class="modal-copy ok">picmagick-gui has stopped. You can close this tab.</p>`, "sm");
  $("btnQuit").setAttribute("disabled", "disabled");
};
var quitServer = () => {
  (async () => {
    const ok = await ask({
      title: "Close picmagick-gui",
      body: `<p class="modal-copy">Stop the local server?</p>
        <p class="modal-copy">The page will lose its connection. Files already written stay on disk. A running or paused conversion blocks shutdown until it is paused, resumed, or cancelled.</p>`,
      confirmLabel: "Close server",
      danger: true
    });
    if (!ok)
      return;
    try {
      await api("shutdown", { method: "POST", body: {} });
      showServerStopped();
    } catch (error) {
      let alive = true;
      try {
        await fetch("/api/status", { cache: "no-store" });
      } catch {
        alive = false;
      }
      if (!alive) {
        showServerStopped();
        return;
      }
      plainModal("Server still running", `<p class="modal-copy bad">${escapeHtml(formatError(error))}</p>
         <p class="modal-copy">Pause or cancel the conversion, then try again.</p>`, "sm");
    }
  })();
};
var themeIds = [...THEME_IDS];
var storedTheme = () => {
  try {
    const saved = localStorage.getItem("picmagik.theme");
    if (saved === "auto" || themeIds.includes(saved))
      return saved;
  } catch {}
  return "auto";
};
var applyTheme = (choice, persist = true) => {
  themeChoice = choice;
  state.themeChoice = choice;
  const resolved = choice === "auto" ? window.matchMedia("(prefers-color-scheme: light)").matches ? "daylight" : "midnight" : choice;
  document.documentElement.dataset.theme = resolved;
  if (persist) {
    try {
      localStorage.setItem("picmagik.theme", choice);
    } catch {}
  }
  const pick = document.getElementById("themePick");
  if (pick)
    pick.value = choice;
};
var railTargets = {
  source: "sourceRoot",
  select: "treeFilter",
  output: "formatCards",
  review: "planHero",
  run: "btnStart"
};
var railStep = (step) => {
  if (step === "run" && (state.run.id || state.running || state.lastSummary)) {
    runView.open();
    return;
  }
  const target = document.getElementById(railTargets[step] ?? "");
  target?.scrollIntoView({ block: "center", behavior: "smooth" });
  if (step === "source")
    input("sourceRoot").focus();
  if (step === "select")
    library.focus();
  if (step === "output") {
    if (state.view !== "workspace")
      switchView("workspace");
    document.querySelector("#formatCards .format-card:not(:disabled)")?.focus();
  }
  if (step === "review") {
    if (state.view !== "workspace")
      switchView("workspace");
    $("planHero").scrollIntoView({ block: "start", behavior: "smooth" });
  }
  if (step === "run")
    $("btnStart").focus();
};
var closeOverflow = () => {
  $("overflowMenu").classList.add("hidden");
  $("btnOverflow").setAttribute("aria-expanded", "false");
};
var toggleOverflow = () => {
  const menu = $("overflowMenu");
  const open = menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !open);
  $("btnOverflow").setAttribute("aria-expanded", String(open));
};
var boot = async () => {
  applyTheme(storedTheme(), false);
  initSplitPanes();
  try {
    const status = await api("status");
    applyStatusMeta(status);
    state.excluded = new Set(status.policy.excludedFolders);
    state.included = new Set(status.policy.includedFolders);
    state.excludedFiles = new Set(status.policy.excludedFiles);
    state.includedFiles = new Set(status.policy.includedFiles);
    extEnabled = { ...status.policy.extEnabled };
    input("minsize").value = String(status.policy.minSizeBytes / 1024 ** 2);
    input("copyUndersized").checked = status.policy.copyUndersized;
    input("includeRaw").checked = status.policy.includeRaw;
    input("flattenGif").checked = status.policy.flattenGif;
    input("heicSpeed").value = String(status.policy.heicSpeed);
    formatUi.init(status);
    renderExtToggles();
    setUndersize(status.policy.copyUndersized);
    updateMinSizeReadout();
    updateJobsReadout();
    updateCpuLimitReadout();
    paintRanges();
    updateStartOptions();
    if (status.liveJobId) {
      await runLifecycle.attach(status.liveJobId, true);
    }
    if (status.scanned) {
      const scan = await api("scan", { method: "POST", body: {} });
      library.setScan(scan, false);
      await refreshPreview();
    } else {
      plan.render();
      updateChrome();
    }
    checkMagick(false).catch((error) => {
      toast(formatError(error), "warning");
    });
    checkApp(false).catch((error) => {
      console.warn("App update check failed:", error);
    });
  } catch (error) {
    toast(formatError(error), "danger");
    plan.render();
    updateChrome();
  } finally {
    state.booted = true;
    document.documentElement.classList.add("booted");
  }
};
runView = createRunView(actions);
compareView = createCompareView(actions);
runsView = createRunsView(actions);
healthView = createHealthView(actions);
auditView = createAuditView(actions);
library = createLibrary({
  onChange: () => updateChrome(),
  onPreview: () => schedulePreview(),
  onToast: (message, kind) => toast(message, kind)
});
plan = createPlan({
  onStart: () => void runLifecycle.start(),
  onEstimate: () => void runEstimate(),
  onSync: () => auditView.open("sync"),
  onCompare: () => compareView.open(),
  onAudit: () => auditView.open("sync"),
  onHealth: () => healthView.open(),
  onReviewBudget: () => {
    if (state.view !== "workspace")
      switchView("workspace");
    $("folderSection").scrollIntoView({ block: "start", behavior: "smooth" });
  }
});
formatUi = createFormatUi({
  onSelect: (id) => void chooseFormat(id),
  onPreview: () => schedulePreview(),
  onToast: (message) => toast(message, "warning")
});
runLifecycle = createRunLifecycle({
  policy,
  save,
  render: () => {
    runView.renderDock();
    if (state.view === "run")
      runView.renderView();
    plan.render();
    updateChrome();
  },
  openRunView: () => runView.open(),
  onFinished: async () => {
    runView.renderDock();
    if (state.view === "run")
      runView.renderView();
    await refreshPreview();
    await refreshStatus();
  },
  onError: (message) => toast(message, "danger"),
  onInfo: (message) => toast(message, "success"),
  lockFormat: (locked) => formatUi.lock(locked)
});
$("btnPickSource").addEventListener("click", () => void pickFolder("source"));
$("btnPick").addEventListener("click", () => void pickFolder("destination"));
$("btnScan").addEventListener("click", () => void applySource());
$("sourceRoot").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applySource();
  }
});
var destinationBefore = "";
input("destination").addEventListener("focus", () => {
  destinationBefore = input("destination").value;
});
input("destination").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    input("destination").blur();
  }
});
input("destination").addEventListener("change", () => {
  const previous = destinationBefore || input("destination").value;
  destinationBefore = input("destination").value;
  if (input("destination").value.trim() !== previous.trim()) {
    applyDestination(previous);
  }
});
input("minsize").addEventListener("input", () => {
  updateMinSizeReadout();
  paintRange("minsize");
  schedulePreview();
});
$("copyUnder").addEventListener("click", () => setUndersize(true));
$("skipUnder").addEventListener("click", () => setUndersize(false));
input("includeRaw").addEventListener("change", () => schedulePreview());
input("flattenGif").addEventListener("change", () => schedulePreview());
input("budget").addEventListener("input", () => {
  $("budgetOut").textContent = `${input("budget").value} GB`;
  paintRange("budget");
  schedulePreview();
});
input("jobs").addEventListener("input", () => {
  updateJobsReadout();
  runLifecycle.setJobs(input("jobs").valueAsNumber);
});
input("viewJobs").addEventListener("input", () => {
  $("viewJobsOut").textContent = input("viewJobs").value;
  input("jobs").value = input("viewJobs").value;
  updateJobsReadout();
  paintRange("viewJobs");
  runLifecycle.setJobs(input("viewJobs").valueAsNumber);
});
input("cpuLimit").addEventListener("input", () => {
  updateCpuLimitReadout();
  input("viewCpuLimit").value = input("cpuLimit").value;
  $("viewCpuLimitOut").textContent = `${input("cpuLimit").value}%`;
  paintRange("viewCpuLimit");
  runLifecycle.setCpuLimit(input("cpuLimit").valueAsNumber);
});
input("viewCpuLimit").addEventListener("input", () => {
  $("viewCpuLimitOut").textContent = `${input("viewCpuLimit").value}%`;
  input("cpuLimit").value = input("viewCpuLimit").value;
  updateCpuLimitReadout();
  paintRange("viewCpuLimit");
  runLifecycle.setCpuLimit(input("viewCpuLimit").valueAsNumber);
});
input("overwrite").addEventListener("change", updateStartOptions);
input("onlyNew").addEventListener("change", updateStartOptions);
$("btnPause").addEventListener("click", () => void runLifecycle.pause());
$("viewPause").addEventListener("click", () => void runLifecycle.pause());
$("btnResume").addEventListener("click", () => void runLifecycle.resume());
$("viewResume").addEventListener("click", () => void runLifecycle.resume());
$("btnCancel").addEventListener("click", () => void runLifecycle.cancel());
$("viewCancel").addEventListener("click", () => void runLifecycle.cancel());
$("btnDiscard").addEventListener("click", () => void runLifecycle.cancel());
$("btnHealth").addEventListener("click", () => healthView.open());
$("btnRuns").addEventListener("click", () => {
  closeOverflow();
  runsView.open();
});
$("btnAbout").addEventListener("click", () => {
  closeOverflow();
  openAbout();
});
$("btnAboutBrand").addEventListener("click", openAbout);
$("btnQuit").addEventListener("click", () => {
  closeOverflow();
  quitServer();
});
$("appUpdate").addEventListener("click", handleAppUpdateClick);
$("imUpdate").addEventListener("click", () => void installMagick());
$("btnOverflow").addEventListener("click", (event) => {
  event.stopPropagation();
  toggleOverflow();
});
$("themePick").addEventListener("change", () => {
  const choice = $("themePick").value;
  applyTheme(choice);
});
for (const button of document.querySelectorAll(".rail-step")) {
  button.addEventListener("click", () => railStep(button.dataset.step ?? ""));
}
for (const button of document.querySelectorAll("[data-back]")) {
  button.addEventListener("click", () => switchView("workspace"));
}
$("modalClose").addEventListener("click", () => {
  if (confirmResolve)
    settleConfirm(false);
  else {
    closeModal();
    setModalFoot("");
  }
});
$("modal").addEventListener("close", () => {
  const resolve = confirmResolve;
  confirmResolve = null;
  setModalFoot("");
  resolve?.(false);
});
$("modal").addEventListener("click", (event) => {
  if (event.target !== $("modal"))
    return;
  if (confirmResolve)
    settleConfirm(false);
  else {
    closeModal();
    setModalFoot("");
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".overflow-wrap"))
    closeOverflow();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if ($("modal").open) {
      if (confirmResolve)
        settleConfirm(false);
      else {
        closeModal();
        setModalFoot("");
      }
      return;
    }
    if (!$("overflowMenu").classList.contains("hidden")) {
      closeOverflow();
      $("btnOverflow").focus();
      return;
    }
    if (auditView.handleKey(event))
      return;
    if (state.view === "compare" && compareView.handleKey(event))
      return;
    if (state.view !== "workspace") {
      event.preventDefault();
      switchView("workspace");
    }
    return;
  }
  if (state.view === "compare" && compareView.handleKey(event))
    return;
  const tag = event.target?.tagName ?? "";
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    if (!state.running && !state.starting)
      runLifecycle.start();
    return;
  }
  if (event.key === "/" && !typing) {
    event.preventDefault();
    library.focus();
  }
});
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (themeChoice === "auto")
    applyTheme("auto", false);
});
window.addEventListener("beforeunload", () => {
  state.es?.close();
});
themeChoice = storedTheme();
state.themeChoice = themeChoice;
$("themePick").value = themeChoice;
boot();
