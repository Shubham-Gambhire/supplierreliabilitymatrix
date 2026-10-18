import Papa from "papaparse";
import { validateSupplier, fmtScore } from "./scoring.js";
import { isValidId, newSupplierId, newColumnId } from "./ids.js";
import { normLabel } from "./storage.js";

export const normHeader = (h) => String(h ?? "").replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Explicit aliases (normalized). No substring matching. */
export const FIELD_ALIASES = {
  id: ["id", "supplierid", "vendorid"],
  name: ["suppliername", "supplier", "vendor", "vendorname", "name"],
  location: ["location", "address", "city"],
  category: ["category", "supplycategory"],
  annualSpend: ["annualspend", "annualspendusd", "spend", "spendusd"],
  onTimeDeliveries: ["ontimedeliveries", "ontimedelivery", "ontimeorders", "ontimepos"],
  totalPOs: ["totalpos", "totalpo", "totalpurchaseorders", "purchaseorders", "pos"],
  priority: ["priority", "supplierpriority"],
  singleSource: ["singlesource", "solesource", "singlesourcedependency", "solesourced"],
};
export const REQUIRED_FIELDS = ["name", "annualSpend", "onTimeDeliveries", "totalPOs", "priority", "singleSource"];
/** Derived columns written by our own export; ignored on import. */
export const DERIVED_HEADERS = ["status", "dataissues", "ontimerate", "ontimeratepct", "deliveryscore", "dependencyscore", "performancescore", "prioritymultiplier", "adjustedreliabilityscore", "reliabilitytier", "risktier", "riskscore"];
const CUSTOM_PREFIX = /^custom\s*:\s*/i;

const ALIAS_LOOKUP = new Map();
for (const [field, list] of Object.entries(FIELD_ALIASES)) for (const a of list) ALIAS_LOOKUP.set(a, field);

/** Labels a user may not use for a custom column (would collide with standard/derived fields). */
export function isReservedLabel(label) {
  const n = normHeader(label);
  return !n || ALIAS_LOOKUP.has(n) || DERIVED_HEADERS.includes(n) || n.startsWith("custom");
}

export function parseCount(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  return Number.isSafeInteger(n) ? { ok: true, value: n } : { ok: false };
}

/** Accepts 1200, 1200.50, 1,200, $1,200.00, USD 1200. Rejects negatives, other currencies, European decimals, text. */
export function parseSpend(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return { ok: false };
  s = s.replace(/^usd\s*/i, "").replace(/\s*usd$/i, "").replace(/^\$\s*/, "").trim();
  if (/^\d+(\.\d+)?$/.test(s) || /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
  }
  return { ok: false };
}

export function parsePriority(raw) {
  const m = String(raw ?? "").trim().match(/^p?([1-5])$/i);
  return m ? { ok: true, value: Number(m[1]) } : { ok: false };
}

export function parseBool(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (["y", "yes", "true", "1"].includes(s)) return { ok: true, value: true };
  if (["n", "no", "false", "0"].includes(s)) return { ok: true, value: false };
  return { ok: false };
}

/** Maps headers to fields. Returns { ok, mapping, customHeaders, ignored, errors }. */
export function mapHeaders(headers, customCols = []) {
  const mapping = {}; const errors = []; const ignored = []; const customHeaders = [];
  const byField = {};
  const existingCustom = new Map(customCols.map((c) => [normLabel(c.label), c]));
  headers.forEach((h) => {
    const clean = String(h ?? "").replace(/^\uFEFF/, "").trim();
    if (CUSTOM_PREFIX.test(clean)) {
      const label = clean.replace(CUSTOM_PREFIX, "").trim();
      if (!label) { ignored.push(clean); return; }
      if (customHeaders.some((c) => normLabel(c.label) === normLabel(label))) { errors.push(`Custom column "${label}" appears more than once.`); return; }
      customHeaders.push({ header: h, label, existing: existingCustom.get(normLabel(label)) || null });
      return;
    }
    const n = normHeader(clean);
    const field = ALIAS_LOOKUP.get(n);
    if (field) { (byField[field] = byField[field] || []).push(h); return; }
    const existing = existingCustom.get(normLabel(clean));
    if (existing) { customHeaders.push({ header: h, label: existing.label, existing }); return; }
    ignored.push(clean);
  });
  for (const [field, hs] of Object.entries(byField)) {
    if (hs.length > 1) errors.push(`Ambiguous columns for ${field}: ${hs.map((x) => `"${x}"`).join(", ")}. Keep only one.`);
    else mapping[field] = hs[0];
  }
  for (const f of REQUIRED_FIELDS) if (!byField[f]) errors.push(`Missing required column for ${f} (accepted headers: ${FIELD_ALIASES[f].join(", ")}).`);
  return { ok: errors.length === 0, mapping, customHeaders, ignored, errors };
}

/**
 * Builds an import preview. Nothing is applied. Returns
 * { ok, errors[], ignored[], rows: [{line, record, errors[], duplicateOf, kind}], newCustomCols[] }
 * kind: "new" | "duplicate" | "invalid"
 */
export function buildImportPreview(text, existing, customCols = []) {
  const res = Papa.parse(String(text).replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.replace(/^\uFEFF/, "").trim() });
  const headers = res.meta?.fields || [];
  const map = mapHeaders(headers, customCols);
  const fatal = [...map.errors];
  const parseErrByRow = new Map();
  for (const e of res.errors || []) {
    if (typeof e.row === "number") parseErrByRow.set(e.row, e.message);
    else fatal.push(`CSV error: ${e.message}`);
  }
  if (!map.ok || !headers.length) return { ok: false, errors: fatal.length ? fatal : ["The file has no header row."], ignored: map.ignored, rows: [], newCustomCols: [] };

  const newCustomCols = map.customHeaders.filter((c) => !c.existing).map((c) => ({ id: newColumnId(), label: c.label, type: "text" }));
  const colFor = (c) => c.existing || newCustomCols.find((n) => normLabel(n.label) === normLabel(c.label));
  const existingById = new Map(existing.map((s) => [s.id, s]));
  const existingByName = new Map(existing.map((s) => [normLabel(s.name), s]));
  const seenIds = new Set(), seenNames = new Set();

  const rows = res.data.map((row, i) => {
    const line = i + 2;
    const errs = [];
    if (parseErrByRow.has(i)) errs.push(`Malformed row: ${parseErrByRow.get(i)}`);
    const get = (f) => (map.mapping[f] ? row[map.mapping[f]] : undefined);
    const name = String(get("name") ?? "").trim();
    const spend = parseSpend(get("annualSpend"));
    const onTime = parseCount(get("onTimeDeliveries"));
    const total = parseCount(get("totalPOs"));
    const pri = parsePriority(get("priority"));
    const ss = parseBool(get("singleSource"));
    if (!name) errs.push("Supplier name is blank.");
    if (!spend.ok) errs.push(`Annual spend "${get("annualSpend") ?? ""}" is not a valid USD amount.`);
    if (!onTime.ok) errs.push(`On-time deliveries "${get("onTimeDeliveries") ?? ""}" is not a whole number.`);
    if (!total.ok) errs.push(`Total POs "${get("totalPOs") ?? ""}" is not a whole number.`);
    if (!pri.ok) errs.push(`Priority "${get("priority") ?? ""}" must be 1-5 (or P1-P5).`);
    if (!ss.ok) errs.push(`Sole source "${get("singleSource") ?? ""}" must be Y/N, Yes/No, True/False or 1/0.`);
    const rawId = String(get("id") ?? "").trim();
    if (rawId && !isValidId(rawId)) errs.push(`ID "${rawId}" contains unsupported characters.`);
    const custom = {};
    for (const c of map.customHeaders) { const col = colFor(c); if (col) custom[col.id] = String(row[c.header] ?? ""); }
    const record = {
      id: rawId && isValidId(rawId) ? rawId : newSupplierId(),
      name,
      location: String(get("location") ?? "").trim(),
      category: String(get("category") ?? "").trim(),
      annualSpend: spend.ok ? spend.value : null,
      onTimeDeliveries: onTime.ok ? onTime.value : null,
      totalPOs: total.ok ? total.value : null,
      priority: pri.ok ? pri.value : null,
      singleSource: ss.ok ? ss.value : null,
      custom,
    };
    if (!errs.length) { const v = validateSupplier(record); errs.push(...Object.values(v.errors)); }
    const nameKey = normLabel(name);
    if ((rawId && seenIds.has(rawId)) || (name && seenNames.has(nameKey))) errs.push("Duplicate of an earlier row in this file.");
    if (rawId) seenIds.add(rawId); if (name) seenNames.add(nameKey);
    const dup = (rawId && existingById.get(rawId)) || (name && existingByName.get(nameKey)) || null;
    const kind = errs.length ? "invalid" : dup ? "duplicate" : "new";
    if (kind === "new" && existingById.has(record.id)) record.id = newSupplierId();
    return { line, record, errors: errs, duplicateOf: dup ? dup.id : null, duplicateName: dup ? dup.name : null, kind };
  });
  return { ok: true, errors: [], ignored: map.ignored, rows, newCustomCols };
}

/** Applies a preview. mode: "skip" | "update". Returns { suppliers, customCols, added, updated, skipped }. */
export function applyImport(preview, suppliers, customCols, mode = "skip") {
  let next = [...suppliers];
  let added = 0, updated = 0, skipped = 0;
  for (const r of preview.rows) {
    if (r.kind === "invalid") { skipped++; continue; }
    if (r.kind === "duplicate") {
      if (mode !== "update") { skipped++; continue; }
      next = next.map((s) => (s.id === r.duplicateOf ? { ...s, ...r.record, id: s.id, custom: { ...(s.custom || {}), ...r.record.custom } } : s));
      updated++;
      continue;
    }
    next.push(r.record); added++;
  }
  const usedCols = preview.newCustomCols;
  return { suppliers: next, customCols: [...customCols, ...usedCols], added, updated, skipped };
}

/** Export rows with stable IDs, raw inputs, derived values and custom fields under a "Custom: " prefix. */
export function buildExportCsv(derived, customCols) {
  const fields = ["ID", "Supplier Name", "Location", "Category", "Annual Spend (USD)", "Priority", "Single Source", "On-Time Deliveries", "Total POs",
    "Status", "Data Issues", "On-Time Rate %", "Delivery Score", "Dependency Score", "Performance Score", "Priority Multiplier", "Adjusted Reliability Score", "Reliability Tier",
    ...customCols.map((c) => `Custom: ${c.label}`)];
  const data = derived.map((s) => [
    s.id, s.name ?? "", s.location ?? "", s.category ?? "", s.annualSpend ?? "", s.priority ?? "", s.singleSource === true ? "Y" : s.singleSource === false ? "N" : "",
    s.onTimeDeliveries ?? "", s.totalPOs ?? "",
    s.status, Object.values(s.errors || {}).join(" "),
    s.onTimeRate !== null && s.onTimeRate !== undefined ? +(s.onTimeRate * 100).toFixed(2) : "",
    s.deliveryScore ?? "", s.dependencyScore ?? "",
    s.performanceScore !== null ? fmtScore(s.performanceScore) : "", s.multiplier ?? "",
    s.adjustedScore !== null ? fmtScore(s.adjustedScore) : "", s.riskTier,
    ...customCols.map((c) => (s.custom && s.custom[c.id] !== undefined && s.custom[c.id] !== null ? String(s.custom[c.id]) : "")),
  ]);
  return Papa.unparse({ fields, data }, { escapeFormulae: true });
}
