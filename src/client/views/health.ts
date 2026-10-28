/**
 * Health view — readiness verdict, system checks, format support, and the
 * managed ImageMagick build. Every value is server-reported; the view does not
 * infer writability from a format name.
 */
import { api } from "../api";
import { $, escapeHtml, fmt, icon, relativeTime, shortVersion } from "../dom";
import { state } from "../state";
import type { HealthReport, OutputFormat, UpdateStatus } from "../types";
import type { ViewActions } from "./shared";
import { checkIcon, statusWord } from "./shared";

export type HealthViewController = {
  open: () => void;
  refresh: () => Promise<void>;
};

export function createHealthView(actions: ViewActions): HealthViewController {
  let busy = false;
  let lastHealth: HealthReport | null = null;
  let lastIm: UpdateStatus | null = null;

  const supportRow = (format: OutputFormat): string => {
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

  const imCard = (): string => {
    const im = lastIm;
    if (!im) return `<section class="health-section"><h3>ImageMagick</h3><p class="health-note">Could not read update status.</p></section>`;
    const installed = im.installed;
    const kind = im.assetKind === "appimage" ? "AppImage" : "portable build";
    const platform = state.status?.platform === "linux" ? "Linux" : "Windows";
    const update = im.updateAvailable && im.latest;
    const lines: string[] = [];

    if (installed) {
      lines.push(`<div class="fact-row"><span>Installed</span><span>${escapeHtml(shortVersion(installed.version))}${installed.avifWritable ? "" : " · AVIF unavailable"}</span></div>`);
      lines.push(`<div class="fact-row"><span>Path</span><span class="mono" title="${escapeHtml(installed.path)}">${escapeHtml(installed.path)}</span></div>`);
      if (installed.libheif) lines.push(`<div class="fact-row"><span>libheif</span><span>${escapeHtml(installed.libheif)}</span></div>`);
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

    const notes: string[] = [];
    if (!im.supported) {
      notes.push(`Automatic downloads are not available on this ${platform} build. Install ImageMagick 7 with AVIF support using your package manager.`);
    } else if (!im.online) {
      notes.push(`Could not reach github.com${im.error ? `: ${im.error}` : "."} The installed build is still usable.`);
    } else if (im.installed && !im.managed && update && im.assetKind === "appimage") {
      notes.push("The system ImageMagick cannot encode AVIF; the AppImage will take priority after installation.");
    }

    const actions: string[] = [];
    if (im.supported && update && im.latest) {
      actions.push(`<button class="btn primary sm" type="button" data-health-install>${im.installed ? "Download update" : "Install ImageMagick"} ${escapeHtml(im.latest.version)}</button>`);
    }

    return `<section class="health-section">
      <div class="section-head"><h3>ImageMagick</h3><span class="chip ${im.supported ? (im.online ? "ok" : "warn") : "warn"}">${im.supported ? (im.online ? "Supported" : "Offline") : "Manual install"}</span></div>
      <div class="fact-list">${lines.join("")}</div>
      ${notes.map((note) => `<p class="health-note">${escapeHtml(note)}</p>`).join("")}
      <div class="health-actions">${actions.join("")}</div>
    </section>`;
  };

  const render = (): void => {
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

    const checks = `<div class="health-grid">${health.checks
      .map((check) => `<div class="health-check" data-status="${check.status}">
        <span class="health-check-icon">${icon(checkIcon(check.status), 16)}</span>
        <div><h4>${escapeHtml(check.label)} <span class="muted">· ${statusWord(check.status)}</span></h4><p>${escapeHtml(check.detail)}</p></div>
      </div>`)
      .join("")}</div>`;

    const matrix = `<section class="health-section">
      <div class="section-head"><h3>Format support</h3><span class="section-meta">${health.magick ? escapeHtml(shortVersion(health.magick.version)) : "ImageMagick not found"}</span></div>
      <table class="data-table support-table">
        <thead><tr><th>Format</th><th>Extension</th><th>Mode</th><th>Status</th><th>Encoder</th></tr></thead>
        <tbody>${(Object.keys(state.formatSpecs).length ? Object.keys(state.formatSpecs) : ["jxl", "avif", "webp", "heic", "jp2", "jpeg", "png"]).map((id) => supportRow(id as OutputFormat)).join("")}</tbody>
      </table>
    </section>`;

    $("healthBody").innerHTML = banner + checks + matrix + imCard();
  };

  const refresh = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    $("healthBody").innerHTML = `<p class="empty-note">Reading ImageMagick, source, destination, and disk state…</p>`;
    try {
      const [health, im] = await Promise.all([
        api<HealthReport>("health"),
        actions.checkMagick(false),
      ]);
      lastHealth = health;
      lastIm = im;
      render();
    } catch (error) {
      $("healthBody").innerHTML = `<p class="inline-msg">${escapeHtml((error as Error).message)}</p>`;
    } finally {
      busy = false;
    }
  };

  $("healthRecheck").addEventListener("click", () => void refresh());

  $("healthBody").addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("[data-health-install]")) return;
    void actions.installMagick().then(refresh);
  });

  const open = (): void => {
    actions.switchView("health");
    void refresh();
  };

  return { open, refresh };
}
