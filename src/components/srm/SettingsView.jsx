import React, { useState, useEffect, useMemo, useRef } from "react";
import { RotateCcw, Trash2, Loader2, AlertCircle, Check, Download, Upload } from "lucide-react";
import { NumInput, InfoTip, RISK_META, TIER_ORDER, downloadText } from "./shared.jsx";
import { validateConfig, cloneDefaultConfig, deriveAll } from "@/lib/srm/scoring.js";
import { buildBackup, parseBackup } from "@/lib/srm/storage.js";

const clone = (c) => JSON.parse(JSON.stringify(c));

function Row({ id, label, error, children }) {
  return (
    <>
      <div className="settings-row">
        <label htmlFor={id}>{label}</label>
        {children}
      </div>
      {error && (
        <div className="field-error" id={`${id}-err`}>
          {error}
        </div>
      )}
    </>
  );
}

export function saveStatusLabel(storageStatus, saveState, conflict) {
  if (storageStatus === "loading") return "Loading saved data...";
  if (storageStatus === "unavailable")
    return "Not saved: browser storage could not be read in this session";
  if (storageStatus === "corrupt")
    return "Not saving: the existing save could not be read (see notice above)";
  if (conflict) return "Paused: another tab saved newer data";
  if (saveState === "pending") return "Saving...";
  if (saveState === "error") return "Save failed: changes are only in this tab right now";
  if (saveState === "saved") return "All changes saved to this browser";
  return "Changes save automatically to this browser";
}

export default function SettingsView({
  config,
  onApplyConfig,
  suppliers,
  derived,
  storageStatus,
  saveState,
  conflict,
  onResetAll,
  currentState,
  onRestore,
  announce,
}) {
  const [draft, setDraft] = useState(() => clone(config));
  const [resetArmed, setResetArmed] = useState(false);
  const [restore, setRestore] = useState(null);
  const [downloadedCurrent, setDownloadedCurrent] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => {
    setDraft(clone(config));
  }, [config]);

  const v = useMemo(() => validateConfig(draft), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const preview = useMemo(
    () => (v.ok ? deriveAll(suppliers, v.config) : derived),
    [v, suppliers, derived],
  );
  const counts = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
  preview.forEach((s) => {
    counts[s.riskTier]++;
  });

  const set = (path, val) =>
    setDraft((prev) => {
      const n = clone(prev);
      const parts = path.split(".");
      let o = n;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = val;
      return n;
    });
  const err = (k) => v.errors[k];
  const num = (id, path, value, opts = {}) => (
    <NumInput
      label={opts.label}
      value={value}
      step={opts.step ?? 0.05}
      width={opts.width ?? 72}
      invalid={!!err(opts.errKey || path)}
      describedBy={err(opts.errKey || path) ? `${id}-err` : undefined}
      onChange={(x) => set(path, opts.toStore ? opts.toStore(x) : x)}
      id={id}
      className={id}
    />
  );

  const apply = () => {
    if (!v.ok) return;
    onApplyConfig(v.config);
    announce("Settings applied. Scores recalculated.");
  };
  const cancel = () => {
    setDraft(clone(config));
    announce("Unapplied setting changes discarded.");
  };

  const handleResetClick = () => {
    if (!resetArmed) {
      setResetArmed(true);
      setTimeout(() => setResetArmed(false), 5000);
      return;
    }
    setResetArmed(false);
    onResetAll();
  };

  const downloadBackup = () => {
    downloadText(
      `supplier-reliability-matrix-backup-${new Date().toISOString().slice(0, 10)}.json`,
      buildBackup(currentState),
      "application/json",
    );
    setDownloadedCurrent(true);
    announce("Backup downloaded.");
  };
  const onFile = async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    let text = "";
    try {
      text = await file.text();
    } catch {
      setRestore({ ok: false, error: "The file could not be read." });
      return;
    }
    const r = parseBackup(text);
    setRestore(r);
    setDownloadedCurrent(false);
    announce(
      r.ok
        ? "Backup checked. Review before replacing current data."
        : `Backup rejected: ${r.error}`,
    );
  };

  const statusLabel = saveStatusLabel(storageStatus, saveState, conflict);
  const StatusIcon =
    saveState === "pending"
      ? Loader2
      : storageStatus === "ready" && saveState !== "error" && !conflict
        ? Check
        : AlertCircle;

  return (
    <div className="stack-lg">
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.01em" }}>
        Settings
      </h2>

      <section className="panel" aria-labelledby="data-h">
        <h3 id="data-h">Data and backup</h3>
        <div className="settings-row">
          <span className="status-label">
            <StatusIcon
              size={13}
              className={saveState === "pending" ? "spin" : ""}
              aria-hidden="true"
            />{" "}
            {statusLabel}
          </span>
        </div>
        <p className="data-privacy-note">
          Supplier records, settings and history are kept in this browser's local storage and are
          not uploaded by this app. The page still loads fonts and images from external hosts and
          may send technical error reports. Clearing browser data deletes your records, so download
          a backup regularly. CSV export covers supplier rows only; the JSON backup also keeps IDs,
          custom columns, settings and history.
        </p>
        <div className="import-actions">
          <button type="button" className="btn-outline" onClick={downloadBackup}>
            <Download size={13} /> Download backup (JSON)
          </button>
          <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> Restore from backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={onFile}
            aria-label="Choose backup file"
            data-testid="backup-input"
          />
        </div>
        {restore && !restore.ok && (
          <p className="notice notice-error" role="alert">
            Backup not restored: {restore.error} Current data is unchanged.{" "}
            <button type="button" className="link-btn" onClick={() => setRestore(null)}>
              Dismiss
            </button>
          </p>
        )}
        {restore && restore.ok && (
          <div
            className="import-preview"
            role="region"
            aria-label="Restore preview"
            style={{ marginTop: 10 }}
          >
            <p>
              <strong>Backup is valid:</strong> {restore.state.suppliers.length} suppliers,{" "}
              {restore.state.customCols.length} custom columns, history for{" "}
              {Object.keys(restore.state.history).length} suppliers.
            </p>
            {restore.warnings.length > 0 && (
              <ul>
                {restore.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <p>
              Restoring <strong>replaces all current data</strong> in this browser.
            </p>
            <div className="import-actions">
              <button type="button" className="btn-outline" onClick={downloadBackup}>
                <Download size={13} />{" "}
                {downloadedCurrent ? "Downloaded current data" : "Download current data first"}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  onRestore(restore.state);
                  setRestore(null);
                }}
              >
                Replace current data
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setRestore(null);
                  announce("Restore cancelled.");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          className={`btn-outline reset-all-btn ${resetArmed ? "armed" : ""}`}
          onClick={handleResetClick}
          style={{ marginTop: 12 }}
        >
          <Trash2 size={13} />{" "}
          {resetArmed
            ? "Click again to confirm: replaces everything with demo data"
            : "Reset all data to demo"}
        </button>
      </section>

      <p className="note-line" style={{ margin: 0 }}>
        Scoring changes below are drafts. Nothing recalculates until you press Apply, and invalid
        values cannot be applied.
      </p>

      <section className="panel">
        <div className="panel-head">
          <h3>Performance weighting</h3>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setDraft(cloneDefaultConfig())}
          >
            <RotateCcw size={12} /> Load defaults into draft
          </button>
        </div>
        <Row id="w-del" label="Delivery Score weight (0 to 1)" error={err("weights.delivery")}>
          {num("w-del", "weights.delivery", draft.weights.delivery, {
            label: "Delivery Score weight",
          })}
        </Row>
        <Row id="w-dep" label="Dependency Score weight (0 to 1)" error={err("weights.dependency")}>
          {num("w-dep", "weights.dependency", draft.weights.dependency, {
            label: "Dependency Score weight",
          })}
        </Row>
        {err("weights") && (
          <p className="field-error" role="alert">
            {err("weights")}
          </p>
        )}
      </section>

      <section className="panel">
        <h3>
          Compounding penalty{" "}
          <InfoTip text="Extra deduction when Delivery and Dependency scores are both below 3. Set to 0 for a plain weighted sum." />
        </h3>
        <Row id="cw" label="Compounding weight (0 to 1)" error={err("compoundingWeight")}>
          {num("cw", "compoundingWeight", draft.compoundingWeight, { label: "Compounding weight" })}
        </Row>
      </section>

      <section className="panel">
        <h3>
          Peer comparison{" "}
          <InfoTip text="Descriptive only. Flags a supplier when it sits this far below the average of other scored suppliers in its category." />
        </h3>
        <Row
          id="pg"
          label="Flag when below peer average by (0 to 5)"
          error={err("peerGapThreshold")}
        >
          {num("pg", "peerGapThreshold", draft.peerGapThreshold, {
            label: "Peer gap threshold",
            step: 0.1,
          })}
        </Row>
      </section>

      <section className="panel">
        <h3>Delivery score thresholds</h3>
        {err("deliveryBuckets") && <p className="field-error">{err("deliveryBuckets")}</p>}
        {draft.deliveryBuckets.map((b, i) => (
          <Row
            key={i}
            id={i === 4 ? undefined : `b${i}`}
            label={
              i === 4 ? "Score 1 at on-time rate from (fixed)" : `Score ${5 - i} at on-time rate ≥`
            }
            error={err(`deliveryBuckets.${i}`)}
          >
            {i === 4 ? (
              <span className="unit">0%</span>
            ) : (
              <>
                {num(
                  `b${i}`,
                  `deliveryBuckets.${i}.min`,
                  b.min === "" || b.min === null ? "" : +(Number(b.min) * 100).toFixed(4),
                  {
                    label: `Minimum on-time percentage for delivery score ${5 - i}`,
                    step: 1,
                    errKey: `deliveryBuckets.${i}`,
                    toStore: (x) => (x === "" ? "" : x / 100),
                  },
                )}
                <span className="unit">%</span>
              </>
            )}
          </Row>
        ))}
      </section>

      <section className="panel">
        <h3>Priority multipliers (score is divided by these)</h3>
        <p className="note-line">
          Must be positive and must not increase from P1 (most critical) to P5.
        </p>
        {[1, 2, 3, 4, 5].map((p) => (
          <Row
            key={p}
            id={`m${p}`}
            label={`Priority ${p}${p === 1 ? " (most critical)" : ""}`}
            error={err(`multipliers.${p}`)}
          >
            {num(`m${p}`, `multipliers.${p}`, draft.multipliers[p], {
              label: `Priority ${p} multiplier`,
              step: 0.1,
            })}
          </Row>
        ))}
      </section>

      <section className="panel">
        <h3>Tier thresholds (adjusted reliability, higher = safer)</h3>
        <Row id="t-low" label="Low Risk at or above (max 5)" error={err("thresholds.low")}>
          {num("t-low", "thresholds.low", draft.thresholds.low, { label: "Low Risk threshold" })}
        </Row>
        <Row id="t-med" label="Medium Risk at or above" error={err("thresholds.medium")}>
          {num("t-med", "thresholds.medium", draft.thresholds.medium, {
            label: "Medium Risk threshold",
          })}
        </Row>
        <Row
          id="t-high"
          label="High Risk at or above (Critical below)"
          error={err("thresholds.high")}
        >
          {num("t-high", "thresholds.high", draft.thresholds.high, {
            label: "High Risk threshold",
          })}
        </Row>
      </section>

      <section className="panel">
        <h3>Minimum order history</h3>
        <Row id="minpos" label="Minimum Total POs to score (whole number)" error={err("minPOs")}>
          {num("minpos", "minPOs", draft.minPOs, { label: "Minimum Total POs to score", step: 1 })}
        </Row>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>{dirty && v.ok ? "Preview with unapplied settings" : "Current tier counts"}</h3>
        </div>
        <div className="tally">
          {Object.entries(counts).map(([tier, count]) => (
            <div key={tier} className="tally-row">
              <span className="tally-label" style={{ color: RISK_META[tier].color }}>
                {tier}
              </span>
              <div className="tally-track" aria-hidden="true">
                <div
                  className="tally-fill"
                  style={{
                    width: `${preview.length ? (count / preview.length) * 100 : 0}%`,
                    background: RISK_META[tier].color,
                  }}
                />
              </div>
              <span className="tally-count">{count}</span>
            </div>
          ))}
        </div>
      </section>

      {dirty && (
        <div className="settings-actions" role="region" aria-label="Unapplied settings">
          <span>
            {v.ok
              ? "You have unapplied changes."
              : `${Object.keys(v.errors).length} problem${Object.keys(v.errors).length > 1 ? "s" : ""} to fix before applying.`}
          </span>
          <button type="button" className="btn-primary" disabled={!v.ok} onClick={apply}>
            Apply settings
          </button>
          <button type="button" className="btn-outline" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
