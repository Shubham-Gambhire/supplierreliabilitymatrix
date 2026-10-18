import { MODEL_VERSION } from "./scoring.js";

/** Maximum snapshots retained per supplier (oldest dropped first). Disclosed in the UI. */
export const HISTORY_LIMIT = 50;

export function isCompatible(entry, fingerprint) {
  return !!entry && entry.modelVersion === MODEL_VERSION && entry.configFp === fingerprint && Number.isFinite(entry.adjustedScore);
}

/** Splits a supplier's history into entries comparable with the active model/config and the rest. */
export function splitHistory(entries, fingerprint) {
  const list = Array.isArray(entries) ? entries : [];
  const compatible = [], legacy = [], otherConfig = [];
  for (const e of list) {
    if (isCompatible(e, fingerprint)) compatible.push(e);
    else if (!e || e.modelVersion !== MODEL_VERSION) legacy.push(e);
    else otherConfig.push(e);
  }
  return { compatible, legacy, otherConfig };
}

/**
 * Records a snapshot of all SCORED suppliers. Returns { history, count }.
 * count === 0 means nothing was recorded (history returned unchanged).
 */
export function recordSnapshot(history, derived, fingerprint, ts = new Date().toISOString()) {
  const scored = derived.filter((s) => s.status === "scored" && Number.isFinite(s.adjustedScore));
  if (scored.length === 0) return { history, count: 0 };
  const next = { ...history };
  for (const s of scored) {
    const entry = { ts, adjustedScore: s.adjustedScore, riskTier: s.riskTier, performanceScore: s.performanceScore, modelVersion: MODEL_VERSION, configFp: fingerprint };
    const arr = [...(Array.isArray(history[s.id]) ? history[s.id] : []), entry];
    next[s.id] = arr.length > HISTORY_LIMIT ? arr.slice(arr.length - HISTORY_LIMIT) : arr;
  }
  return { history: next, count: scored.length };
}

/** Trend vs the last COMPATIBLE snapshot only. */
export function trendDelta(entries, adjustedScore, fingerprint) {
  if (!Number.isFinite(adjustedScore)) return null;
  const { compatible } = splitHistory(entries, fingerprint);
  if (!compatible.length) return null;
  return adjustedScore - compatible[compatible.length - 1].adjustedScore;
}
