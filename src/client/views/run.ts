/**
 * Run + Results view, and the floating run dock.
 *
 * Both surfaces read the same `state.run` snapshot. The dock stays available
 * while the user keeps working; the full view adds the activity log, run
 * controls, verification, and undo.
 */
import { $, dur, eta, escapeHtml, fmt, icon, setWidth } from "../dom";
import { state } from "../state";
import type { FileResult, JobState } from "../types";
import type { ViewActions } from "./shared";

const stateWord = (value: JobState): string => {
  switch (value) {
    case "running": return "Running";
    case "paused": return "Paused";
    case "done": return "Complete";
    case "cancelled": return "Cancelled";
    case "failed": return "Failed";
    default: return "Idle";
  }
};

const statusIcon = (status: FileResult["status"]): string => {
  switch (status) {
    case "converted": return "check-circle";
    case "copied": return "folder";
    case "failed": return "alert-octagon";
    case "cancelled": return "x";
    default: return "chevron-right";
  }
};

export type RunViewController = {
  renderDock: () => void;
  renderView: () => void;
  open: () => void;
  resetDock: () => void;
};

export function createRunView(actions: ViewActions): RunViewController {
  let dockDismissed = false;
  let lastDockState = "";

  const percent = (): number =>
    state.run.total > 0 ? Math.min(100, (state.run.done / state.run.total) * 100) : 0;

  const countsHtml = (): string => {
    const r = state.run;
    return [
      `<span>${r.done.toLocaleString()} / ${r.total.toLocaleString()}</span>`,
      `<span class="ok">${r.converted.toLocaleString()} converted</span>`,
      `<span>${r.copied.toLocaleString()} copied</span>`,
      `<span>${r.skipped.toLocaleString()} skipped</span>`,
      `<span class="${r.failed ? "bad" : ""}">${r.failed.toLocaleString()} failed</span>`,
    ].join("");
  };

  const renderDock = (): void => {
    const bar = $("runbar");
    const r = state.run;
    const visible = !dockDismissed && r.id !== null && r.state !== "idle";
    bar.classList.toggle("hidden", !visible);
    $("app").classList.toggle("dock-open", visible);
    if (!visible) return;

    bar.dataset.state = r.state;
    const dot = $("runDot");
    dot.className =
      "status-dot " +
      (r.state === "running" ? "running"
        : r.state === "paused" ? "warn"
        : r.state === "done" ? "ok"
        : r.state === "failed" ? "bad" : "warn");

    let status = "";
    if (r.state === "running") {
      status = r.note ?? (r.done > 0
        ? `Converting — ${r.done.toLocaleString()} of ${r.total.toLocaleString()}`
        : `Converting ${r.total.toLocaleString()} files`);
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
    $("runEta").textContent =
      r.state === "running" && r.etaSeconds != null
        ? `ETA ${eta(r.etaSeconds)} · elapsed ${dur(r.elapsedSeconds)}`
        : r.state === "done"
          ? `elapsed ${dur(r.elapsedSeconds)}`
          : "";
    $("runBytes").textContent = r.bytes > 0 ? fmt(r.bytes) : "";
    $("runFile").textContent = r.startingRel
      ? `encoding ${r.startingRel}${r.startingBytes != null ? ` (${fmt(r.startingBytes)})` : ""}`
      : r.lastRel
        ? `${r.lastStatus ?? "done"} ${r.lastRel}`
        : "";

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
      const text = s
        ? `${s.converted.toLocaleString()} converted · ${s.copied.toLocaleString()} copied · ${fmt(s.bytes)}${s.failed ? ` · ${s.failed} failed` : ""}`
        : r.state === "failed"
          ? (state.lastJobError ?? "The run failed.")
          : "The run finished.";
      $("runCompleteText").textContent = text;
      $("btnQuickUndo").classList.toggle("hidden", !state.lastManifestId);
    }

    // A dock that changes width between states would jitter; only the state
    // attributes change, so keep the element in place.
    lastDockState = r.state;
    void lastDockState;
  };

  const activityHtml = (): string => {
    if (!state.activity.length) {
      return `<p class="empty-note" style="padding:14px">Results appear here as files finish.</p>`;
    }
    const rows = state.activity.slice(-200).reverse();
    return rows
      .map((f) => {
        const out = f.outBytes > 0 ? fmt(f.outBytes) : "—";
        return `<div class="activity-row">
          <span class="activity-status ${f.status}">${icon(statusIcon(f.status), 14)}</span>
          <span class="activity-name" title="${escapeHtml(f.rel)}">${escapeHtml(f.rel)}</span>
          <span class="activity-type">${f.status}</span>
          <span class="activity-time">${f.seconds > 0 ? f.seconds.toFixed(1) + "s" : "—"}</span>
          <span class="activity-size">${out}</span>
        </div>`;
      })
      .join("");
  };

  const resultsHtml = (): string => {
    const s = state.lastSummary;
    if (!s) return "";
    const failed = s.failed > 0;
    const tone = state.run.state === "failed" || failed ? "bad" : "ok";
    const title =
      state.run.state === "failed" ? "Run failed"
        : s.note === "cancelled" ? "Run cancelled"
        : "Run complete";
    const sub =
      s.note === "cancelled"
        ? `Stopped after ${dur(s.elapsedSeconds)}. Completed files are on disk and will be skipped next time.`
        : `Finished in ${dur(s.elapsedSeconds)} · ${fmt(s.bytes)} written`;

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

  const renderView = (): void => {
    const r = state.run;
    const pct = percent();
    $("runViewTitle").textContent = r.id ? `Run · ${r.id.slice(-8)}` : "Run";
    const pill = $("runViewState");
    pill.dataset.state = r.state;
    pill.textContent = stateWord(r.state);
    $("runHeroPct").textContent = `${Math.round(pct)}%`;
    $("runHeroLabel").textContent =
      r.state === "running" ? (r.note ?? "Converting…")
        : r.state === "paused" ? "Paused — completed files stay on disk"
        : r.state === "done" ? "Complete"
        : r.state === "cancelled" ? "Cancelled"
        : r.state === "failed" ? (state.lastJobError ?? "Failed")
        : "No run yet";
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
    $("runActivityMeta").textContent = state.activity.length
      ? `${state.activity.length.toLocaleString()} finished · since this page opened`
      : "Since this page opened";

    const jobs = $<HTMLInputElement>("jobs");
    const viewJobs = $<HTMLInputElement>("viewJobs");
    if (document.activeElement !== viewJobs) viewJobs.value = jobs.value;
    $("viewJobsOut").textContent = viewJobs.value;
  };

  // Delegated result actions. Bound once; the container is re-rendered.
  $("runResults").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-run-action]");
    if (!button) return;
    const action = button.dataset.runAction;
    if (action === "workspace") actions.switchView("workspace");
    if (action === "undo" && state.lastManifestId) {
      void actions.undoManifest(state.lastManifestId, state.lastSummary ?? undefined);
    }
    if (action === "verify" && state.lastJobId) {
      void verify();
    }
  });

  const verify = async (): Promise<void> => {
    const jobId = state.lastJobId;
    if (!jobId) return;
    const host = $("verifyResult");
    host.innerHTML = `<p class="empty-note">Checking outputs…</p>`;
    try {
      const report = await actions.verifyJob(jobId);
      const failed = report.failed > 0;
      host.innerHTML = `<div class="verify-card">
        <h3>${failed ? "Verification found problems" : "Outputs verified"}</h3>
        <p>${report.checked.toLocaleString()} checked · ${report.passed.toLocaleString()} passed · ${report.failed.toLocaleString()} failed · dates kept on ${report.dateSurvived.toLocaleString()} (${dur(report.durationMs / 1000)})</p>
        ${failed ? `<div class="result-box" style="margin-top:10px"><table class="data-table"><thead><tr><th>File</th><th>Problems</th></tr></thead><tbody>${report.rows
          .slice(0, 50)
          .map((row) => `<tr><td class="path-cell" title="${escapeHtml(row.rel)}">${escapeHtml(row.rel)}</td><td>${escapeHtml(row.problems.join(", "))}</td></tr>`)
          .join("")}</tbody></table></div>` : ""}
      </div>`;
    } catch (error) {
      host.innerHTML = `<p class="inline-msg">${escapeHtml((error as Error).message)}</p>`;
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
      void actions.undoManifest(state.lastManifestId, state.lastSummary ?? undefined);
    }
  });

  const open = (): void => {
    actions.switchView("run");
    renderView();
  };

  return {
    renderDock,
    renderView,
    open,
    resetDock: () => {
      dockDismissed = false;
    },
  };
}
