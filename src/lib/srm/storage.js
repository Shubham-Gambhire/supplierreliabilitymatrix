import { DEFAULT_CONFIG, cloneDefaultConfig, validateConfig, MODEL_VERSION } from "./scoring.js";
import { HISTORY_LIMIT } from "./history.js";
import { isValidId, newSupplierId, newColumnId } from "./ids.js";

export const STORAGE_KEY = "supplier-scorecard:main";
export const STORAGE_VERSION = 2;
export const BACKUP_FORMAT = "supplier-reliability-matrix-backup";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);
export const normLabel = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function mergeConfig(cfg) {
  const d = cloneDefaultConfig();
  if (!isObj(cfg)) return d;
  const buckets =
    Array.isArray(cfg.deliveryBuckets) && cfg.deliveryBuckets.length === 5
      ? cfg.deliveryBuckets.map((b, i) => ({ min: isObj(b) ? b.min : undefined, score: 5 - i }))
      : d.deliveryBuckets;
  return {
    weights: { ...d.weights, ...(isObj(cfg.weights) ? cfg.weights : {}) },
    multipliers: { ...d.multipliers, ...(isObj(cfg.multipliers) ? cfg.multipliers : {}) },
    thresholds: { ...d.thresholds, ...(isObj(cfg.thresholds) ? cfg.thresholds : {}) },
    minPOs: cfg.minPOs ?? d.minPOs,
    compoundingWeight: cfg.compoundingWeight ?? d.compoundingWeight,
    peerGapThreshold: cfg.peerGapThreshold ?? d.peerGapThreshold,
    deliveryBuckets: buckets,
  };
}

/**
 * Defensively normalizes a stored/restored state object. Never throws.
 * Returns { ok, state?, warnings[], error? }.
 */
export function normalizeState(obj) {
  const warnings = [];
  if (!isObj(obj)) return { ok: false, warnings, error: "Saved data is not an object." };
  if (typeof obj.version === "number" && obj.version > STORAGE_VERSION)
    return { ok: false, warnings, error: `Saved data is from a newer version (${obj.version}).` };
  if (!Array.isArray(obj.suppliers))
    return { ok: false, warnings, error: "Saved data has no supplier list." };

  // custom columns
  const customCols = [];
  const colIds = new Set(),
    colLabels = new Set();
  for (const c of Array.isArray(obj.customCols) ? obj.customCols : []) {
    if (!isObj(c) || typeof c.label !== "string" || !c.label.trim()) {
      warnings.push("Dropped a malformed custom column.");
      continue;
    }
    const label = c.label.trim();
    if (colLabels.has(normLabel(label))) {
      warnings.push(`Dropped duplicate custom column "${label}".`);
      continue;
    }
    let id = isValidId(c.id) && !colIds.has(c.id) ? c.id : newColumnId();
    colIds.add(id);
    colLabels.add(normLabel(label));
    customCols.push({ id, label, type: c.type === "number" ? "number" : "text" });
  }

  // suppliers + ID repair
  const seen = new Set();
  const suppliers = [];
  const rawHistory = isObj(obj.history) ? obj.history : {};
  const history = {};
  let repaired = 0;
  for (const raw of obj.suppliers) {
    if (!isObj(raw)) {
      warnings.push("Dropped a malformed supplier record.");
      continue;
    }
    let id = raw.id;
    const originalValid = isValidId(id);
    if (!originalValid || seen.has(id)) {
      id = newSupplierId();
      while (seen.has(id)) id = newSupplierId();
      repaired++;
    } else {
      const h = Array.prototype.slice.call(rawHistory[id] || []);
      if (Array.isArray(rawHistory[id])) history[id] = h.filter(isObj).slice(-HISTORY_LIMIT);
    }
    seen.add(id);
    const custom = {};
    if (isObj(raw.custom))
      for (const k of Object.keys(raw.custom))
        if (colIds.has(k) && !RESERVED.has(k)) custom[k] = raw.custom[k];
    suppliers.push({
      ...raw,
      id,
      name: typeof raw.name === "string" ? raw.name : String(raw.name ?? ""),
      location: typeof raw.location === "string" ? raw.location : "",
      category: typeof raw.category === "string" ? raw.category : "",
      custom,
    });
  }
  if (repaired)
    warnings.push(
      `${repaired} supplier ID${repaired > 1 ? "s were" : " was"} missing or duplicated and received a new unique ID. No records were removed.`,
    );

  const merged = mergeConfig(obj.config);
  const v = validateConfig(merged);
  let config = v.config;
  if (!v.ok) {
    config = validateConfig(cloneDefaultConfig()).config;
    warnings.push("Saved scoring settings were invalid, so defaults are active. Review Settings.");
  }

  return { ok: true, warnings, state: { suppliers, config, history, customCols } };
}

/** Parses the raw localStorage string. status: empty | corrupt | ok */
export function parseSaved(raw) {
  if (raw === null || raw === undefined) return { status: "empty" };
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    return { status: "corrupt", error: "Saved data could not be read (invalid JSON)." };
  }
  const n = normalizeState(obj);
  if (!n.ok) return { status: "corrupt", error: n.error };
  return {
    status: "ok",
    state: n.state,
    warnings: n.warnings,
    writeToken: typeof obj.writeToken === "string" ? obj.writeToken : null,
  };
}

export function serializeState(state, writeToken) {
  return JSON.stringify({
    version: STORAGE_VERSION,
    modelVersion: MODEL_VERSION,
    savedAt: new Date().toISOString(),
    writeToken,
    suppliers: state.suppliers,
    config: state.config,
    history: state.history,
    customCols: state.customCols,
  });
}

export function readWriteToken(raw) {
  try {
    const o = JSON.parse(raw);
    return isObj(o) && typeof o.writeToken === "string" ? o.writeToken : null;
  } catch {
    return null;
  }
}

export function buildBackup(state) {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: STORAGE_VERSION,
      modelVersion: MODEL_VERSION,
      exportedAt: new Date().toISOString(),
      suppliers: state.suppliers,
      config: state.config,
      history: state.history,
      customCols: state.customCols,
    },
    null,
    2,
  );
}

export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }
  if (!isObj(obj) || obj.format !== BACKUP_FORMAT)
    return { ok: false, error: "This is not a Supplier Reliability Matrix backup file." };
  const n = normalizeState(obj);
  if (!n.ok) return { ok: false, error: n.error };
  return { ok: true, state: n.state, warnings: n.warnings };
}

export { DEFAULT_CONFIG };
