/**
 * Audit drawer — Sync, Duplicates, and Dates.
 *
 * Each tab owns its own request, loading state, empty state, and error state.
 * Audits never mutate files; the only actions are selection changes (exclude
 * duplicates) and starting the incremental run that Sync proposes.
 */
import { api } from "../api";
import { $, escapeHtml, fmt } from "../dom";
import { state } from "../state";
import type { DatesResponse, DuplicatesResponse, SyncResponse } from "../types";
import type { ViewActions } from "./shared";

type AuditTab = "sync" | "duplicates" | "dates";

export type AuditViewController = {
  open: (tab?: AuditTab) => void;
  close: () => void;
  isOpen: () => boolean;
  handleKey: (event: KeyboardEvent) => boolean;
};

const loading = (label: string): string =>
  `<div class="empty-state"><span class="spinner"></span><p class="empty-title">${escapeHtml(label)}</p><p class="empty-note">This runs locally; nothing leaves your machine.</p></div>`;

const errorBox = (message: string): string =>
  `<p class="inline-msg">${escapeHtml(message)}</p>`;

const base = (rel: string): string => rel.split(/[\\/]/).pop() ?? rel;

export function createAuditView(actions: ViewActions): AuditViewController {
  let tab: AuditTab = "sync";
  let busy: AuditTab | null = null;
  let lastFocus: HTMLElement | null = null;
  let syncData: SyncResponse | null = null;
  let dupeData: DuplicatesResponse | null = null;
  let datesData: DatesResponse | null = null;

  const drawer = $("auditDrawer");
  const backdrop = $("auditBackdrop");

  const setTab = (next: AuditTab, fetchIt = true): void => {
    tab = next;
    const tabs: Record<AuditTab, string> = { sync: "tabSync", duplicates: "tabDuplicates", dates: "tabDates" };
    const panels: Record<AuditTab, string> = { sync: "syncBox", duplicates: "dupeBox", dates: "datesBox" };
    for (const [name, id] of Object.entries(tabs)) {
      const button = $(id);
      button.setAttribute("aria-selected", String(name === next));
    }
    for (const [name, id] of Object.entries(panels)) {
      $(id).classList.toggle("hidden", name !== next);
    }
    if (!fetchIt) return;
    if (next === "sync") void runSync();
    if (next === "duplicates") void runDuplicates();
    if (next === "dates") void runDates();
  };

  const renderSync = (data: SyncResponse): void => {
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
      ${pending
        ? `<div class="drawer-actions"><button class="btn primary sm" type="button" data-sync-run>Convert pending ${pending.toLocaleString()}</button><button class="btn ghost sm" type="button" data-audit-run="sync">Run again</button></div>`
        : `<p class="ok">Everything in scope is already converted.</p><div class="drawer-actions"><button class="btn ghost sm" type="button" data-audit-run="sync">Run again</button></div>`}
    </div>`;
  };

  const runSync = async (): Promise<void> => {
    if (busy) return;
    busy = "sync";
    $("syncBox").innerHTML = loading("Comparing input against output…");
    try {
      const data = await api<SyncResponse>("sync", { method: "POST", body: { policy: actions.policy() } });
      renderSync(data);
    } catch (error) {
      $("syncBox").innerHTML = `<h4>Sync</h4>${errorBox((error as Error).message)}<div class="drawer-actions"><button class="btn ghost sm" type="button" data-audit-run="sync">Try again</button></div>`;
      $("syncMeta").textContent = "unavailable";
    } finally {
      busy = null;
    }
  };

  const renderDuplicates = (data: DuplicatesResponse): void => {
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

  const runDuplicates = async (): Promise<void> => {
    if (busy) return;
    busy = "duplicates";
    $("dupeBox").innerHTML = loading("Hashing files…");
    try {
      const data = await api<DuplicatesResponse>("duplicates", { method: "POST", body: { maxHash: 6000 } });
      renderDuplicates(data);
    } catch (error) {
      $("dupeBox").innerHTML = `<h4>Duplicates</h4>${errorBox((error as Error).message)}<div class="drawer-actions"><button class="btn ghost sm" type="button" data-audit-run="duplicates">Try again</button></div>`;
    } finally {
      busy = null;
    }
  };

  const renderDates = (data: DatesResponse): void => {
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

  const runDates = async (): Promise<void> => {
    if (busy) return;
    busy = "dates";
    $("datesBox").innerHTML = loading("Reading EXIF dates…");
    try {
      const data = await api<DatesResponse>("dates", { method: "POST", body: {} });
      renderDates(data);
    } catch (error) {
      $("datesBox").innerHTML = `<h4>Dates</h4>${errorBox((error as Error).message)}<div class="drawer-actions"><button class="btn ghost sm" type="button" data-audit-run="dates">Try again</button></div>`;
    } finally {
      busy = null;
    }
  };

  const open = (next: AuditTab = "sync"): void => {
    lastFocus = document.activeElement as HTMLElement | null;
    drawer.classList.remove("hidden");
    backdrop.classList.remove("hidden");
    drawer.setAttribute("aria-hidden", "false");
    $("auditTitle").textContent =
      next === "sync" ? "Library sync"
        : next === "duplicates" ? "Duplicate files"
        : "Capture dates";
    setTab(next, true);
    window.setTimeout(() => $(next === "sync" ? "tabSync" : next === "duplicates" ? "tabDuplicates" : "tabDates").focus(), 30);
  };

  const close = (): void => {
    drawer.classList.add("hidden");
    backdrop.classList.add("hidden");
    drawer.setAttribute("aria-hidden", "true");
    lastFocus?.focus?.();
  };

  const isOpen = (): boolean => !drawer.classList.contains("hidden");

  const handleKey = (event: KeyboardEvent): boolean => {
    if (!isOpen()) return false;
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
    const target = event.target as HTMLElement;
    if (target.closest("[data-audit-run]")) {
      const which = target.closest<HTMLElement>("[data-audit-run]")?.dataset.auditRun;
      if (which === "sync") void runSync();
      if (which === "duplicates") void runDuplicates();
      if (which === "dates") void runDates();
      return;
    }
    if (target.closest("[data-sync-run]")) {
      close();
      void actions.startRun({ onlyNew: true });
      return;
    }
    const exclude = target.closest<HTMLButtonElement>("[data-exclude-dupes]");
    if (exclude) {
      const listed = dupeData?.groups.slice(0, 10) ?? [];
      const count = listed.reduce((sum, group) => sum + Math.max(0, group.members.length - 1), 0);
      if (!count) return;
      void (async () => {
        const ok = await actions.confirm({
          title: "Exclude duplicate files?",
          body: `<p class="modal-copy">This deselects <strong>${count.toLocaleString()} duplicate files</strong> from the conversion. The originals stay on disk; only the selection changes.</p>
                 <p class="modal-copy">The first file in each duplicate group stays selected.</p>`,
          confirmLabel: `Exclude ${count.toLocaleString()} files`,
          danger: true,
        });
        if (!ok) return;
        let removed = 0;
        for (const group of listed) {
          for (const member of group.members.slice(1)) {
            state.excludedFiles.add(member.rel);
            state.includedFiles.delete(member.rel);
            removed++;
          }
        }
        actions.refreshTree();
        void actions.refreshPreview();
        actions.toast(`Excluded ${removed.toLocaleString()} duplicate files from the selection.`, "success");
      })();
    }
  });

  return { open, close, isOpen, handleKey };
}
