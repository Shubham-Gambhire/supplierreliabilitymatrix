import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import logoAsset from "@/assets/supplier-matrix-logo.png.asset.json";
import { Settings2, BookOpen, LayoutGrid, ListChecks, Loader2, AlertCircle, Check, Linkedin, Github, ArrowUpRight, Download } from "lucide-react";
import { APP_CSS } from "./srm/styles.js";
import { Modal, downloadText } from "./srm/shared.jsx";
import RegisterView from "./srm/RegisterView.jsx";
import LedgerView from "./srm/LedgerView.jsx";
import SettingsView, { saveStatusLabel } from "./srm/SettingsView.jsx";
import MethodologyView from "./srm/MethodologyView.jsx";
import { cloneDefaultConfig, validateConfig, deriveAll, configFingerprint } from "@/lib/srm/scoring.js";
import { recordSnapshot as recordSnap } from "@/lib/srm/history.js";
import { STORAGE_KEY, parseSaved, serializeState, readWriteToken } from "@/lib/srm/storage.js";
import { newSupplierId } from "@/lib/srm/ids.js";
import { cloneSeeds } from "@/lib/srm/seed.js";

const TABS = [
  { key: "register", label: "Register", icon: LayoutGrid },
  { key: "ledger", label: "Supplier Ledger", icon: ListChecks },
  { key: "settings", label: "Settings", icon: Settings2 },
];
const defaultConfig = () => validateConfig(cloneDefaultConfig()).config;

export default function App() {
  const [suppliers, setSuppliers] = useState(cloneSeeds);
  const [config, setConfig] = useState(defaultConfig);
  const [history, setHistory] = useState({});
  const [customCols, setCustomCols] = useState([]);
  const [tab, setTab] = useState("register");
  const [focusRequest, setFocusRequest] = useState(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [storageStatus, setStorageStatus] = useState("loading"); // loading | ready | unavailable | corrupt
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saved | error
  const [loadWarnings, setLoadWarnings] = useState([]);
  const [corrupt, setCorrupt] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [announcement, setAnnouncement] = useState({ msg: "", n: 0 });
  const tokenRef = useRef(null);
  const timerRef = useRef(null);
  const stateRef = useRef(null);
  stateRef.current = { suppliers, config, history, customCols };

  const announce = useCallback((msg) => setAnnouncement((a) => ({ msg, n: a.n + 1 })), []);

  // Hydrate from storage. Views are not rendered (so not editable) until this completes.
  useEffect(() => {
    let raw;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch (e) { setStorageStatus("unavailable"); return; }
    const p = parseSaved(raw);
    if (p.status === "corrupt") { setCorrupt({ raw, error: p.error }); setStorageStatus("corrupt"); return; }
    if (p.status === "ok") {
      setSuppliers(p.state.suppliers); setConfig(p.state.config); setHistory(p.state.history); setCustomCols(p.state.customCols);
      tokenRef.current = p.writeToken;
      if (p.warnings.length) setLoadWarnings(p.warnings);
    }
    setStorageStatus("ready");
  }, []);

  const writeNow = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (storageStatus !== "ready" || conflict) return;
    try {
      const current = window.localStorage.getItem(STORAGE_KEY);
      if (current !== null && readWriteToken(current) !== tokenRef.current) { setConflict(true); return; }
      const token = newSupplierId();
      window.localStorage.setItem(STORAGE_KEY, serializeState(stateRef.current, token));
      tokenRef.current = token;
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
    }
  }, [storageStatus, conflict]);

  // Debounced autosave of suppliers, config, history and custom columns together.
  useEffect(() => {
    if (storageStatus !== "ready" || conflict) return;
    setSaveState("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(writeNow, 500);
  }, [suppliers, config, history, customCols, storageStatus, conflict, writeNow]);

  // Flush on page hide; detect newer saves from other tabs.
  useEffect(() => {
    const flush = () => { if (timerRef.current) writeNow(); };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY) return;
      if (readWriteToken(e.newValue) !== tokenRef.current) setConflict(true);
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("storage", onStorage); };
  }, [writeNow]);

  const keepThisTab = () => {
    try { tokenRef.current = readWriteToken(window.localStorage.getItem(STORAGE_KEY)); } catch { /* ignore */ }
    setConflict(false);
    announce("Keeping this tab's data. It will overwrite the other tab's save.");
  };

  const replaceAll = (state) => {
    setSuppliers(state.suppliers); setConfig(state.config); setHistory(state.history); setCustomCols(state.customCols);
  };
  const resetAllData = () => {
    replaceAll({ suppliers: cloneSeeds(), config: defaultConfig(), history: {}, customCols: [] });
    if (corrupt) { setCorrupt(null); setStorageStatus("ready"); }
    announce("All data reset to the demo suppliers.");
  };
  const discardCorrupt = () => {
    setCorrupt(null); tokenRef.current = null;
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setStorageStatus("ready");
    announce("Unreadable save discarded. Demo data is now being saved.");
  };

  const fingerprint = useMemo(() => configFingerprint(config), [config]);
  const derived = useMemo(() => deriveAll(suppliers, config), [suppliers, config]);

  const goToSupplier = (id) => { setTab("ledger"); setFocusRequest({ id, nonce: Date.now() }); };
  const recordSnapshot = () => {
    const r = recordSnap(history, derived, fingerprint);
    if (r.count === 0) { announce("No scored suppliers to record. Nothing was saved."); return; }
    setHistory(r.history);
    announce(`Snapshot recorded for ${r.count} scored supplier${r.count > 1 ? "s" : ""}.`);
  };
  const lastSnapshotAt = useMemo(() => {
    let latest = null;
    for (const arr of Object.values(history)) for (const e of arr || []) if (e && typeof e.ts === "string" && (!latest || e.ts > latest)) latest = e.ts;
    return latest;
  }, [history]);

  const headerStatus = storageStatus === "loading" ? "Loading"
    : storageStatus === "unavailable" ? "Not saved"
    : storageStatus === "corrupt" ? "Recovery needed"
    : conflict ? "Save paused"
    : saveState === "error" ? "Save failed"
    : saveState === "pending" ? "Saving"
    : "Saved to this browser";
  const okStatus = headerStatus === "Saved to this browser";

  return (
    <div className="ledger-app">
      <style>{APP_CSS}</style>
      <div className="sr-only" aria-live="polite" aria-atomic="true" key={announcement.n}>{announcement.msg}</div>

      <div className="masthead">
        <div className="title-row">
          <img src={logoAsset.url} alt="Supplier Reliability Matrix logo" className="brand-logo" />
          <h1>Supplier Reliability Matrix</h1>
        </div>
        <p className="sub">
          A procurement risk scorecard that turns delivery performance, priority, and sourcing
          structure into clear, actionable reliability and risk signals.
        </p>
        <p className="demo-note">Demo data: the starting suppliers are fictional. Spend in USD. P1 = highest criticality. Records stay in this browser only; download a backup from Settings.</p>
        <div className="meta-row">
          <span>Suppliers on file: <b>{suppliers.length}</b></span>
          <span>Scored: <b>{derived.filter((s) => s.status === "scored").length}</b></span>
          <span title={saveStatusLabel(storageStatus, saveState, conflict)}>
            {saveState === "pending" ? <Loader2 size={11} className="spin" /> : okStatus ? <Check size={11} /> : <AlertCircle size={11} />}
            {" "}<b>{headerStatus}</b>
          </span>
        </div>
      </div>

      {(corrupt || conflict || saveState === "error" || storageStatus === "unavailable" || loadWarnings.length > 0) && (
        <div className="notice-stack">
          {corrupt && (
            <div className="notice notice-error" role="alert">
              <span><strong>Your saved data could not be read.</strong> {corrupt.error} It has not been overwritten. Demo data is shown and changes are not being saved until you choose.</span>
              <span className="notice-actions">
                <button type="button" className="btn-outline" onClick={() => downloadText("supplier-reliability-matrix-unreadable-save.txt", corrupt.raw || "", "text/plain")}><Download size={12} /> Download raw save</button>
                <button type="button" className="btn-outline" onClick={discardCorrupt}>Discard it and start saving</button>
              </span>
            </div>
          )}
          {conflict && (
            <div className="notice notice-warn" role="alert">
              <span><strong>Another tab saved newer data.</strong> Saving here is paused to avoid overwriting it.</span>
              <span className="notice-actions">
                <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Reload newer data</button>
                <button type="button" className="btn-outline" onClick={keepThisTab}>Keep this tab's version</button>
              </span>
            </div>
          )}
          {saveState === "error" && !conflict && <div className="notice notice-error" role="alert"><span><strong>Saving failed</strong> (storage may be full or blocked). Changes exist only in this tab. Download a backup from Settings.</span></div>}
          {storageStatus === "unavailable" && <div className="notice notice-error" role="alert"><span><strong>Browser storage could not be read.</strong> Nothing will be saved in this session. Download a backup from Settings before leaving.</span></div>}
          {loadWarnings.length > 0 && (
            <div className="notice notice-warn" role="status">
              <span><strong>Saved data was repaired on load:</strong> {loadWarnings.join(" ")}</span>
              <span className="notice-actions"><button type="button" className="btn-outline" onClick={() => setLoadWarnings([])}>Dismiss</button></span>
            </div>
          )}
        </div>
      )}

      <div className="tabbar">
        <div role="tablist" aria-label="Sections" style={{ display: "flex", gap: 2 }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} aria-controls="main-panel" className={`tab-btn ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
                <Icon size={14} aria-hidden="true" /> {t.label}
              </button>
            );
          })}
        </div>
        <a className="github-link" href="https://github.com/Shubham-Gambhire/supplierreliabilitymatrix" target="_blank" rel="noopener noreferrer" aria-label="View this project on GitHub (opens in new tab)">
          <Github size={14} /> GitHub <ArrowUpRight size={12} />
        </a>
        <button type="button" className="methodology-trigger" onClick={() => setShowMethodology(true)}>
          <BookOpen size={13} /> How this is scored
        </button>
      </div>

      <main className="content-wrap" id="main-panel" role="tabpanel">
        {storageStatus === "loading" ? (
          <p className="loading-note" role="status"><Loader2 size={14} className="spin" /> Loading saved data...</p>
        ) : (
          <>
            {tab === "register" && <RegisterView derived={derived} config={config} onSelectSupplier={goToSupplier} onRecordSnapshot={recordSnapshot} lastSnapshotAt={lastSnapshotAt} />}
            {tab === "ledger" && <LedgerView suppliers={suppliers} setSuppliers={setSuppliers} derived={derived} config={config} history={history} fingerprint={fingerprint} focusRequest={focusRequest} customCols={customCols} setCustomCols={setCustomCols} announce={announce} />}
            {tab === "settings" && (
              <SettingsView config={config} onApplyConfig={setConfig} suppliers={suppliers} derived={derived} storageStatus={storageStatus} saveState={saveState} conflict={conflict}
                onResetAll={resetAllData} currentState={{ suppliers, config, history, customCols }} announce={announce}
                onRestore={(st) => { replaceAll(st); announce(`Backup restored: ${st.suppliers.length} suppliers.`); }} />
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <span>Made by Shubham Gambhire</span>
        <a className="footer-linkedin" href="https://www.linkedin.com/in/shubhambg" target="_blank" rel="noopener noreferrer">
          <Linkedin size={13} /> LinkedIn
        </a>
      </footer>

      <Modal open={showMethodology} onClose={() => setShowMethodology(false)} title="How this is scored">
        <MethodologyView config={config} />
      </Modal>
    </div>
  );
}

