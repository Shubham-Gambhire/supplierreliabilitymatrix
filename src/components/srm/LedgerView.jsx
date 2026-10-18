import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, Upload, Download, Plus, Trash2, ChevronDown, ChevronUp, ArrowUpDown, Columns, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { C } from "./tokens.js";
import { RISK_META, TIER_ORDER, Stamp, NumInput, formatCurrency, pct, downloadText } from "./shared.jsx";
import { fmtScore } from "@/lib/srm/scoring.js";
import { splitHistory, trendDelta, HISTORY_LIMIT } from "@/lib/srm/history.js";
import { buildImportPreview, applyImport, buildExportCsv, isReservedLabel } from "@/lib/srm/csv.js";
import { normLabel } from "@/lib/srm/storage.js";
import { newSupplierId, newColumnId } from "@/lib/srm/ids.js";
import { CATEGORY_OPTIONS } from "@/lib/srm/seed.js";

const TIER_FILTERS = ["All", ...TIER_ORDER];
const COLUMN_DEFS = [
  { key: "location", label: "Location" }, { key: "category", label: "Category" }, { key: "spend", label: "Annual spend (USD)" },
  { key: "priority", label: "Priority (P1 most critical)" }, { key: "singleSource", label: "Sole source" }, { key: "onTime", label: "On-time" },
  { key: "totalPOs", label: "Total POs" }, { key: "onTimeRate", label: "On-time rate" }, { key: "adjustedScore", label: "Adjusted reliability" },
  { key: "riskTier", label: "Tier" }, { key: "trend", label: "Trend" },
];

function TrendIndicator({ entries, score, fingerprint }) {
  const d = trendDelta(entries, score, fingerprint);
  if (d === null) return <span className="trend-empty">N/A</span>;
  const t = d.toFixed(2);
  if (d > 0.005) return <span className="trend-up" aria-label={`Up ${t} since last comparable snapshot`}><TrendingUp size={13} aria-hidden="true" /> +{t}</span>;
  if (d < -0.005) return <span className="trend-down" aria-label={`Down ${t} since last comparable snapshot`}><TrendingDown size={13} aria-hidden="true" /> {t}</span>;
  return <span className="trend-flat" aria-label="No change since last comparable snapshot"><Minus size={13} aria-hidden="true" /> 0.00</span>;
}

function ColumnsMenu({ hiddenCols, toggleCol, customCols, addCustomCol, removeCustomCol }) {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("text");
  const [err, setErr] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const submitNew = (e) => {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) { setErr("Enter a column name."); return; }
    if (isReservedLabel(label)) { setErr(`"${label}" is reserved for a standard field. Choose another name.`); return; }
    if (customCols.some((c) => normLabel(c.label) === normLabel(label))) { setErr(`A column named "${label}" already exists.`); return; }
    addCustomCol(label, newType); setNewLabel(""); setNewType("text"); setErr("");
  };
  return (
    <div className="columns-menu" ref={ref}>
      <button type="button" className="btn-outline" aria-expanded={open} aria-controls="columns-panel" onClick={() => setOpen((o) => !o)}><Columns size={13} /> Columns</button>
      {open && (
        <div className="columns-panel" id="columns-panel">
          <div className="columns-panel-label">Standard columns</div>
          {COLUMN_DEFS.map((c) => (
            <label key={c.key} className="columns-panel-item"><input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => toggleCol(c.key)} />{c.label}</label>
          ))}
          {customCols.length > 0 && (<>
            <div className="columns-panel-label">Custom columns</div>
            {customCols.map((c) => (
              <div key={c.id} className="columns-panel-item custom">
                <label className="columns-panel-check"><input type="checkbox" checked={!hiddenCols.has(c.id)} onChange={() => toggleCol(c.id)} /><span className="col-label-text">{c.label}</span></label>
                <button type="button" className="col-remove" onClick={() => removeCustomCol(c.id)} aria-label={`Remove ${c.label} column`}><Trash2 size={12} /></button>
              </div>
            ))}
          </>)}
          <form className="columns-add" onSubmit={submitNew} noValidate>
            <div className="columns-panel-label">Add column</div>
            <input className={`columns-add-input ${err ? "field-invalid" : ""}`} aria-label="New column name" aria-invalid={err ? true : undefined} aria-describedby={err ? "col-add-err" : undefined} placeholder="Column name" value={newLabel} onChange={(e) => { setNewLabel(e.target.value); setErr(""); }} maxLength={60} />
            {err && <div id="col-add-err" className="field-error" role="alert">{err}</div>}
            <div className="columns-add-row">
              <select aria-label="New column type" className="cell-select" value={newType} onChange={(e) => setNewType(e.target.value)}><option value="text">Text</option><option value="number">Number</option></select>
              <button type="submit" className="btn-primary"><Plus size={12} /> Add</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ImportPreview({ preview, onApply, onCancel }) {
  const [mode, setMode] = useState("skip");
  const headRef = useRef(null);
  useEffect(() => { headRef.current?.focus(); }, []);
  if (!preview.ok) {
    return (
      <div className="import-preview" role="alert">
        <h3 ref={headRef} tabIndex={-1}>CSV not imported</h3>
        <ul>{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        <p>No data was changed. Fix the file and try again.</p>
        <div className="import-actions"><button type="button" className="btn-outline" onClick={onCancel}>Close</button></div>
      </div>
    );
  }
  const by = (k) => preview.rows.filter((r) => r.kind === k);
  const nNew = by("new").length, dups = by("duplicate"), bad = by("invalid");
  const willApply = nNew + (mode === "update" ? dups.length : 0);
  return (
    <section className="import-preview" aria-labelledby="imp-h">
      <h3 id="imp-h" ref={headRef} tabIndex={-1}>Import preview: nothing has been changed yet</h3>
      <p>{preview.rows.length} data row{preview.rows.length === 1 ? "" : "s"}: <strong>{nNew} new</strong>, <strong>{dups.length} matching existing suppliers</strong>, <strong>{bad.length} invalid</strong> (invalid rows are never imported).</p>
      {preview.newCustomCols.length > 0 && <p>New custom columns will be created: {preview.newCustomCols.map((c) => c.label).join(", ")}.</p>}
      {preview.ignored.length > 0 && <p>Ignored columns (unrecognised or derived): {preview.ignored.join(", ")}.</p>}
      {bad.length > 0 && (<>
        <strong>Invalid rows</strong>
        <ul>{bad.map((r) => <li key={r.line}>Line {r.line}{r.record.name ? ` (${r.record.name})` : ""}: {r.errors.join(" ")}</li>)}</ul>
      </>)}
      {dups.length > 0 && (<>
        <strong>Matches existing suppliers (by ID or name)</strong>
        <ul>{dups.map((r) => <li key={r.line}>Line {r.line}: {r.record.name} matches {r.duplicateName}</li>)}</ul>
        <fieldset style={{ border: "none", padding: 0, margin: "6px 0" }}>
          <legend>For matching suppliers:</legend>
          <label style={{ marginRight: 14 }}><input type="radio" name="dupmode" checked={mode === "skip"} onChange={() => setMode("skip")} /> Skip them (keep existing data)</label>
          <label><input type="radio" name="dupmode" checked={mode === "update"} onChange={() => setMode("update")} /> Update existing records with file values</label>
        </fieldset>
      </>)}
      <div className="import-actions">
        <button type="button" className="btn-primary" disabled={willApply === 0} onClick={() => onApply(mode)}>Apply {willApply} row{willApply === 1 ? "" : "s"}</button>
        <button type="button" className="btn-outline" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function HistorySparkline({ points }) {
  const W = 160, H = 34, P = 4;
  const vals = points.map((p) => p.adjustedScore);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const x = (i) => P + (i / Math.max(1, points.length - 1)) * (W - P * 2);
  const y = (v) => H - P - ((v - min) / range) * (H - P * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline-svg" role="img" aria-label={`Adjusted reliability across ${points.length} comparable snapshots, from ${vals[0].toFixed(2)} to ${vals[vals.length - 1].toFixed(2)}`}>
      <path d={points.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p.adjustedScore)}`).join(" ")} fill="none" stroke={C.navy} strokeWidth="1.5" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.adjustedScore)} r={i === points.length - 1 ? 3 : 2} fill={i === points.length - 1 ? C.navy : C.surface} stroke={C.navy} strokeWidth="1.2" />)}
    </svg>
  );
}

export function SupplierDetail({ s, config, entries, fingerprint }) {
  const { compatible, legacy, otherConfig } = splitHistory(entries, fingerprint);
  const last = compatible[compatible.length - 1];
  const delta = trendDelta(entries, s.adjustedScore, fingerprint);
  const hasPenalty = s.compoundingPenalty > 0;
  return (
    <div className="detail-chain">
      <div className="detail-left">
        <p className="detail-meta">{s.category || "Uncategorized"} &middot; {formatCurrency(s.annualSpend)} annual spend (USD) &middot; P{s.priority || "?"}</p>
        {s.status === "invalid" ? (
          <div className="detail-text"><strong style={{ color: C.critical }}>Invalid data, not scored.</strong>
            <ul className="doc-list">{Object.values(s.errors).map((e, i) => <li key={i}>{e}</li>)}</ul>
            This supplier is excluded from scored averages, the matrix, peer comparison and snapshots until fixed.
          </div>
        ) : s.status === "insufficient" ? (
          <p className="detail-text"><strong>{s.totalPOs}</strong> purchase order{s.totalPOs === 1 ? "" : "s"} on file, below the <strong>{config.minPOs}-PO</strong> minimum. Not scored. Dependency score {s.dependencyScore} is shown for context only.</p>
        ) : (
          <p className="detail-text">
            {s.onTimeDeliveries} of {s.totalPOs} orders on time (<strong>{pct(s.onTimeRate)}</strong>) gives Delivery Score <strong>{s.deliveryScore}</strong>.
            {" "}{s.singleSource ? `Sole source at P${s.priority}` : "Alternate sources available"} gives Dependency Score <strong>{s.dependencyScore}</strong> (higher = more sourcing resilience).
            {hasPenalty && " Both scores sit below the midpoint, so a compounding penalty applies."}
            {" "}P{s.priority} divides by {s.multiplier}; more critical tiers divide by larger numbers, so criticality can only lower the score.
          </p>
        )}
      </div>
      {s.status === "scored" && (
        <div className="detail-chain-math" aria-label="Calculation">
          <span className="chip-math">Delivery {s.deliveryScore} × {config.weights.delivery}</span><span className="op">+</span>
          <span className="chip-math">Dependency {s.dependencyScore} × {config.weights.dependency}</span>
          {hasPenalty && (<><span className="op">-</span><span className="chip-math penalty">Compounding {s.compoundingPenalty.toFixed(2)}</span></>)}
          <span className="op">=</span><span className="chip-math strong">Performance {fmtScore(s.performanceScore)}</span>
          <span className="op">÷</span><span className="chip-math">P{s.priority} multiplier {s.multiplier}</span>
          <span className="op">=</span><span className="chip-math strong">Adjusted reliability {fmtScore(s.adjustedScore)}</span>
          <span className="history-note">Shown to 2 decimals; tiers use full precision. Higher = safer.</span>
        </div>
      )}
      <Stamp tier={s.riskTier} size="lg" />
      {s.status === "scored" && (
        <div className="detail-peer">
          {s.categoryPeerCount >= 1 ? (
            <p className="detail-text">
              Descriptive peer context: average adjusted reliability of the <strong>{s.categoryPeerCount}</strong> other scored supplier{s.categoryPeerCount === 1 ? "" : "s"} in <strong>{s.category || "Uncategorized"}</strong> is <strong>{fmtScore(s.categoryPeerAvg)}</strong>; this supplier is {s.peerDelta >= 0 ? "+" : ""}{fmtScore(s.peerDelta)}
              {s.peerDeltaPct !== null ? ` (${Math.round(s.peerDeltaPct)}%)` : ""}.
              {s.belowPeerAvg && <> Flagged as a category laggard (more than {config.peerGapThreshold} below peers).</>}
              {s.categoryPeerCount < 3 && " Small peer group: interpret with caution."}
              {s.peerMixedPriorities && " Peers have different priority tiers, which affects their adjusted scores."}
              {" "}The absolute tier is unaffected.
            </p>
          ) : <p className="empty-note">No other scored suppliers in {s.category || "this category"}, so there is no peer comparison.</p>}
        </div>
      )}
      <div className="detail-history">
        {compatible.length === 0 ? (
          <p className="empty-note">No comparable snapshots yet. Use Record snapshot on the Register tab to start a trend.</p>
        ) : (<>
          <HistorySparkline points={compatible} />
          <div className="history-meta">
            <span>{compatible.length} comparable snapshot{compatible.length > 1 ? "s" : ""}</span>
            <span>Last: {new Date(last.ts).toLocaleDateString()} at {last.adjustedScore.toFixed(2)}</span>
            {delta !== null && <span>{delta >= 0 ? "+" : ""}{delta.toFixed(2)} since then</span>}
          </div>
        </>)}
        {(legacy.length > 0 || otherConfig.length > 0) && (
          <p className="history-note">
            {legacy.length > 0 && `${legacy.length} legacy snapshot${legacy.length > 1 ? "s" : ""} from the earlier scoring model (before the priority fix) are kept but not compared. `}
            {otherConfig.length > 0 && `${otherConfig.length} snapshot${otherConfig.length > 1 ? "s" : ""} recorded under different settings are kept but not compared.`}
          </p>
        )}
      </div>
    </div>
  );
}

export default function LedgerView({ suppliers, setSuppliers, derived, config, history, fingerprint, focusRequest, customCols, setCustomCols, announce }) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [expandedId, setExpandedId] = useState(null);
  const [hiddenCols, setHiddenCols] = useState(() => new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);
  const undoTimer = useRef(null);

  useEffect(() => {
    if (!focusRequest?.id) return;
    setTierFilter("All"); setQuery(""); setExpandedId(focusRequest.id);
    const t = setTimeout(() => {
      const el = document.getElementById(`ledger-row-${focusRequest.id}`);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.querySelector("input")?.focus({ preventScroll: true }); }
    }, 60);
    return () => clearTimeout(t);
  }, [focusRequest]);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const toggleCol = (key) => setHiddenCols((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const visible = (key) => !hiddenCols.has(key);
  const visibleCustomCols = customCols.filter((c) => visible(c.id));
  const visibleColCount = 3 + COLUMN_DEFS.filter((c) => visible(c.key)).length + visibleCustomCols.length;

  const categoryOptions = useMemo(() => {
    const set = new Set(CATEGORY_OPTIONS);
    suppliers.forEach((s) => { if (typeof s.category === "string" && s.category.trim()) set.add(s.category); });
    return Array.from(set);
  }, [suppliers]);

  const addCustomCol = (label, type) => { setCustomCols((prev) => [...prev, { id: newColumnId(), label, type: type === "number" ? "number" : "text" }]); announce(`Column ${label} added.`); };
  const removeCustomCol = (id) => {
    const col = customCols.find((c) => c.id === id);
    setCustomCols((prev) => prev.filter((c) => c.id !== id));
    setSuppliers((prev) => prev.map((s) => { if (!s.custom || !(id in s.custom)) return s; const c = { ...s.custom }; delete c[id]; return { ...s, custom: c }; }));
    announce(`Column ${col?.label || ""} removed.`);
  };
  const updateCustomValue = (sid, colId, value) => setSuppliers((prev) => prev.map((s) => (s.id === sid ? { ...s, custom: { ...(s.custom || {}), [colId]: value } } : s)));
  const updateRow = (id, patch) => setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const requestDelete = (supplier) => {
    const index = suppliers.findIndex((s) => s.id === supplier.id);
    setSuppliers((prev) => prev.filter((s) => s.id !== supplier.id));
    setPendingDelete({ supplier, index });
    announce(`Removed ${supplier.name || "supplier"}. Undo is available for 8 seconds.`);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setPendingDelete(null), 8000);
  };
  const undoDelete = () => {
    if (!pendingDelete) return;
    const { supplier, index } = pendingDelete;
    setSuppliers((prev) => { if (prev.some((s) => s.id === supplier.id)) return prev; const n = [...prev]; n.splice(Math.min(index, n.length), 0, supplier); return n; });
    setPendingDelete(null);
    announce(`Restored ${supplier.name || "supplier"}.`);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };
  const addRow = () => {
    const id = newSupplierId();
    setSuppliers((prev) => [...prev, { id, name: "New Supplier", location: "", category: CATEGORY_OPTIONS[0], annualSpend: 0, onTimeDeliveries: 0, totalPOs: 0, priority: 5, singleSource: false, custom: {} }]);
    setExpandedId(id);
    announce("Added a new supplier row at the end of the ledger.");
    setTimeout(() => document.getElementById(`ledger-row-${id}`)?.querySelector("input")?.focus(), 50);
  };

  const filtered = useMemo(() => {
    let list = derived;
    if (tierFilter !== "All") list = list.filter((s) => s.riskTier === tierFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((s) => String(s.name || "").toLowerCase().includes(q) || String(s.location || "").toLowerCase().includes(q));
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (typeof av === "string" || typeof bv === "string") { av = String(av ?? ""); bv = String(bv ?? ""); return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av); }
        av = typeof av === "number" && Number.isFinite(av) ? av : -Infinity; bv = typeof bv === "number" && Number.isFinite(bv) ? bv : -Infinity;
        return sortDir === "asc" ? (av > bv) - (av < bv) : (bv > av) - (bv < av);
      });
    }
    return list;
  }, [derived, tierFilter, query, sortKey, sortDir]);

  const toggleSort = (key) => { if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setSortDir("asc"); } };
  const exportCsv = () => { downloadText("supplier-reliability-matrix.csv", buildExportCsv(derived, customCols), "text/csv;charset=utf-8"); announce("CSV exported."); };

  const onFile = async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = ""; // allow re-selecting the same file
    if (!file) return;
    try {
      const text = await file.text();
      const p = buildImportPreview(text, suppliers, customCols);
      setPreview(p);
      announce(p.ok ? `Import preview ready: ${p.rows.length} rows checked. Nothing changed yet.` : "CSV could not be imported. See the errors listed.");
    } catch (err) {
      setPreview({ ok: false, errors: ["The file could not be read."], rows: [], ignored: [], newCustomCols: [] });
    }
  };
  const applyPreview = (mode) => {
    const r = applyImport(preview, suppliers, customCols, mode);
    setSuppliers(r.suppliers); setCustomCols(r.customCols); setPreview(null);
    announce(`Import complete: ${r.added} added, ${r.updated} updated, ${r.skipped} skipped.`);
  };

  const SortHead = ({ label, sk, align, className }) => (
    <th className={`th-sort ${className || ""}`} style={{ textAlign: align || "left" }} aria-sort={sortKey === sk ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="sort-btn" onClick={() => toggleSort(sk)}>
        <span>{label}</span><ArrowUpDown size={11} color={sortKey === sk ? C.navy : C.ink} aria-hidden="true" />
      </button>
    </th>
  );

  return (
    <div className="stack-lg">
      <div className="ledger-toolbar">
        <div className="search-box">
          <Search size={14} color={C.ink} aria-hidden="true" />
          <input aria-label="Search suppliers by name or location" placeholder="Search supplier or location…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="chip-row" role="group" aria-label="Filter by tier">
          {TIER_FILTERS.map((t) => (
            <button type="button" key={t} aria-pressed={tierFilter === t} className={`chip ${tierFilter === t ? "chip-active" : ""}`} onClick={() => setTierFilter(t)}>
              {t === "All" ? "All" : t.replace(" Risk", "").replace(" Data", "")}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <ColumnsMenu hiddenCols={hiddenCols} toggleCol={toggleCol} customCols={customCols} addCustomCol={addCustomCol} removeCustomCol={removeCustomCol} />
          <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()}><Upload size={13} /> Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} aria-label="Choose CSV file to import" data-testid="csv-input" />
          <button type="button" className="btn-outline" onClick={exportCsv}><Download size={13} /> Export CSV</button>
          <button type="button" className="btn-primary" onClick={addRow}><Plus size={13} /> Add supplier</button>
        </div>
      </div>

      {preview && <ImportPreview preview={preview} onApply={applyPreview} onCancel={() => { setPreview(null); announce("Import cancelled. No data changed."); }} />}

      <p className="note-line" style={{ margin: 0 }}>Spend in USD. P1 is the most critical priority. Adjusted reliability: higher = safer. Trend compares against the last snapshot recorded under the current model and settings (up to {HISTORY_LIMIT} kept per supplier).</p>

      <div className="ledger-scroll" role="region" aria-label="Supplier ledger table" tabIndex={0}>
        <table className="ledger-table">
          <thead>
            <tr>
              <th style={{ width: 24 }} className="sticky-col"><span className="sr-only">Details</span></th>
              <SortHead label="Supplier" sk="name" className="sticky-col-2" />
              {visible("location") && <SortHead label="Location" sk="location" />}
              {visible("category") && <th>Category</th>}
              {visible("spend") && <SortHead label="Annual spend (USD)" sk="annualSpend" align="right" />}
              {visible("priority") && <SortHead label="Priority" sk="priority" />}
              {visible("singleSource") && <th>Sole source</th>}
              {visible("onTime") && <th style={{ textAlign: "right" }}>On-time</th>}
              {visible("totalPOs") && <th style={{ textAlign: "right" }}>Total POs</th>}
              {visible("onTimeRate") && <SortHead label="On-time rate" sk="onTimeRate" align="right" />}
              {visible("adjustedScore") && <SortHead label="Adj. reliability" sk="adjustedScore" align="right" />}
              {visible("riskTier") && <th>Tier</th>}
              {visible("trend") && <th>Trend</th>}
              {visibleCustomCols.map((c) => <th key={c.id} style={{ textAlign: c.type === "number" ? "right" : "left" }}>{c.label}</th>)}
              <th style={{ width: 32 }}><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isOpen = expandedId === s.id;
              const m = RISK_META[s.riskTier];
              const nm = s.name || "unnamed supplier";
              const errs = s.errors || {};
              const errId = Object.keys(errs).length ? `err-${s.id}` : undefined;
              const fe = (f) => (errs[f] ? errId : undefined);
              return (
                <React.Fragment key={s.id}>
                  <tr className={isOpen ? "row-open" : ""} id={`ledger-row-${s.id}`}>
                    <td className="sticky-col">
                      <button type="button" className="row-expand" onClick={() => setExpandedId(isOpen ? null : s.id)} aria-expanded={isOpen} aria-controls={`detail-${s.id}`} aria-label={`Calculation details for ${nm}`}>
                        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </td>
                    <td className="sticky-col-2">
                      <input aria-label={`Supplier name for ${nm}`} aria-invalid={errs.name ? true : undefined} aria-describedby={fe("name")} className={`cell-input cell-name ${errs.name ? "field-invalid" : ""}`} value={s.name ?? ""} onChange={(e) => updateRow(s.id, { name: e.target.value })} />
                      {errId && <div className="row-error" id={errId}>{Object.values(errs).join(" ")}</div>}
                    </td>
                    {visible("location") && <td><input aria-label={`Location for ${nm}`} className="cell-input" value={s.location ?? ""} onChange={(e) => updateRow(s.id, { location: e.target.value })} /></td>}
                    {visible("category") && (
                      <td>
                        <select aria-label={`Category for ${nm}`} className="cell-select" value={s.category || ""} onChange={(e) => updateRow(s.id, { category: e.target.value })}>
                          {!s.category && <option value="">Uncategorized</option>}
                          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                    )}
                    {visible("spend") && <td style={{ textAlign: "right" }}><NumInput label={`Annual spend in USD for ${nm}`} value={s.annualSpend} invalid={!!errs.annualSpend} describedBy={fe("annualSpend")} onChange={(v) => updateRow(s.id, { annualSpend: v })} width={92} min={0} step={1000} /></td>}
                    {visible("priority") && (
                      <td>
                        <select aria-label={`Priority for ${nm} (P1 most critical)`} aria-invalid={errs.priority ? true : undefined} aria-describedby={fe("priority")} className={`cell-select ${errs.priority ? "field-invalid" : ""}`} value={[1, 2, 3, 4, 5].includes(s.priority) ? s.priority : ""} onChange={(e) => updateRow(s.id, { priority: Number(e.target.value) })}>
                          {![1, 2, 3, 4, 5].includes(s.priority) && <option value="">Invalid</option>}
                          {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>P{p}</option>)}
                        </select>
                      </td>
                    )}
                    {visible("singleSource") && (
                      <td>
                        <button type="button" aria-pressed={s.singleSource === true} aria-label={`Sole source for ${nm}`} aria-describedby={fe("singleSource")} className={`toggle-y-n ${s.singleSource === true ? "on" : ""} ${errs.singleSource ? "field-invalid" : ""}`} onClick={() => updateRow(s.id, { singleSource: s.singleSource !== true })}>
                          {s.singleSource === true ? "Y" : s.singleSource === false ? "N" : "?"}
                        </button>
                      </td>
                    )}
                    {visible("onTime") && <td style={{ textAlign: "right" }}><NumInput label={`On-time deliveries for ${nm}`} value={s.onTimeDeliveries} invalid={!!errs.onTimeDeliveries} describedBy={fe("onTimeDeliveries")} onChange={(v) => updateRow(s.id, { onTimeDeliveries: v })} width={60} min={0} /></td>}
                    {visible("totalPOs") && <td style={{ textAlign: "right" }}><NumInput label={`Total purchase orders for ${nm}`} value={s.totalPOs} invalid={!!errs.totalPOs} describedBy={fe("totalPOs")} onChange={(v) => updateRow(s.id, { totalPOs: v })} width={60} min={0} /></td>}
                    {visible("onTimeRate") && <td className="data-cell" style={{ textAlign: "right" }}>{s.status === "invalid" ? "N/A" : pct(s.onTimeRate)}</td>}
                    {visible("adjustedScore") && <td className="data-cell" style={{ textAlign: "right", color: m.color, fontWeight: 600 }}>{fmtScore(s.adjustedScore)}</td>}
                    {visible("riskTier") && (
                      <td>
                        <Stamp tier={s.riskTier} />
                        {s.belowPeerAvg && <div className="peer-badge" title={`Average of ${s.categoryPeerCount} other scored ${s.category} supplier(s): ${fmtScore(s.categoryPeerAvg)}`}>{fmtScore(s.peerDelta)} vs {s.categoryPeerCount} peer{s.categoryPeerCount === 1 ? "" : "s"}</div>}
                      </td>
                    )}
                    {visible("trend") && <td className="data-cell"><TrendIndicator entries={history[s.id]} score={s.adjustedScore} fingerprint={fingerprint} /></td>}
                    {visibleCustomCols.map((c) => (
                      <td key={c.id} style={{ textAlign: c.type === "number" ? "right" : "left" }}>
                        <input aria-label={`${c.label} for ${nm}`} className="cell-input" type={c.type === "number" ? "number" : "text"} style={c.type === "number" ? { textAlign: "right" } : undefined}
                          value={s.custom && s.custom[c.id] !== undefined && s.custom[c.id] !== null && !(typeof s.custom[c.id] === "number" && !Number.isFinite(s.custom[c.id])) ? s.custom[c.id] : ""}
                          onChange={(e) => updateCustomValue(s.id, c.id, c.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
                      </td>
                    ))}
                    <td><button type="button" className="row-delete" onClick={() => requestDelete(s)} aria-label={`Remove ${nm}`}><Trash2 size={13} /></button></td>
                  </tr>
                  {isOpen && (
                    <tr className="row-detail" id={`detail-${s.id}`}>
                      <td colSpan={visibleColCount}><SupplierDetail s={s} config={config} entries={history[s.id]} fingerprint={fingerprint} /></td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={visibleColCount} className="empty-note" style={{ padding: "20px 8px" }}>
                {suppliers.length === 0 ? "The ledger is empty. Add a supplier, import a CSV, or restore a backup from Settings." : "No suppliers match this search and filter combination."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pendingDelete && (
        <div className="undo-toast">
          <span>Removed {pendingDelete.supplier.name || "supplier"}.</span>
          <button type="button" onClick={undoDelete}>Undo</button>
        </div>
      )}
    </div>
  );
}
