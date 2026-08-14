import React, { useState, useMemo, useRef, useEffect } from "react";
import Papa from "papaparse";
import {
  Search, Upload, Download, Plus, Trash2, X, ChevronDown, ChevronUp,
  Settings2, FileText, AlertTriangle, RotateCcw, Info, BookOpen,
  LayoutGrid, ListChecks, ArrowUpDown, Building2, Check, History,
  TrendingUp, TrendingDown, Minus, DollarSign, Loader2, AlertCircle, Columns, Linkedin,
  Github, ArrowUpRight,
} from "lucide-react";

/* =====================================================================
   DESIGN TOKENS
   Enterprise-procurement "vendor ledger" aesthetic: cool parchment
   paper, institutional navy, brass for priority and authority accents,
   muted ink-stamp colors for risk tiers. Open Sans throughout for a
   plain, classic reading experience; JetBrains Mono only where figures
   need to line up like a real ledger. All body text is black; only
   risk-tier and accent colors carry meaning.
===================================================================== */
const C = {
  paper: "#EEECE3",
  paperLine: "#D9D6C8",
  paperLineStrong: "#C4C0AE",
  surface: "#FFFFFF",
  surfaceAlt: "#F7F6F1",
  ink: "#000000",
  inkMuted: "#000000",
  inkFaint: "#000000",
  navy: "#1B3A5C",
  navySoft: "#2E567C",
  navyDim: "#E3E9EF",
  brass: "#8E6F2C",
  brassDim: "#F0E7CD",
  critical: "#7A2E2E",
  criticalDim: "#F3E0DE",
  high: "#AD5C10",
  highDim: "#F6E6D3",
  medium: "#87680A",
  mediumDim: "#F1EACB",
  low: "#2A6644",
  lowDim: "#DEEAE2",
  insufficient: "#6B6B60",
  insufficientDim: "#E6E4DB",
};
const F_DISPLAY = "'Open Sans', sans-serif";
const F_BODY = "'Open Sans', sans-serif";
const F_DATA = "'JetBrains Mono', monospace";

// Cool-toned palette for category/region coloring, kept deliberately
// away from the warm red/amber/ochre/green already used for risk
// tiers so the two color systems never get confused for each other.
const CATEGORICAL_PALETTE = [
  "#2C5AA0", "#5B4B8A", "#1F6F72", "#46586B",
  "#6B4A2E", "#38477A", "#8A5A2E", "#3D6B7A",
];
function buildColorMap(values) {
  const unique = Array.from(new Set(values.filter(Boolean))).sort();
  const map = {};
  unique.forEach((v, i) => { map[v] = CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]; });
  return map;
}
function deriveRegion(location) {
  if (!location) return "Unspecified";
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || "Unspecified";
}
function formatCurrency(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "N/A";
  if (n >= 1000000) return `$${round2(n / 1000000)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

const RISK_META = {
  "Low Risk": { color: C.low, dim: C.lowDim, code: "LOW" },
  "Medium Risk": { color: C.medium, dim: C.mediumDim, code: "MED" },
  "High Risk": { color: C.high, dim: C.highDim, code: "HIGH" },
  "Critical Risk": { color: C.critical, dim: C.criticalDim, code: "CRIT" },
  "Insufficient Data": { color: C.insufficient, dim: C.insufficientDim, code: "N/A" },
};

/* =====================================================================
   SCORING ENGINE. On-Time Rate -> Delivery Score (bucketed) ->
   Performance Score (weighted blend with Dependency Score, adjusted
   by a compounding penalty, see below) -> x Priority Multiplier ->
   Risk Score -> Risk Tier. Suppliers under the minimum PO count are
   flagged Insufficient Data rather than scored off a thin sample.

   COMPOUNDING PENALTY: Delivery Score and Dependency Score start as
   two independent measurements, but the risk they represent is not
   independent. A sole-sourced supplier that is also missing delivery
   dates is worse than the sum of those two problems, because there is
   no fallback to absorb the miss. The penalty only activates when
   BOTH scores sit below the midpoint (3 on a 1-5 scale), and scales
   with how far below both fall, so a supplier that is weak on just
   one dimension is not double-punished. Set compoundingWeight to 0 in
   Settings to fall back to a plain weighted sum.
===================================================================== */
const DEFAULT_WEIGHTS = { delivery: 0.65, dependency: 0.35 };
const DEFAULT_MULTIPLIERS = { 1: 1.5, 2: 1.3, 3: 1.1, 4: 1.0, 5: 0.9 };
const DEFAULT_THRESHOLDS = { low: 3.75, medium: 2.5, high: 1.5 };
const DEFAULT_MIN_POS = 3;
const DEFAULT_COMPOUNDING_WEIGHT = 0.15;
const DEFAULT_PEER_GAP_THRESHOLD = 0.5;
const SCORE_MIDPOINT = 3;
const DEFAULT_DELIVERY_BUCKETS = [
  { min: 0.90, score: 5, label: "\u2265 90%" },
  { min: 0.75, score: 4, label: "75-89%" },
  { min: 0.60, score: 3, label: "60-74%" },
  { min: 0.45, score: 2, label: "45-59%" },
  { min: 0, score: 1, label: "< 45%" },
];

function round2(n) { return Math.round(n * 100) / 100; }

// Peer-relative comparison: a secondary signal alongside the absolute
// Risk Tier. Groups scored suppliers by category, computes each
// category's average Risk Score, and flags a supplier as a "category
// laggard" only when it sits more than peerGapThreshold points below
// its own category's average, with at least one other scored peer in
// that category to compare against. This never replaces the absolute
// tier, an entire structurally-risky category could otherwise end up
// with nobody flagged just because everyone in it looks equally risky
// next to each other. See Methodology for the full reasoning.
function attachPeerComparison(derivedSuppliers, peerGapThreshold) {
  const scored = derivedSuppliers.filter((s) => s.riskScore !== null);
  const groups = {};
  scored.forEach((s) => {
    const cat = s.category || "Uncategorized";
    (groups[cat] = groups[cat] || []).push(s.riskScore);
  });
  const catStats = {};
  Object.entries(groups).forEach(([cat, scores]) => {
    catStats[cat] = { avg: round2(scores.reduce((a, b) => a + b, 0) / scores.length), count: scores.length };
  });
  return derivedSuppliers.map((s) => {
    if (s.riskScore === null) {
      return { ...s, categoryPeerAvg: null, categoryPeerCount: 0, peerDelta: null, peerDeltaPct: null, belowPeerAvg: false };
    }
    const cat = s.category || "Uncategorized";
    const stats = catStats[cat] || { avg: s.riskScore, count: 1 };
    const peerDelta = round2(s.riskScore - stats.avg);
    const belowPeerAvg = stats.count >= 2 && peerDelta < -peerGapThreshold;
    const peerDeltaPct = stats.avg > 0.01 ? Math.round((Math.abs(peerDelta) / stats.avg) * 100) : null;
    return { ...s, categoryPeerAvg: stats.avg, categoryPeerCount: stats.count, peerDelta, peerDeltaPct, belowPeerAvg };
  });
}

function computeDeliveryScore(rate, buckets) {
  const sorted = [...buckets].sort((a, b) => b.min - a.min);
  for (const b of sorted) if (rate >= b.min) return b.score;
  return sorted[sorted.length - 1].score;
}
function computeDependencyScore(singleSource, priority) {
  if (!singleSource) return 5;
  if (priority <= 2) return 1;
  if (priority === 3) return 2;
  return 3;
}
function computeRiskTier(score, thresholds) {
  if (score >= thresholds.low) return "Low Risk";
  if (score >= thresholds.medium) return "Medium Risk";
  if (score >= thresholds.high) return "High Risk";
  return "Critical Risk";
}
function computeSupplier(s, config) {
  const totalPOs = Math.max(0, Number(s.totalPOs) || 0);
  const onTimeDeliveries = Math.max(0, Number(s.onTimeDeliveries) || 0);
  const onTimeExceedsTotal = onTimeDeliveries > totalPOs;
  const priority = Number(s.priority) || 5;
  const insufficient = totalPOs < config.minPOs;
  // On-time deliveries can't logically exceed total POs. Bad data (a typo,
  // a bad CSV import) is clamped here so the rate can never read above
  // 100%, while the raw stored value is left alone so the Ledger can still
  // show and flag the inconsistency for the user to correct at the source.
  const effectiveOnTime = totalPOs > 0 ? Math.min(onTimeDeliveries, totalPOs) : 0;
  const onTimeRate = totalPOs > 0 ? effectiveOnTime / totalPOs : null;
  const dependencyScore = computeDependencyScore(s.singleSource, priority);
  const deliveryScore = !insufficient && onTimeRate !== null
    ? computeDeliveryScore(onTimeRate, config.deliveryBuckets) : null;
  const deliveryDeficit = deliveryScore !== null ? Math.max(0, SCORE_MIDPOINT - deliveryScore) : 0;
  const dependencyDeficit = Math.max(0, SCORE_MIDPOINT - dependencyScore);
  const compoundingPenalty = deliveryScore !== null
    ? round2((config.compoundingWeight ?? 0) * deliveryDeficit * dependencyDeficit) : 0;
  const performanceScore = deliveryScore !== null
    ? round2(Math.max(0, config.weights.delivery * deliveryScore + config.weights.dependency * dependencyScore - compoundingPenalty))
    : null;
  const multiplier = config.multipliers[priority] ?? 1;
  const riskScore = performanceScore !== null ? round2(performanceScore * multiplier) : null;
  const riskTier = insufficient ? "Insufficient Data" : computeRiskTier(riskScore, config.thresholds);
  return { ...s, totalPOs, onTimeDeliveries, onTimeExceedsTotal, priority, onTimeRate, insufficient, dependencyScore, deliveryScore, compoundingPenalty, performanceScore, multiplier, riskScore, riskTier };
}

/* =====================================================================
   SEED DATA. Fictional example suppliers for demonstration purposes
   only. Names, locations, and industries are invented and do not
   correspond to any real company or dataset.
===================================================================== */
const CATEGORY_OPTIONS = [
  "Components", "Industrial Supply", "Textiles", "Packaging",
  "Office Systems", "Logistics", "Automation", "Fasteners",
  "Raw Materials", "Services",
];
const SEED_SUPPLIERS = [
  { id: "SUP-001", name: "Bramfield Components Inc.", location: "Charlotte, NC, USA", category: "Components", annualSpend: 850000, onTimeDeliveries: 25, totalPOs: 43, priority: 5, singleSource: false },
  { id: "SUP-002", name: "Corven Industrial Supply", location: "Columbus, OH, USA", category: "Industrial Supply", annualSpend: 210000, onTimeDeliveries: 3, totalPOs: 14, priority: 3, singleSource: true },
  { id: "SUP-003", name: "Halden Textiles Co.", location: "Greensboro, NC, USA", category: "Textiles", annualSpend: 45000, onTimeDeliveries: 1, totalPOs: 2, priority: 1, singleSource: true },
  { id: "SUP-004", name: "Ashworth Print & Packaging", location: "Denver, CO, USA", category: "Packaging", annualSpend: 18000, onTimeDeliveries: 0, totalPOs: 1, priority: 5, singleSource: false },
  { id: "SUP-005", name: "Trentmoor Office Systems", location: "Kansas City, MO, USA", category: "Office Systems", annualSpend: 62000, onTimeDeliveries: 3, totalPOs: 4, priority: 3, singleSource: false },
  { id: "SUP-006", name: "Larkspur Logistics Partners", location: "Memphis, TN, USA", category: "Logistics", annualSpend: 390000, onTimeDeliveries: 3, totalPOs: 8, priority: 5, singleSource: false },
  { id: "SUP-007", name: "Voss Industrial GmbH", location: "Stuttgart, Germany", category: "Components", annualSpend: 1150000, onTimeDeliveries: 10, totalPOs: 24, priority: 5, singleSource: false },
  { id: "SUP-008", name: "Alderney Precision Works Ltd.", location: "Sheffield, United Kingdom", category: "Components", annualSpend: 920000, onTimeDeliveries: 21, totalPOs: 38, priority: 3, singleSource: false },
  { id: "SUP-009", name: "Kestrel Automation AB", location: "Gothenburg, Sweden", category: "Automation", annualSpend: 34000, onTimeDeliveries: 0, totalPOs: 1, priority: 5, singleSource: true },
  { id: "SUP-010", name: "Meridian Fasteners S.A.", location: "Lyon, France", category: "Fasteners", annualSpend: 27000, onTimeDeliveries: 0, totalPOs: 1, priority: 5, singleSource: false },
];

let ROW_SEQ = SEED_SUPPLIERS.length + 1;
function newId() { return `SUP-${String(ROW_SEQ++).padStart(3, "0")}`; }

/* =====================================================================
   SHARED UI BITS
===================================================================== */
function Stamp({ tier, size = "sm" }) {
  const m = RISK_META[tier] || RISK_META["Insufficient Data"];
  const big = size === "lg";
  return (
    <span
      className="stamp"
      style={{
        color: m.color,
        borderColor: m.color,
        fontSize: big ? 15 : 11,
        padding: big ? "6px 14px" : "2px 8px",
      }}
    >
      {tier === "Insufficient Data" ? "INSUFFICIENT DATA" : m.code === "CRIT" ? "CRITICAL" : m.code === "MED" ? "MEDIUM" : m.code}
    </span>
  );
}

function HeroStat({ label, value, sub, color }) {
  return (
    <div className="hero-stat">
      <div className="hero-stat-label">{label}</div>
      <div className="hero-stat-value" style={{ color: color || C.ink }}>{value}</div>
      {sub && <div className="hero-stat-sub">{sub}</div>}
    </div>
  );
}

function StatStrip({ items }) {
  return (
    <div className="stat-strip">
      {items.map((it, i) => (
        <span className="stat-strip-item" key={it.label}>
          {i > 0 && <span className="stat-strip-sep">&middot;</span>}
          <span className="stat-strip-label">{it.label}</span>
          <span className="stat-strip-value" style={it.color ? { color: it.color } : undefined}>{it.value}</span>
        </span>
      ))}
    </div>
  );
}

function InfoTip({ text }) {
  return (
    <span className="info-tip" tabIndex={0}>
      ?
      <span className="info-tip-bubble">{text}</span>
    </span>
  );
}

function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function FieldNumber({ value, onChange, step = 1, min, max, width = 72, warn, title }) {
  const handleChange = (e) => {
    const raw = e.target.value;
    if (raw === "") { onChange(""); return; }
    let v = Number(raw);
    if (Number.isNaN(v)) return;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    onChange(v);
  };
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={handleChange}
      className={`field-num ${warn ? "field-num-warn" : ""}`}
      style={{ width }}
      title={title}
    />
  );
}

/* =====================================================================
   RISK MATRIX. The signature visual: on-time reliability (x) against
   sourcing dependency (y), quadrant-tinted like a real 2x2 risk
   matrix. Priority multiplier isn't shown here; it's a third factor
   folded into the final Risk Tier in the ledger below, so a point's
   quadrant is a read on raw exposure, not the final verdict. Point
   size reflects annual spend (area-proportional), and color can show
   Risk Tier, Category, or Region. Click a point to open that supplier
   in the Ledger.
===================================================================== */
function RiskMatrix({ suppliers, colorBy, onSelectSupplier }) {
  const W = 640, H = 380, PAD = { l: 56, r: 24, t: 20, b: 46 };
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const plottable = suppliers.filter((s) => !s.insufficient && s.onTimeRate !== null);
  const omitted = suppliers.length - plottable.length;

  const x = (rate) => PAD.l + rate * plotW;
  const y = (score) => PAD.t + (1 - (score - 1) / 4) * plotH;
  const midX = x(0.6), midY = y(3);

  const spends = plottable.map((s) => s.annualSpend || 0);
  const minSpend = spends.length ? Math.min(...spends) : 0;
  const maxSpend = spends.length ? Math.max(...spends) : 0;
  const RMIN = 5, RMAX = 17;
  const radius = (spend) => {
    if (maxSpend <= minSpend) return (RMIN + RMAX) / 2;
    const frac = (spend - minSpend) / (maxSpend - minSpend);
    return RMIN + (RMAX - RMIN) * Math.sqrt(Math.max(0, frac));
  };

  const groupValue = (s) => (colorBy === "category" ? (s.category || "Uncategorized") : deriveRegion(s.location));
  const colorMap = colorBy !== "risk" ? buildColorMap(plottable.map(groupValue)) : null;
  const pointColor = (s) => (colorBy === "risk" ? RISK_META[s.riskTier].color : colorMap[groupValue(s)]);

  const legendEntries = colorBy === "risk"
    ? Object.entries(RISK_META).filter(([k]) => k !== "Insufficient Data").map(([k, v]) => [k, v.color])
    : Object.entries(colorMap || {});

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="matrix-svg" role="img" aria-label="Supplier risk matrix: on-time delivery rate against sourcing dependency score">
        {/* quadrant tints */}
        <rect x={PAD.l} y={PAD.t} width={midX - PAD.l} height={midY - PAD.t} fill={C.highDim} opacity="0.55" />
        <rect x={midX} y={PAD.t} width={PAD.l + plotW - midX} height={midY - PAD.t} fill={C.mediumDim} opacity="0.55" />
        <rect x={PAD.l} y={midY} width={midX - PAD.l} height={PAD.t + plotH - midY} fill={C.mediumDim} opacity="0.55" />
        <rect x={midX} y={midY} width={PAD.l + plotW - midX} height={PAD.t + plotH - midY} fill={C.lowDim} opacity="0.55" />
        <rect x={PAD.l} y={PAD.t} width={midX - PAD.l} height={midY - PAD.t} fill={C.criticalDim} opacity="0.35" />

        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={x(f)} y1={PAD.t} x2={x(f)} y2={PAD.t + plotH} stroke={C.paperLineStrong} strokeWidth="1" strokeDasharray="2 3" />
        ))}
        {[1, 2, 3, 4, 5].map((s) => (
          <line key={s} x1={PAD.l} y1={y(s)} x2={PAD.l + plotW} y2={y(s)} stroke={C.paperLineStrong} strokeWidth="1" strokeDasharray="2 3" />
        ))}
        <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill="none" stroke={C.ink} strokeWidth="1.5" />

        {/* axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={x(f)} y={PAD.t + plotH + 18} textAnchor="middle" style={{ font: `11px ${F_DATA}`, fill: C.inkMuted }}>{Math.round(f * 100)}%</text>
        ))}
        {[1, 2, 3, 4, 5].map((s) => (
          <text key={s} x={PAD.l - 10} y={y(s) + 4} textAnchor="end" style={{ font: `11px ${F_DATA}`, fill: C.inkMuted }}>{s}</text>
        ))}

        {/* axis labels */}
        <text x={PAD.l + plotW / 2} y={H - 6} textAnchor="middle" style={{ font: `600 11px ${F_BODY}`, fill: C.ink, letterSpacing: "0.06em" }}>ON-TIME DELIVERY RATE →</text>
        <text x={-(PAD.t + plotH / 2)} y={16} transform="rotate(-90)" textAnchor="middle" style={{ font: `600 11px ${F_BODY}`, fill: C.ink, letterSpacing: "0.06em" }}>SOURCING DEPENDENCY SCORE →</text>

        {/* corner annotations */}
        <text x={PAD.l + 6} y={PAD.t + 14} style={{ font: `italic 10.5px ${F_DISPLAY}`, fill: C.critical }}>Highest exposure</text>
        <text x={PAD.l + plotW - 6} y={PAD.t + plotH - 8} textAnchor="end" style={{ font: `italic 10.5px ${F_DISPLAY}`, fill: C.low }}>Most resilient</text>

        {/* points, sized by spend, colored by the active mode */}
        {plottable.map((s) => (
          <g
            key={s.id}
            transform={`translate(${x(s.onTimeRate)}, ${y(s.dependencyScore)})`}
            className="matrix-point"
            onClick={() => onSelectSupplier && onSelectSupplier(s.id)}
            tabIndex={0}
            role="button"
            aria-label={`Open ${s.name} in the ledger`}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && onSelectSupplier) onSelectSupplier(s.id); }}
          >
            <circle r={radius(s.annualSpend || 0)} fill={pointColor(s)} stroke={C.surface} strokeWidth="1.5" opacity="0.88" />
            <title>{`${s.name}: ${Math.round(s.onTimeRate * 100)}% on-time, dependency ${s.dependencyScore}/5, ${formatCurrency(s.annualSpend)} spend, ${s.riskTier}`}</title>
          </g>
        ))}
      </svg>

      <div className="matrix-legend">
        {legendEntries.map(([label, color]) => (
          <span key={label} className="legend-item">
            <span className="legend-swatch" style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className="legend-item legend-note">Bubble size: annual spend</span>
      </div>

      {omitted > 0 && (
        <p className="matrix-note">
          {omitted} supplier{omitted > 1 ? "s" : ""} omitted: fewer than {DEFAULT_MIN_POS} purchase orders on file, not enough history to place reliably.
        </p>
      )}
    </div>
  );
}

/* =====================================================================
   REGISTER (overview) VIEW
===================================================================== */
const COLOR_BY_OPTIONS = [
  { key: "risk", label: "Risk Tier" },
  { key: "category", label: "Category" },
  { key: "region", label: "Region" },
];

function RegisterView({ derived, onSelectSupplier, onRecordSnapshot, lastSnapshotAt }) {
  const [colorBy, setColorBy] = useState("risk");
  const total = derived.length;
  const scored = derived.filter((s) => !s.insufficient);
  const critical = derived.filter((s) => s.riskTier === "Critical Risk").length;
  const high = derived.filter((s) => s.riskTier === "High Risk").length;
  const soleSource = derived.filter((s) => s.singleSource).length;
  const insufficientCount = derived.filter((s) => s.insufficient).length;
  const avgPerf = scored.length ? round2(scored.reduce((a, s) => a + s.performanceScore, 0) / scored.length) : null;
  const spendAtRisk = derived
    .filter((s) => s.riskTier === "Critical Risk" || s.riskTier === "High Risk")
    .reduce((a, s) => a + (s.annualSpend || 0), 0);

  const tierCounts = ["Low Risk", "Medium Risk", "High Risk", "Critical Risk", "Insufficient Data"]
    .map((t) => ({ tier: t, count: derived.filter((s) => s.riskTier === t).length }));

  const watchlist = [...derived]
    .filter((s) => s.riskTier === "Critical Risk" || s.riskTier === "High Risk")
    .sort((a, b) => (a.riskScore ?? 0) - (b.riskScore ?? 0));

  const laggards = [...derived]
    .filter((s) => s.belowPeerAvg)
    .sort((a, b) => (b.peerDeltaPct ?? 0) - (a.peerDeltaPct ?? 0));

  return (
    <div className="stack-lg">
      <div className="kpi-hero-row">
        <HeroStat label="Spend at risk" value={formatCurrency(spendAtRisk)} sub="Critical + High tier" color={critical + high > 0 ? C.high : C.ink} />
        <StatStrip items={[
          { label: "Suppliers", value: total },
          { label: "Scored", value: scored.length },
          { label: "Insufficient data", value: insufficientCount },
          { label: "Critical/High", value: critical + high, color: critical > 0 ? C.critical : undefined },
          { label: "Sole-source", value: soleSource, color: C.brass },
          { label: "Avg performance", value: avgPerf ?? "N/A" },
        ]} />
      </div>

      <section className="matrix-section">
        <div className="matrix-section-head">
          <h2>Reliability matrix</h2>
          <span className="panel-hint">On-time delivery vs. sourcing dependency</span>
        </div>
        <div className="colorby-row">
          <span className="colorby-label">Color by</span>
          <div className="chip-row">
            {COLOR_BY_OPTIONS.map((o) => (
              <button key={o.key} className={`chip ${colorBy === o.key ? "chip-active" : ""}`} onClick={() => setColorBy(o.key)}>
                {o.label}
              </button>
            ))}
          </div>
          <button className="btn-outline snapshot-btn" onClick={onRecordSnapshot}>
            <History size={13} /> Record snapshot
          </button>
          {lastSnapshotAt && <span className="snapshot-note">Last recorded {new Date(lastSnapshotAt).toLocaleDateString()}</span>}
        </div>
        <RiskMatrix suppliers={derived} colorBy={colorBy} onSelectSupplier={onSelectSupplier} />
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h3>Risk tier tally</h3>
          </div>
          <div className="tally">
            {tierCounts.map((t) => {
              const m = RISK_META[t.tier];
              const pct = total ? (t.count / total) * 100 : 0;
              return (
                <div key={t.tier} className="tally-row">
                  <span className="tally-label" style={{ color: m.color }}>{t.tier}</span>
                  <div className="tally-track">
                    <div className="tally-fill" style={{ width: `${pct}%`, background: m.color }} />
                  </div>
                  <span className="tally-count">{t.count}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Watchlist</h3>
            <span className="panel-hint">Critical &amp; High, lowest score first</span>
          </div>
          {watchlist.length === 0 ? (
            <p className="empty-note">No suppliers currently in Critical or High Risk.</p>
          ) : (
            <div className="watchlist">
              {watchlist.slice(0, 6).map((s) => (
                <div key={s.id} className="watchlist-row" onClick={() => onSelectSupplier(s.id)}>
                  <div className="watchlist-name">
                    <Building2 size={13} color={C.ink} />
                    <span>{s.name}</span>
                  </div>
                  <span className="watchlist-score" style={{ color: RISK_META[s.riskTier].color }}>{s.riskScore?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Category laggards</h3>
            <span className="panel-hint">Below their own category average</span>
          </div>
          {laggards.length === 0 ? (
            <p className="empty-note">No supplier is currently a meaningful laggard within its own category.</p>
          ) : (
            <div className="watchlist">
              {laggards.slice(0, 6).map((s) => (
                <div key={s.id} className="watchlist-row" onClick={() => onSelectSupplier(s.id)}>
                  <div className="watchlist-name">
                    <Building2 size={13} color={C.ink} />
                    <span>{s.name}</span>
                    <span className="laggard-category">{s.category}</span>
                  </div>
                  <span className="watchlist-score" style={{ color: C.brass }}>-{s.peerDeltaPct}%</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* =====================================================================
   LEDGER VIEW: the editable data grid
===================================================================== */
const TIER_FILTERS = ["All", "Low Risk", "Medium Risk", "High Risk", "Critical Risk", "Insufficient Data"];

function TrendIndicator({ supplierId, riskScore, history }) {
  const past = history[supplierId];
  if (!past || past.length === 0 || riskScore === null) return <span className="trend-empty">N/A</span>;
  const lastEntry = past[past.length - 1];
  const delta = round2(riskScore - lastEntry.riskScore);
  if (delta > 0.05) return <span className="trend-up"><TrendingUp size={13} /> +{delta}</span>;
  if (delta < -0.05) return <span className="trend-down"><TrendingDown size={13} /> {delta}</span>;
  return <span className="trend-flat"><Minus size={13} /> {delta}</span>;
}

const COLUMN_DEFS = [
  { key: "location", label: "Location" },
  { key: "category", label: "Category" },
  { key: "spend", label: "Annual spend" },
  { key: "priority", label: "Priority" },
  { key: "singleSource", label: "Sole source" },
  { key: "onTime", label: "On-time" },
  { key: "totalPOs", label: "Total POs" },
  { key: "onTimeRate", label: "On-time rate" },
  { key: "riskScore", label: "Risk score" },
  { key: "riskTier", label: "Risk tier" },
  { key: "trend", label: "Trend" },
];

function ColumnsMenu({ hiddenCols, toggleCol }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return (
    <div className="columns-menu" ref={ref}>
      <button className="btn-outline" onClick={() => setOpen((o) => !o)}><Columns size={13} /> Columns</button>
      {open && (
        <div className="columns-panel">
          {COLUMN_DEFS.map((c) => (
            <label key={c.key} className="columns-panel-item">
              <input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => toggleCol(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function LedgerView({ suppliers, setSuppliers, derived, config, history, focusRequest }) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [expandedId, setExpandedId] = useState(null);
  const [hiddenCols, setHiddenCols] = useState(() => new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const fileRef = useRef(null);
  const undoTimer = useRef(null);

  useEffect(() => {
    if (!focusRequest || !focusRequest.id) return;
    setTierFilter("All");
    setQuery("");
    setExpandedId(focusRequest.id);
    const t = setTimeout(() => {
      const el = document.getElementById(`ledger-row-${focusRequest.id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const toggleCol = (key) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const visible = (key) => !hiddenCols.has(key);
  const visibleColCount = 3 + COLUMN_DEFS.filter((c) => visible(c.key)).length;

  const updateRow = (id, patch) => {
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const requestDelete = (supplier) => {
    setSuppliers((prev) => prev.filter((s) => s.id !== supplier.id));
    setPendingDelete(supplier);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setPendingDelete(null), 6000);
  };
  const undoDelete = () => {
    if (!pendingDelete) return;
    setSuppliers((prev) => [...prev, pendingDelete]);
    setPendingDelete(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };
  const addRow = () => {
    const id = newId();
    setSuppliers((prev) => [...prev, { id, name: "New Supplier", location: "", category: CATEGORY_OPTIONS[0], annualSpend: 0, onTimeDeliveries: 0, totalPOs: 0, priority: 5, singleSource: false }]);
    setExpandedId(id);
  };

  const filtered = useMemo(() => {
    let list = derived;
    if (tierFilter !== "All") list = list.filter((s) => s.riskTier === tierFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q));
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (av === null || av === undefined) av = -Infinity;
        if (bv === null || bv === undefined) bv = -Infinity;
        if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }
    return list;
  }, [derived, tierFilter, query, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const exportCsv = () => {
    const rows = derived.map((s) => ({
      "Supplier Name": s.name, Location: s.location, Category: s.category || "",
      "Annual Spend": s.annualSpend || 0, Priority: s.priority,
      "Single Source": s.singleSource ? "Y" : "N", "On-Time Deliveries": s.onTimeDeliveries,
      "Total POs": s.totalPOs, "On-Time Rate %": s.onTimeRate !== null ? round2(s.onTimeRate * 100) : "",
      "Delivery Score": s.deliveryScore ?? "", "Dependency Score": s.dependencyScore,
      "Performance Score": s.performanceScore ?? "", "Priority Multiplier": s.multiplier,
      "Risk Score": s.riskScore ?? "", "Risk Tier": s.riskTier,
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "supplier-reliability-matrix.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = (file) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const find = (row, candidates) => {
          const keys = Object.keys(row);
          for (const c of candidates) { const hit = keys.find((k) => k.toLowerCase().trim() === c); if (hit) return row[hit]; }
          for (const c of candidates) { const hit = keys.find((k) => k.toLowerCase().includes(c)); if (hit) return row[hit]; }
          return undefined;
        };
        const imported = res.data.map((row) => {
          const nameV = find(row, ["supplier name", "supplier", "vendor", "name"]) || "Unnamed Supplier";
          const locV = find(row, ["location", "address", "city"]) || "";
          const catV = find(row, ["category", "supply category"]) || CATEGORY_OPTIONS[0];
          const spendV = find(row, ["annual spend", "spend", "spend usd"]) || 0;
          const otdV = find(row, ["on-time deliveries", "on time deliveries", "ontime deliveries", "on-time"]) || 0;
          const posV = find(row, ["total pos", "total po", "pos", "purchase orders"]) || 0;
          const priV = find(row, ["priority", "supplier priority"]) || 5;
          const ssV = find(row, ["single source", "sole source", "single source dependency"]) || "N";
          const singleSource = /^(y|yes|true|1)$/i.test(String(ssV).trim());
          return { id: newId(), name: String(nameV), location: String(locV), category: String(catV), annualSpend: Number(spendV) || 0, onTimeDeliveries: Number(otdV) || 0, totalPOs: Number(posV) || 0, priority: Number(priV) || 5, singleSource };
        }).filter((r) => r.name && r.name !== "Unnamed Supplier" || r.totalPOs > 0);
        if (imported.length) setSuppliers((prev) => [...prev, ...imported]);
      },
    });
  };

  const SortHead = ({ label, sk, align, className }) => (
    <th onClick={() => toggleSort(sk)} className={`th-sort ${className || ""}`} style={{ textAlign: align || "left" }}>
      <span>{label}</span>
      <ArrowUpDown size={11} color={sortKey === sk ? C.navy : C.ink} />
    </th>
  );

  return (
    <div className="stack-lg">
      <div className="ledger-toolbar">
        <div className="search-box">
          <Search size={14} color={C.ink} />
          <input aria-label="Search suppliers" placeholder="Search supplier or location…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="chip-row">
          {TIER_FILTERS.map((t) => (
            <button key={t} className={`chip ${tierFilter === t ? "chip-active" : ""}`} onClick={() => setTierFilter(t)}>
              {t === "All" ? "All" : t.replace(" Risk", "").replace(" Data", "")}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <ColumnsMenu hiddenCols={hiddenCols} toggleCol={toggleCol} />
          <button className="btn-outline" onClick={() => fileRef.current?.click()}><Upload size={13} /> Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files[0] && importCsv(e.target.files[0])} />
          <button className="btn-outline" onClick={exportCsv}><Download size={13} /> Export CSV</button>
          <button className="btn-primary" onClick={addRow}><Plus size={13} /> Add supplier</button>
        </div>
      </div>

      <div className="ledger-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th style={{ width: 24 }} className="sticky-col"></th>
              <SortHead label="Supplier" sk="name" className="sticky-col-2" />
              {visible("location") && <SortHead label="Location" sk="location" />}
              {visible("category") && <th>Category</th>}
              {visible("spend") && <SortHead label="Annual spend" sk="annualSpend" align="right" />}
              {visible("priority") && <th>Priority</th>}
              {visible("singleSource") && <th>Sole source</th>}
              {visible("onTime") && <th style={{ textAlign: "right" }}>On-time</th>}
              {visible("totalPOs") && <th style={{ textAlign: "right" }}>Total POs</th>}
              {visible("onTimeRate") && <SortHead label="On-time rate" sk="onTimeRate" align="right" />}
              {visible("riskScore") && <SortHead label="Risk score" sk="riskScore" align="right" />}
              {visible("riskTier") && <th>Risk tier</th>}
              {visible("trend") && <th>Trend</th>}
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isOpen = expandedId === s.id;
              const m = RISK_META[s.riskTier];
              return (
                <React.Fragment key={s.id}>
                  <tr className={isOpen ? "row-open" : ""} id={`ledger-row-${s.id}`}>
                    <td className="sticky-col">
                      <button className="row-expand" onClick={() => setExpandedId(isOpen ? null : s.id)} aria-label="Show calculation">
                        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </td>
                    <td className="sticky-col-2">
                      <input aria-label={`Supplier name for ${s.name || "new supplier"}`} className="cell-input cell-name" value={s.name} onChange={(e) => updateRow(s.id, { name: e.target.value })} />
                    </td>
                    {visible("location") && (
                      <td>
                        <input aria-label={`Location for ${s.name || "new supplier"}`} className="cell-input" value={s.location} onChange={(e) => updateRow(s.id, { location: e.target.value })} />
                      </td>
                    )}
                    {visible("category") && (
                      <td>
                        <select aria-label={`Category for ${s.name || "new supplier"}`} className="cell-select" value={s.category || CATEGORY_OPTIONS[0]} onChange={(e) => updateRow(s.id, { category: e.target.value })}>
                          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                    )}
                    {visible("spend") && (
                      <td style={{ textAlign: "right" }}>
                        <FieldNumber value={s.annualSpend || 0} onChange={(v) => updateRow(s.id, { annualSpend: v })} width={78} min={0} step={1000} />
                      </td>
                    )}
                    {visible("priority") && (
                      <td>
                        <select aria-label={`Priority for ${s.name || "new supplier"}`} className="cell-select" value={s.priority} onChange={(e) => updateRow(s.id, { priority: Number(e.target.value) })}>

                          {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>P{p}</option>)}
                        </select>
                      </td>
                    )}
                    {visible("singleSource") && (
                      <td>
                        <button className={`toggle-y-n ${s.singleSource ? "on" : ""}`} onClick={() => updateRow(s.id, { singleSource: !s.singleSource })}>
                          {s.singleSource ? "Y" : "N"}
                        </button>
                      </td>
                    )}
                    {visible("onTime") && (
                      <td style={{ textAlign: "right" }}>
                        <FieldNumber value={s.onTimeDeliveries} onChange={(v) => updateRow(s.id, { onTimeDeliveries: v })} width={52} min={0} warn={s.onTimeExceedsTotal} title={s.onTimeExceedsTotal ? "Cannot exceed Total POs. Capped at 100% for scoring until fixed." : undefined} />
                      </td>
                    )}
                    {visible("totalPOs") && (
                      <td style={{ textAlign: "right" }}>
                        <FieldNumber value={s.totalPOs} onChange={(v) => updateRow(s.id, { totalPOs: v })} width={52} min={0} />
                      </td>
                    )}
                    {visible("onTimeRate") && (
                      <td className="data-cell" style={{ textAlign: "right" }}>
                        {s.onTimeRate !== null ? `${Math.round(s.onTimeRate * 100)}%` : "N/A"}
                      </td>
                    )}
                    {visible("riskScore") && (
                      <td className="data-cell" style={{ textAlign: "right", color: m.color, fontWeight: 600 }}>
                        {s.riskScore !== null ? s.riskScore.toFixed(2) : "N/A"}
                      </td>
                    )}
                    {visible("riskTier") && (
                      <td>
                        <Stamp tier={s.riskTier} />
                        {s.belowPeerAvg && (
                          <div className="peer-badge" title={`Category average for ${s.category}: ${s.categoryPeerAvg}, this supplier: ${s.riskScore}`}>
                            {s.peerDeltaPct}% below {s.category} avg
                          </div>
                        )}
                      </td>
                    )}
                    {visible("trend") && (
                      <td className="data-cell"><TrendIndicator supplierId={s.id} riskScore={s.riskScore} history={history} /></td>
                    )}
                    <td>
                      <button className="row-delete" onClick={() => requestDelete(s)} aria-label={`Remove ${s.name}`}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="row-detail">
                      <td colSpan={visibleColCount}>
                        <SupplierDetail s={s} config={config} history={history[s.id] || []} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={visibleColCount} className="empty-note" style={{ padding: "20px 8px" }}>No suppliers match this search and filter combination.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pendingDelete && (
        <div className="undo-toast">
          <span>Removed {pendingDelete.name}.</span>
          <button onClick={undoDelete}>Undo</button>
        </div>
      )}
    </div>
  );
}

function HistorySparkline({ points }) {
  const W = 160, H = 34, PAD = 4;
  const vals = points.map((p) => p.riskScore);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const x = (i) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
  const y = (v) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.riskScore)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline-svg" role="img" aria-label="Risk score history trend">
      <path d={path} fill="none" stroke={C.navy} strokeWidth="1.5" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.riskScore)} r={i === points.length - 1 ? 3 : 2} fill={i === points.length - 1 ? C.navy : C.surface} stroke={C.navy} strokeWidth="1.2" />
      ))}
    </svg>
  );
}

function SupplierDetail({ s, config, history }) {
  const hasPenalty = s.compoundingPenalty > 0;
  const lastEntry = history.length ? history[history.length - 1] : null;
  const delta = lastEntry && s.riskScore !== null ? round2(s.riskScore - lastEntry.riskScore) : null;
  return (
    <div className="detail-chain">
      <div className="detail-left">
        <p className="detail-meta">
          {s.category || "Uncategorized"} &middot; {formatCurrency(s.annualSpend)} annual spend
        </p>
        {s.insufficient ? (
          <p className="detail-text">
            <strong>{s.totalPOs}</strong> purchase order{s.totalPOs === 1 ? "" : "s"} on file, below the
            {" "}<strong>{config.minPOs}-PO</strong> minimum this scorecard requires before trusting a delivery
            rate. Dependency exposure is still assessed below; delivery reliability is not.
          </p>
        ) : (
          <p className="detail-text">
            {s.onTimeDeliveries} of {s.totalPOs} orders on time
            (<strong>{Math.round(s.onTimeRate * 100)}%</strong>) gives Delivery Score <strong>{s.deliveryScore}</strong>.
            {" "}Priority {s.priority}{s.singleSource ? ", sole source" : ", alternate sources available"} gives Dependency Score <strong>{s.dependencyScore}</strong>.
            {hasPenalty && " Both scores sit below the midpoint, so a compounding penalty applies below."}
            {s.onTimeExceedsTotal && <span className="detail-warn"> On-time deliveries exceeds Total POs, the rate above is capped at 100% until the raw numbers in the Ledger are corrected.</span>}
          </p>
        )}
      </div>
      <div className="detail-chain-math">
        <span className="chip-math">Delivery {s.deliveryScore ?? "N/A"} × {config.weights.delivery}</span>
        <span className="op">+</span>
        <span className="chip-math">Dependency {s.dependencyScore} × {config.weights.dependency}</span>
        {hasPenalty && (
          <>
            <span className="op">-</span>
            <span className="chip-math penalty">Compounding {s.compoundingPenalty}</span>
          </>
        )}
        <span className="op">=</span>
        <span className="chip-math strong">Performance {s.performanceScore ?? "N/A"}</span>
        <span className="op">×</span>
        <span className="chip-math">Multiplier {s.multiplier}</span>
        <span className="op">=</span>
        <span className="chip-math strong">Risk {s.riskScore ?? "N/A"}</span>
      </div>
      <Stamp tier={s.riskTier} size="lg" />
      {s.riskScore !== null && (
        <div className="detail-peer">
          {s.categoryPeerCount >= 2 ? (
            <p className="detail-text">
              <strong>{s.category}</strong> category average risk score across {s.categoryPeerCount} scored
              suppliers: <strong>{s.categoryPeerAvg}</strong>. This supplier: <strong>{s.riskScore}</strong>
              {" "}({s.peerDelta >= 0 ? "+" : ""}{s.peerDelta}).
              {s.belowPeerAvg && (
                <> Flagged as a category laggard, <strong>{s.peerDeltaPct}% below</strong> its peers, worth a
                second look even though its absolute tier may not be Critical on its own.</>
              )}
            </p>
          ) : (
            <p className="empty-note">Fewer than 2 scored suppliers in {s.category || "this category"} right now, not enough peers for a meaningful comparison.</p>
          )}
        </div>
      )}
      <div className="detail-history">
        {history.length === 0 ? (
          <p className="empty-note">No snapshots recorded yet. Use Record Snapshot on the Register tab to start a trend.</p>
        ) : (
          <>
            <HistorySparkline points={history} />
            <div className="history-meta">
              <span>{history.length} recorded assessment{history.length > 1 ? "s" : ""}</span>
              <span>Last: {new Date(lastEntry.ts).toLocaleDateString()} at {lastEntry.riskScore.toFixed(2)}</span>
              {delta !== null && (
                <span className={delta > 0.05 ? "trend-up" : delta < -0.05 ? "trend-down" : "trend-flat"}>
                  {delta > 0.05 ? <TrendingUp size={13} /> : delta < -0.05 ? <TrendingDown size={13} /> : <Minus size={13} />}
                  {" "}{delta} since last recorded
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* =====================================================================
   METHODOLOGY VIEW
===================================================================== */
const REPORT_PDF_URL = "/supplier-reliability-matrix-development-report.pdf";

function MethodologyView({ config }) {
  return (
    <div className="stack-lg doc">
      <section className="panel">
        <h3>Project development report</h3>
        <p>
          The full project development document — origin, objectives, scoring methodology,
          architecture, design evolution, testing approach, and known limitations — is available as
          a PDF.
        </p>
        <a
          className="report-link"
          href={REPORT_PDF_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <FileText size={15} /> Open the development report (PDF, 10 pages)
          <ArrowUpRight size={13} />
        </a>
        <p className="note-line">
          Prepared by Shubham Gambhire, August 2026. Opens in a new tab. Prototype status; not
          affiliated with, and containing no data from, any employer.
        </p>
      </section>

      <section className="panel">


        <h3>Why six fields, not sixteen</h3>
        <p>
          A textbook supplier-scoring model reaches for lead time variance, quality rejection
          rate, invoice accuracy, responsiveness, financial health, and more. In practice, most
          procurement teams don't keep all of that clean, and a model that needs data nobody
          maintains doesn't get used. This scorecard scores only what a standard PO ledger and
          vendor master file already contain reliably: delivery counts, a priority tier set by
          the category manager, and whether a supplier is sole-sourced. Everything else is a
          reasonable next iteration once the underlying data exists, not a reason to leave the
          tool unbuilt in the meantime.
        </p>
      </section>

      <section className="panel">
        <h3>Why not AHP, DEMATEL, or TOPSIS</h3>
        <p>
          Multi-criteria methods like AHP, DEMATEL, and TOPSIS are built for a different decision:
          choosing among candidate suppliers, or weighting many criteria, through a structured,
          expert-driven process. AHP derives weights from pairwise comparisons made by
          decision-makers, with a consistency check built in. DEMATEL goes further and maps causal
          influence between criteria, for example whether quality drives cost or the reverse,
          through an expert-scored influence matrix. TOPSIS and VIKOR rank candidates by distance
          from an ideal and an anti-ideal solution across weighted criteria. All three need a panel
          to sit down and fill out comparison matrices. That is not incidental overhead, it is the
          mechanism itself, and it makes these methods periodic and deliberative by design, suited
          to an annual sourcing review or a new-vendor RFP, not something that re-runs automatically
          each week off live PO data.
        </p>
        <p>
          This scorecard solves a different problem: ongoing, automated risk monitoring of
          suppliers already on file, using transactional data and no panel. That is why a
          transparent weighted model is the right tool here rather than a shortcut around a better
          one. Three reasons this holds up:
        </p>
        <ul className="doc-list">
          <li>It runs unattended off data that already exists. AHP and DEMATEL cannot; they need a
          human panel every time they run.</li>
          <li>With two real criteria, the machinery DEMATEL uses to untangle interdependencies
          across many criteria has little to work with. A two-criterion AHP would land close to the
          same weighted-sum result.</li>
          <li>The Insufficient Data guard has no equivalent in AHP or TOPSIS. Those methods assume
          every candidate has a trustworthy score on every criterion; they have no built-in concept
          of a criterion that is too thin to trust, which is precisely the failure mode messy,
          real-world data creates.</li>
        </ul>
        <p>
          The honest limitation on the other side: the 0.65 / 0.35 weighting came from a discussion
          with the procurement team, not a validated multi-stakeholder process with a consistency
          check the way AHP would produce. And a plain weighted sum treats Delivery Score and
          Dependency Score as unrelated inputs, when in practice a supplier that is weak on both is
          worse than the sum of its parts. The compounding penalty in Step 3 below exists to close
          that specific gap without requiring a full DEMATEL exercise.
        </p>
      </section>

      <section className="panel">
        <h3>Step 1. Delivery Score</h3>
        <p>On-Time Rate = On-Time Deliveries divided by Total POs, bucketed:</p>
        <table className="ref-table">
          <thead><tr><th>On-time rate</th><th>Score</th></tr></thead>
          <tbody>
            {config.deliveryBuckets.slice().sort((a, b) => b.min - a.min).map((b) => (
              <tr key={b.score}><td>{b.label}</td><td>{b.score}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="note-line">
          Suppliers with fewer than <strong>{config.minPOs}</strong> total POs are marked
          <strong> Insufficient Data</strong> instead. A 1-of-1 delivery record is not a rate.
        </p>
      </section>

      <section className="panel">
        <h3>Step 2. Dependency Score</h3>
        <p>Combines sole-source status with the supplier's operational priority tier:</p>
        <table className="ref-table">
          <thead><tr><th>Condition</th><th>Score</th></tr></thead>
          <tbody>
            <tr><td>Not sole-sourced (alternates exist)</td><td>5</td></tr>
            <tr><td>Sole-sourced, Priority 4-5</td><td>3</td></tr>
            <tr><td>Sole-sourced, Priority 3</td><td>2</td></tr>
            <tr><td>Sole-sourced, Priority 1-2 (most critical)</td><td>1</td></tr>
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Step 3. Performance Score and the compounding penalty</h3>
        <p className="formula">
          Performance = ({config.weights.delivery} × Delivery Score) + ({config.weights.dependency} × Dependency Score) - Compounding Penalty
        </p>
        <p className="note-line">Weighting set after discussion with the procurement team: delivery reliability carries roughly twice the weight of sourcing structure.</p>
        <p>
          Delivery Score and Dependency Score are measured independently, but the risk they
          represent is not independent. A sole-sourced supplier that is also missing delivery
          dates is worse than the sum of those two problems, because there is no fallback to
          absorb the miss. The compounding penalty only activates when both scores sit below the
          midpoint of the 1-5 scale, and scales with how far below both fall, so a supplier that is
          weak on just one dimension is not double-punished:
        </p>
        <p className="formula">
          Compounding Penalty = {config.compoundingWeight} × max(0, 3 - Delivery Score) × max(0, 3 - Dependency Score)
        </p>
        <p className="note-line">
          Set the compounding weight to 0 in Settings to fall back to a plain weighted sum. A
          fuller fix would model interdependency directly, the way DEMATEL does, but that requires
          an expert-scored influence matrix this scorecard is deliberately built to run without.
          This penalty is a lightweight, data-only proxy for the same idea: it does not tell you
          which criterion causes the other, only that the combination is worse than either alone.
        </p>
      </section>

      <section className="panel">
        <h3>Step 4. Priority Multiplier and Risk Score</h3>
        <table className="ref-table">
          <thead><tr><th>Priority tier</th><th>Multiplier</th></tr></thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((p) => (
              <tr key={p}><td>P{p}{p === 1 ? " (most critical)" : ""}</td><td>{config.multipliers[p]}x</td></tr>
            ))}
          </tbody>
        </table>
        <p className="formula">Risk Score = Performance Score × Priority Multiplier</p>
      </section>

      <section className="panel">
        <h3>Step 5. Risk Tier</h3>
        <table className="ref-table">
          <thead><tr><th>Risk score</th><th>Tier</th></tr></thead>
          <tbody>
            <tr><td>≥ {config.thresholds.low}</td><td><Stamp tier="Low Risk" /></td></tr>
            <tr><td>{config.thresholds.medium} to {config.thresholds.low}</td><td><Stamp tier="Medium Risk" /></td></tr>
            <tr><td>{config.thresholds.high} to {config.thresholds.medium}</td><td><Stamp tier="High Risk" /></td></tr>
            <tr><td>&lt; {config.thresholds.high}</td><td><Stamp tier="Critical Risk" /></td></tr>
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Step 6. Peer-relative comparison, a secondary signal</h3>
        <p>
          Steps 1 through 5 use one fixed bar for every supplier, which is deliberate: leadership
          wants a consistent definition of Critical across the whole supplier base, not one that
          quietly shifts depending on category. But a fixed bar also flattens real differences.
          A sole-sourced specialty-components supplier and a commodity office-supplies vendor
          are not playing the same game, and comparing both only to the same absolute line misses
          that context.
        </p>
        <p>
          Peer comparison adds a second, smaller signal without replacing the first. For each
          category, it averages the Risk Score of every scored supplier in that category, then
          flags a supplier as a <strong>category laggard</strong> when its own score sits more than
          the configured gap below that average, and at least one other scored peer exists to
          compare against:
        </p>
        <p className="formula">
          Category Laggard = Risk Score &lt; (Category Average Risk Score - {config.peerGapThreshold})
        </p>
        <p className="note-line">
          Shown as a small badge under the Risk Tier stamp in the Ledger, spelled out in full in
          each supplier's detail view, and tunable in Settings.
        </p>
        <p>
          The honest limitation, and why this stays secondary rather than becoming the primary
          measure: comparing suppliers only to their own category can hide category-wide risk.
          If every supplier in a category is structurally risky, say, every specialty-parts
          supplier is sole-sourced, they can all look average next to each other and nobody gets
          flagged, even though the category itself carries real exposure. The absolute Risk Tier
          from Step 5 is what catches that; peer comparison only ever adds context on top of it,
          it never overrides it.
        </p>
      </section>
    </div>
  );
}

/* =====================================================================
   SETTINGS VIEW
===================================================================== */
function SettingsView({ config, setConfig, derived, storageStatus, saveState, onResetAll }) {
  const [resetArmed, setResetArmed] = useState(false);
  const set = (patch) => setConfig((prev) => ({ ...prev, ...patch }));
  const setWeight = (key, v) => set({ weights: { ...config.weights, [key]: v } });
  const setMultiplier = (p, v) => set({ multipliers: { ...config.multipliers, [p]: v } });
  const setThreshold = (k, v) => set({ thresholds: { ...config.thresholds, [k]: v } });
  const setBucket = (idx, v) => {
    const next = config.deliveryBuckets.map((b, i) => (i === idx ? { ...b, min: v / 100 } : b));
    set({ deliveryBuckets: next });
  };
  const reset = () => setConfig({
    weights: DEFAULT_WEIGHTS, multipliers: DEFAULT_MULTIPLIERS, thresholds: DEFAULT_THRESHOLDS,
    minPOs: DEFAULT_MIN_POS, deliveryBuckets: DEFAULT_DELIVERY_BUCKETS, compoundingWeight: DEFAULT_COMPOUNDING_WEIGHT,
    peerGapThreshold: DEFAULT_PEER_GAP_THRESHOLD,
  });

  const handleResetClick = () => {
    if (!resetArmed) { setResetArmed(true); setTimeout(() => setResetArmed(false), 4000); return; }
    setResetArmed(false);
    onResetAll();
  };

  const weightSum = round2(config.weights.delivery + config.weights.dependency);
  const counts = { "Low Risk": 0, "Medium Risk": 0, "High Risk": 0, "Critical Risk": 0, "Insufficient Data": 0 };
  derived.forEach((s) => counts[s.riskTier]++);

  const statusLabel = storageStatus === "unavailable"
    ? "Not saved: browser storage unavailable in this session"
    : saveState === "saving" ? "Saving..."
    : saveState === "error" ? "Save failed, changes are only in this session"
    : "All changes save automatically to this browser";

  return (
    <div className="stack-lg">
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px", letterSpacing: "-0.01em" }}>Settings</h2>
      <section className="panel">
        <h3>Data</h3>

        <div className="settings-row">
          <label className="status-label">
            {saveState === "saving" ? <Loader2 size={13} className="spin" /> : storageStatus === "unavailable" ? <AlertCircle size={13} /> : <Check size={13} />}
            {statusLabel}
          </label>
        </div>
        <div className="settings-row">
          <label className="data-privacy-note">Stored in this browser only. Nothing is sent anywhere else.</label>
        </div>
        <button className={`btn-outline reset-all-btn ${resetArmed ? "armed" : ""}`} onClick={handleResetClick}>
          <Trash2 size={13} /> {resetArmed ? "Click again to confirm" : "Reset all data"}
        </button>
      </section>

      <section className="panel">
        <div className="panel-head"><h3>Performance weighting</h3><button className="btn-outline" onClick={reset}><RotateCcw size={12} /> Reset to defaults</button></div>
        <div className="settings-row">
          <label>Delivery Score weight</label>
          <FieldNumber value={config.weights.delivery} step={0.05} min={0} max={1} onChange={(v) => setWeight("delivery", v)} width={70} />
        </div>
        <div className="settings-row">
          <label>Dependency Score weight</label>
          <FieldNumber value={config.weights.dependency} step={0.05} min={0} max={1} onChange={(v) => setWeight("dependency", v)} width={70} />
        </div>
        {weightSum !== 1 && <p className="warn-line">Weights sum to {weightSum}, not 1.00. Performance Score will run above or below its usual 1-5 range.</p>}
      </section>

      <section className="panel">
        <h3>Compounding penalty <InfoTip text="Applies extra weight when Delivery Score and Dependency Score are both below the midpoint, so the two aren't treated as fully independent. Set to 0 for a plain weighted sum." /></h3>
        <div className="settings-row">
          <label>Compounding weight</label>
          <FieldNumber value={config.compoundingWeight} step={0.05} min={0} max={1} onChange={(v) => set({ compoundingWeight: v })} width={70} />
        </div>
      </section>

      <section className="panel">
        <h3>Peer comparison <InfoTip text="A secondary signal alongside the absolute Risk Tier, never in place of it. Flags a supplier as a category laggard when it sits this many points below its category's average, with at least one other scored peer to compare against." /></h3>
        <div className="settings-row">
          <label>Flag when below category average by</label>
          <FieldNumber value={config.peerGapThreshold} step={0.1} min={0} max={3} onChange={(v) => set({ peerGapThreshold: v })} width={70} />
        </div>
      </section>

      <section className="panel">
        <h3>Delivery score thresholds</h3>
        {config.deliveryBuckets.map((b, i) => (
          <div className="settings-row" key={b.score}>
            <label>Score {b.score} at on-time rate ≥</label>
            <FieldNumber value={Math.round(b.min * 100)} onChange={(v) => setBucket(i, v)} width={64} min={0} max={100} />
            <span className="unit">%</span>
          </div>
        ))}
      </section>

      <section className="panel">
        <h3>Priority multipliers</h3>
        {[1, 2, 3, 4, 5].map((p) => (
          <div className="settings-row" key={p}>
            <label>Priority {p}</label>
            <FieldNumber value={config.multipliers[p]} step={0.1} min={0} onChange={(v) => setMultiplier(p, v)} width={64} />
            <span className="unit">x</span>
          </div>
        ))}
      </section>

      <section className="panel">
        <h3>Risk tier thresholds</h3>
        <div className="settings-row"><label>Low Risk at or above</label><FieldNumber value={config.thresholds.low} step={0.05} onChange={(v) => setThreshold("low", v)} width={64} /></div>
        <div className="settings-row"><label>Medium Risk at or above</label><FieldNumber value={config.thresholds.medium} step={0.05} onChange={(v) => setThreshold("medium", v)} width={64} /></div>
        <div className="settings-row"><label>High Risk at or above</label><FieldNumber value={config.thresholds.high} step={0.05} onChange={(v) => setThreshold("high", v)} width={64} /></div>
      </section>

      <section className="panel">
        <h3>Minimum order history</h3>
        <div className="settings-row">
          <label>Minimum Total POs to score</label>
          <FieldNumber value={config.minPOs} min={1} onChange={(v) => set({ minPOs: v })} width={64} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h3>Live preview</h3></div>
        <div className="tally">
          {Object.entries(counts).map(([tier, count]) => {
            const m = RISK_META[tier];
            const pct = derived.length ? (count / derived.length) * 100 : 0;
            return (
              <div key={tier} className="tally-row">
                <span className="tally-label" style={{ color: m.color }}>{tier}</span>
                <div className="tally-track"><div className="tally-fill" style={{ width: `${pct}%`, background: m.color }} /></div>
                <span className="tally-count">{count}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* =====================================================================
   APP SHELL
===================================================================== */
const TABS = [
  { key: "register", label: "Register", icon: LayoutGrid },
  { key: "ledger", label: "Supplier Ledger", icon: ListChecks },
  { key: "settings", label: "Settings", icon: Settings2 },
];

/* Simple browser-storage adapter (localStorage-backed). */
const localStore = {
  async get(key) {
    const value = window.localStorage.getItem(key);
    return value === null ? null : { value };
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
  },
  async remove(key) {
    window.localStorage.removeItem(key);
  },
};

export default function App() {
  const STORAGE_KEY = "supplier-scorecard:main";
  const hasStorage = typeof window !== "undefined";

  const [suppliers, setSuppliers] = useState(SEED_SUPPLIERS);
  const [tab, setTab] = useState("register");
  const [config, setConfig] = useState({
    weights: DEFAULT_WEIGHTS, multipliers: DEFAULT_MULTIPLIERS, thresholds: DEFAULT_THRESHOLDS,
    minPOs: DEFAULT_MIN_POS, deliveryBuckets: DEFAULT_DELIVERY_BUCKETS, compoundingWeight: DEFAULT_COMPOUNDING_WEIGHT,
    peerGapThreshold: DEFAULT_PEER_GAP_THRESHOLD,
  });
  const [history, setHistory] = useState({});
  const [focusRequest, setFocusRequest] = useState(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [storageStatus, setStorageStatus] = useState("loading");
  const [saveState, setSaveState] = useState("idle");
  const saveTimer = useRef(null);
  const loadedOnce = useRef(false);

  // Load any previously saved session on first mount. Seed data stays
  // on screen the whole time; this only swaps it out if a save exists.
  useEffect(() => {
    if (!hasStorage) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await localStore.get(STORAGE_KEY);
        if (!cancelled && res && res.value) {
          const parsed = JSON.parse(res.value);
          if (Array.isArray(parsed.suppliers) && parsed.suppliers.length) setSuppliers(parsed.suppliers);
          if (parsed.config) setConfig((prev) => ({ ...prev, ...parsed.config }));
          if (parsed.history) setHistory(parsed.history);
        }
      } catch (e) {
        // No saved session yet, or storage briefly unavailable: keep the seed defaults on screen.
      } finally {
        if (!cancelled) { loadedOnce.current = true; setStorageStatus("ready"); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave. Waits until the initial load finishes so a
  // fresh page load never overwrites a real saved session with defaults.
  useEffect(() => {
    if (!hasStorage || storageStatus !== "ready") return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await localStore.set(STORAGE_KEY, JSON.stringify({ suppliers, config, history }));
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
      }
    }, 700);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers, config, history, storageStatus]);

  const resetAllData = async () => {
    if (hasStorage) {
      try { await localStore.remove(STORAGE_KEY); } catch (e) { /* nothing saved yet */ }
    }
    setSuppliers(SEED_SUPPLIERS);
    setConfig({
      weights: DEFAULT_WEIGHTS, multipliers: DEFAULT_MULTIPLIERS, thresholds: DEFAULT_THRESHOLDS,
      minPOs: DEFAULT_MIN_POS, deliveryBuckets: DEFAULT_DELIVERY_BUCKETS, compoundingWeight: DEFAULT_COMPOUNDING_WEIGHT,
      peerGapThreshold: DEFAULT_PEER_GAP_THRESHOLD,
    });
    setHistory({});
  };

  const derived = useMemo(() => {
    const base = suppliers.map((s) => computeSupplier(s, config));
    return attachPeerComparison(base, config.peerGapThreshold ?? DEFAULT_PEER_GAP_THRESHOLD);
  }, [suppliers, config]);

  const goToSupplier = (id) => {
    setTab("ledger");
    setFocusRequest({ id, nonce: Date.now() });
  };

  const recordSnapshot = () => {
    const ts = new Date().toISOString();
    setHistory((prev) => {
      const next = { ...prev };
      derived.forEach((s) => {
        if (s.riskScore === null) return;
        const entry = { ts, riskScore: s.riskScore, riskTier: s.riskTier, performanceScore: s.performanceScore };
        next[s.id] = [...(prev[s.id] || []), entry];
      });
      return next;
    });
  };
  const lastSnapshotAt = useMemo(() => {
    const all = Object.values(history).flat();
    if (!all.length) return null;
    return all.reduce((latest, e) => (e.ts > latest ? e.ts : latest), all[0].ts);
  }, [history]);

  return (
    <div className="ledger-app">
      <style>{`
        .ledger-app * { box-sizing: border-box; }
        .ledger-app {
          background: ${C.paper};
          min-height: 100vh; color: ${C.ink}; font-family: ${F_BODY};
        }
        .ledger-app ::-webkit-scrollbar { width: 8px; height: 8px; }
        .ledger-app ::-webkit-scrollbar-thumb { background: ${C.paperLineStrong}; border-radius: 4px; }
        .ledger-app button, .ledger-app input, .ledger-app select { font-family: ${F_BODY}; }
        .ledger-app *:focus-visible { outline: 2px solid ${C.navy}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .ledger-app * { transition: none !important; animation: none !important; } }
        .spin { animation: spin 0.9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .masthead { max-width: 1080px; margin: 0 auto; padding: 36px 24px 0; }
        .masthead h1 { font-family: ${F_DISPLAY}; font-size: 34px; font-weight: 600; margin: 6px 0 6px; letter-spacing: -0.01em; }
        .masthead .sub { font-family: ${F_BODY}; color: ${C.inkMuted}; font-size: 14px; max-width: 620px; line-height: 1.55; margin: 0 0 16px; }
        .meta-row { display: flex; gap: 18px; flex-wrap: wrap; font-family: ${F_DATA}; font-size: 11px; color: ${C.inkMuted}; border-top: 1px solid ${C.paperLineStrong}; border-bottom: 1px solid ${C.paperLineStrong}; padding: 10px 0; margin-bottom: 0; }
        .meta-row b { color: ${C.ink}; }

        .tabbar { max-width: 1080px; margin: 0 auto; padding: 0 24px; display: flex; gap: 2px; overflow-x: auto; }
        .tab-btn {
          display: flex; align-items: center; gap: 7px; padding: 11px 16px; border: 1px solid ${C.paperLineStrong};
          border-bottom: none; background: ${C.surfaceAlt}; color: ${C.inkMuted}; font-size: 13px; font-weight: 500;
          border-radius: 6px 6px 0 0; cursor: pointer; white-space: nowrap; margin-top: 8px; position: relative; top: 1px;
        }
        .tab-btn.active { background: ${C.surface}; color: ${C.navy}; border-color: ${C.paperLineStrong}; border-bottom: 1px solid ${C.surface}; font-weight: 600; }

        .content-wrap { max-width: 1080px; margin: 0 auto; padding: 22px 24px 60px; border-top: 1px solid ${C.paperLineStrong}; background: ${C.surface}; min-height: 60vh; }
        .app-footer { max-width: 1080px; margin: 0 auto; padding: 18px 24px 32px; font-size: 11px; font-family: ${F_DATA}; color: ${C.ink}; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-top: 1px solid ${C.paperLineStrong}; }
        .footer-linkedin { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; color: ${C.navy}; text-decoration: none; font-weight: 600; }
        .footer-linkedin:hover { text-decoration: underline; }

        .stack-lg { display: flex; flex-direction: column; gap: 22px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
        @media (max-width: 980px) { .grid-2 { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } }
        .laggard-category { font-size: 10.5px; color: ${C.ink}; opacity: 0.6; font-family: ${F_DATA}; }

        .kpi-hero-row { display: flex; align-items: baseline; gap: 28px; flex-wrap: wrap; padding-bottom: 16px; border-bottom: 1px solid ${C.paperLineStrong}; }
        .hero-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.ink}; opacity: 0.65; margin-bottom: 4px; }
        .hero-stat-value { font-family: ${F_DATA}; font-size: 40px; font-weight: 700; line-height: 1; }
        .hero-stat-sub { font-size: 11.5px; color: ${C.ink}; opacity: 0.6; margin-top: 4px; }
        .stat-strip { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; font-size: 12.5px; align-self: flex-end; padding-bottom: 4px; }
        .stat-strip-item { display: inline-flex; align-items: baseline; gap: 5px; }
        .stat-strip-sep { color: ${C.ink}; opacity: 0.35; margin-right: 8px; }
        .stat-strip-label { color: ${C.ink}; opacity: 0.65; }
        .stat-strip-value { font-family: ${F_DATA}; font-weight: 700; color: ${C.ink}; }

        .panel { border: 1px solid ${C.paperLineStrong}; border-radius: 4px; padding: 18px 20px; background: ${C.surface}; }
        .panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
        .panel h3 { font-family: ${F_DISPLAY}; font-size: 17px; font-weight: 600; margin: 0 0 10px; display: flex; align-items: center; gap: 6px; }
        .panel-head h3 { margin: 0; }
        .panel-hint { font-size: 11.5px; color: ${C.inkFaint}; font-family: ${F_DATA}; }
        .panel p { font-size: 13.5px; line-height: 1.6; color: ${C.ink}; margin: 0 0 8px; }

        .matrix-section { padding: 4px 0 8px; }
        .matrix-section-head { margin-bottom: 14px; }
        .matrix-section-head h2 { font-family: ${F_DISPLAY}; font-size: 22px; font-weight: 600; margin: 0 0 2px; }
        .matrix-section .panel-hint { display: block; }

        .matrix-svg { width: 100%; height: auto; }
        .matrix-point { cursor: pointer; }
        .matrix-point:hover circle { opacity: 1; stroke-width: 2.5; }
        .matrix-point:focus-visible circle { outline: 2px solid ${C.navy}; outline-offset: 2px; }
        .matrix-note { font-size: 11.5px; color: ${C.ink}; font-style: italic; font-family: ${F_DISPLAY}; margin-top: 6px; }
        .matrix-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; align-items: center; }
        .legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; font-family: ${F_DATA}; color: ${C.ink}; }
        .legend-swatch { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
        .legend-note { color: ${C.ink}; opacity: 0.65; font-style: italic; font-family: ${F_DISPLAY}; }
        .colorby-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
        .colorby-label { font-size: 11.5px; font-weight: 600; color: ${C.ink}; }
        .snapshot-btn { margin-left: auto; }
        .snapshot-note { font-size: 11px; font-family: ${F_DATA}; color: ${C.ink}; opacity: 0.7; }

        .tally { display: flex; flex-direction: column; gap: 10px; }
        .tally-row { display: grid; grid-template-columns: 110px 1fr 28px; align-items: center; gap: 10px; }
        .tally-label { font-size: 12px; font-weight: 600; }
        .tally-track { height: 8px; background: ${C.paper}; border: 1px solid ${C.paperLineStrong}; border-radius: 4px; overflow: hidden; }
        .tally-fill { height: 100%; }
        .tally-count { font-family: ${F_DATA}; font-size: 12px; text-align: right; color: ${C.inkMuted}; }

        .watchlist { display: flex; flex-direction: column; }
        .watchlist-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid ${C.paperLine}; cursor: pointer; }
        .watchlist-row:hover { background: ${C.surfaceAlt}; }
        .watchlist-name { display: flex; align-items: center; gap: 7px; font-size: 12.5px; }
        .watchlist-score { font-family: ${F_DATA}; font-size: 13px; font-weight: 600; }
        .empty-note { color: ${C.inkFaint}; font-size: 13px; font-style: italic; }

        .info-tip { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; border: 1px solid ${C.ink}; font-size: 10px; font-family: ${F_DATA}; font-weight: 600; cursor: help; opacity: 0.55; }
        .info-tip:hover, .info-tip:focus { opacity: 1; outline: none; }
        .info-tip-bubble { visibility: hidden; opacity: 0; position: absolute; bottom: 130%; left: 0; width: 240px; background: ${C.ink}; color: ${C.surface}; font-family: ${F_BODY}; font-weight: 400; font-size: 11.5px; line-height: 1.55; padding: 9px 11px; border-radius: 4px; transition: opacity 0.15s ease; z-index: 30; pointer-events: none; }
        .info-tip:hover .info-tip-bubble, .info-tip:focus .info-tip-bubble { visibility: visible; opacity: 1; }
        .data-privacy-note { font-size: 11.5px; opacity: 0.7; }

        .methodology-trigger { margin-left: auto; display: flex; align-items: center; gap: 6px; padding: 8px 10px; border: none; background: transparent; color: ${C.ink}; opacity: 0.7; font-size: 12.5px; font-family: ${F_BODY}; cursor: pointer; white-space: nowrap; }
        .methodology-trigger:hover { opacity: 1; text-decoration: underline; }
        .github-link { align-self: center; margin-left: 10px; display: inline-flex; align-items: center; gap: 5px; padding: 8px 10px; color: ${C.ink}; opacity: 0.7; font-size: 12.5px; text-decoration: none; white-space: nowrap; }
        .github-link:hover { opacity: 1; text-decoration: underline; }
        .report-link { display: inline-flex; align-items: center; gap: 8px; margin: 4px 0 10px; padding: 10px 14px; border: 1px solid ${C.navy}; border-radius: 4px; background: ${C.surfaceAlt}; color: ${C.navy}; font-size: 13px; font-weight: 600; text-decoration: none; }
        .report-link:hover { background: ${C.navy}; color: ${C.surface}; }



        .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; z-index: 100; overflow-y: auto; }
        .modal-panel { background: ${C.surface}; border-radius: 6px; max-width: 900px; width: 100%; max-height: calc(100vh - 80px); display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
        .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid ${C.paperLineStrong}; flex-shrink: 0; }
        .modal-head h2 { font-family: ${F_DISPLAY}; font-size: 19px; font-weight: 600; margin: 0; }
        .modal-close { border: none; background: transparent; cursor: pointer; color: ${C.ink}; padding: 5px; border-radius: 4px; display: flex; }
        .modal-close:hover { background: ${C.surfaceAlt}; }
        .modal-body { padding: 20px 22px; overflow-y: auto; background: ${C.paper}; }

        .stamp { display: inline-block; border: 1.5px solid; border-radius: 3px; font-family: ${F_DATA}; font-weight: 700; letter-spacing: 0.08em; transform: rotate(-2deg); background: ${C.surface}; }

        .ledger-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
        .search-box { display: flex; align-items: center; gap: 8px; border: 1px solid ${C.paperLineStrong}; border-radius: 4px; padding: 7px 10px; background: ${C.surfaceAlt}; min-width: 220px; }
        .search-box input { border: none; background: transparent; outline: none; font-size: 12.5px; width: 100%; color: ${C.ink}; }
        .chip-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .chip { border: 1px solid ${C.paperLineStrong}; background: ${C.surfaceAlt}; color: ${C.inkMuted}; font-size: 11.5px; padding: 5px 11px; border-radius: 999px; cursor: pointer; }
        .chip-active { background: ${C.navy}; color: white; border-color: ${C.navy}; }
        .toolbar-actions { display: flex; gap: 8px; align-items: center; }
        .btn-outline, .btn-primary { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 7px 12px; border-radius: 4px; cursor: pointer; }
        .btn-outline { background: ${C.surface}; border: 1px solid ${C.paperLineStrong}; color: ${C.ink}; }
        .btn-outline:hover { border-color: ${C.navy}; color: ${C.navy}; }
        .btn-primary { background: ${C.navy}; border: 1px solid ${C.navy}; color: white; }
        .btn-primary:hover { background: ${C.navySoft}; }

        .columns-menu { position: relative; }
        .columns-panel { position: absolute; top: calc(100% + 6px); right: 0; background: ${C.surface}; border: 1px solid ${C.paperLineStrong}; border-radius: 5px; padding: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); z-index: 20; min-width: 170px; }
        .columns-panel-item { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 5px 4px; cursor: pointer; white-space: nowrap; }
        .columns-panel-item:hover { background: ${C.surfaceAlt}; }

        .ledger-scroll { overflow-x: auto; border: 1px solid ${C.paperLineStrong}; border-radius: 4px; position: relative; }
        .ledger-table { width: 100%; border-collapse: collapse; min-width: 980px; font-size: 12.5px; }
        .ledger-table thead th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.inkMuted}; background: ${C.surfaceAlt}; padding: 9px 8px; border-bottom: 1px solid ${C.paperLineStrong}; white-space: nowrap; }
        .th-sort { cursor: pointer; display: table-cell; }
        .th-sort span { margin-right: 4px; }
        .ledger-table tbody tr:not(.row-detail) { border-top: 1px solid ${C.paperLine}; }
        .ledger-table td { padding: 5px 8px; vertical-align: middle; }
        .row-open { background: ${C.surfaceAlt}; }
        .data-cell { font-family: ${F_DATA}; }
        .sticky-col { position: sticky; left: 0; z-index: 3; background: ${C.surfaceAlt}; }
        .sticky-col-2 { position: sticky; left: 24px; z-index: 3; background: ${C.surfaceAlt}; box-shadow: 2px 0 4px -2px rgba(0,0,0,0.18); }
        .ledger-table tbody td.sticky-col, .ledger-table tbody td.sticky-col-2 { background: ${C.surface}; }
        .ledger-table tbody tr.row-open td.sticky-col, .ledger-table tbody tr.row-open td.sticky-col-2 { background: ${C.surfaceAlt}; }
        .cell-input { border: 1px solid transparent; background: transparent; font-size: 12.5px; padding: 4px 5px; border-radius: 3px; width: 100%; color: ${C.ink}; }
        .cell-input:hover, .cell-input:focus { border-color: ${C.paperLineStrong}; background: ${C.surface}; }
        .cell-name { font-weight: 600; min-width: 170px; }
        .cell-select { border: 1px solid ${C.paperLineStrong}; background: ${C.surface}; font-family: ${F_DATA}; font-size: 12px; border-radius: 3px; padding: 3px 4px; }
        .field-num { border: 1px solid ${C.paperLineStrong}; background: ${C.surface}; font-family: ${F_DATA}; font-size: 12.5px; padding: 4px 6px; border-radius: 3px; text-align: right; }
        .field-num-warn { border-color: ${C.critical}; background: ${C.criticalDim}; }
        .toggle-y-n { width: 26px; height: 22px; border-radius: 3px; border: 1px solid ${C.paperLineStrong}; background: ${C.surface}; font-family: ${F_DATA}; font-size: 11px; font-weight: 700; cursor: pointer; color: ${C.inkMuted}; }
        .toggle-y-n.on { background: ${C.brassDim}; border-color: ${C.brass}; color: ${C.brass}; }
        .peer-badge { font-family: ${F_DATA}; font-size: 10px; color: ${C.brass}; background: ${C.brassDim}; border-radius: 3px; padding: 1px 5px; margin-top: 4px; display: inline-block; white-space: nowrap; }
        .row-expand, .row-delete { border: none; background: transparent; cursor: pointer; color: ${C.inkFaint}; padding: 4px; border-radius: 3px; display: flex; }
        .row-expand:hover, .row-delete:hover { background: ${C.paper}; color: ${C.ink}; }

        .undo-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: ${C.ink}; color: ${C.surface}; font-family: ${F_BODY}; font-size: 13px; padding: 10px 16px; border-radius: 6px; display: flex; align-items: center; gap: 14px; z-index: 50; box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
        .undo-toast button { background: none; border: none; color: ${C.surface}; text-decoration: underline; font-weight: 600; font-size: 13px; cursor: pointer; padding: 0; font-family: ${F_BODY}; }

        .row-detail td { background: ${C.surfaceAlt}; border-bottom: 1px solid ${C.paperLineStrong}; padding: 14px 18px; }
        .detail-chain { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
        .detail-left { flex: 1; min-width: 260px; }
        .detail-text { font-size: 12.5px; line-height: 1.6; margin: 0; }
        .detail-warn { color: ${C.critical}; font-weight: 600; }
        .detail-chain-math { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .chip-math { font-family: ${F_DATA}; font-size: 11px; background: ${C.surface}; border: 1px solid ${C.paperLineStrong}; padding: 4px 8px; border-radius: 3px; white-space: nowrap; }
        .chip-math.strong { font-weight: 700; border-color: ${C.navy}; color: ${C.navy}; }
        .chip-math.penalty { border-color: ${C.high}; color: ${C.high}; }
        .op { color: ${C.ink}; font-family: ${F_DATA}; font-size: 12px; }
        .detail-meta { font-size: 12px; font-family: ${F_DATA}; color: ${C.ink}; opacity: 0.75; margin: 0 0 6px; }
        .detail-peer { width: 100%; border-top: 1px solid ${C.paperLine}; margin-top: 4px; padding-top: 10px; }
        .detail-history { width: 100%; border-top: 1px solid ${C.paperLine}; margin-top: 4px; padding-top: 10px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .sparkline-svg { width: 160px; height: 34px; flex-shrink: 0; }
        .history-meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; font-family: ${F_DATA}; color: ${C.ink}; align-items: center; }
        .trend-up, .trend-down, .trend-flat, .trend-empty { display: inline-flex; align-items: center; gap: 3px; font-family: ${F_DATA}; font-size: 11.5px; }
        .trend-up { color: ${C.low}; }
        .trend-down { color: ${C.critical}; }
        .trend-flat, .trend-empty { color: ${C.ink}; opacity: 0.6; }

        .doc .panel h3 { border-bottom: 1px solid ${C.paperLine}; padding-bottom: 8px; }
        .doc-list { padding-left: 20px; margin: 8px 0; }
        .doc-list li { font-size: 13.5px; line-height: 1.6; margin-bottom: 6px; }
        .ref-table { width: 100%; border-collapse: collapse; margin: 8px 0 4px; font-size: 12.5px; }
        .ref-table th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: ${C.ink}; padding: 5px 8px; border-bottom: 1px solid ${C.paperLineStrong}; }
        .ref-table td { padding: 6px 8px; border-top: 1px solid ${C.paperLine}; font-family: ${F_DATA}; }
        .note-line { font-size: 12px; color: ${C.ink}; font-style: italic; }
        .formula { font-family: ${F_DATA}; font-size: 13px; background: ${C.surfaceAlt}; border: 1px solid ${C.paperLineStrong}; padding: 8px 10px; border-radius: 3px; display: inline-block; }

        .settings-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid ${C.paperLine}; }
        .settings-row:first-of-type { border-top: none; }
        .settings-row label { flex: 1; font-size: 12.5px; color: ${C.ink}; }
        .settings-row .unit { font-size: 11px; color: ${C.ink}; font-family: ${F_DATA}; }
        .status-label { display: flex; align-items: center; gap: 6px; font-family: ${F_DATA}; }
        .reset-all-btn { color: ${C.critical}; border-color: ${C.critical}; margin-top: 4px; }
        .reset-all-btn.armed { background: ${C.criticalDim}; }
        .warn-line { font-size: 11.5px; color: ${C.high}; margin-top: 4px; }
      `}</style>


      <div className="masthead">
        <h1>Supplier Reliability Matrix</h1>
        <p className="sub">
          A risk scorecard built for procurement data as it actually exists: thin, inconsistent,
          and rarely tracking more than delivery counts, priority, and sourcing structure.
        </p>
        <div className="meta-row">
          <span>Suppliers on file: <b>{suppliers.length}</b></span>
          <span>Scored: <b>{derived.filter((s) => !s.insufficient).length}</b></span>
          <span>
            {saveState === "saving" ? <Loader2 size={11} className="spin" /> : storageStatus === "unavailable" ? <AlertCircle size={11} /> : <Check size={11} />}
            {" "}<b>{storageStatus === "unavailable" ? "Not saved" : saveState === "saving" ? "Saving" : "Saved to this browser"}</b>
          </span>
        </div>
      </div>

      <div className="tabbar">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} className={`tab-btn ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
        <a
          className="github-link"
          href="https://github.com/Shubham-Gambhire/supplierreliabilitymatrix"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View this project on GitHub"
        >
          <Github size={14} /> GitHub <ArrowUpRight size={12} />
        </a>
        <button className="methodology-trigger" onClick={() => setShowMethodology(true)}>
          <BookOpen size={13} /> How this is scored
        </button>
      </div>

      <div className="content-wrap">
        {tab === "register" && <RegisterView derived={derived} onSelectSupplier={goToSupplier} onRecordSnapshot={recordSnapshot} lastSnapshotAt={lastSnapshotAt} />}
        {tab === "ledger" && <LedgerView suppliers={suppliers} setSuppliers={setSuppliers} derived={derived} config={config} history={history} focusRequest={focusRequest} />}
        {tab === "settings" && <SettingsView config={config} setConfig={setConfig} derived={derived} storageStatus={storageStatus} saveState={saveState} onResetAll={resetAllData} />}
      </div>

      <footer className="app-footer">
        <span>Made by Shubham Gambhire</span>
        <a
          className="footer-linkedin"
          href="https://www.linkedin.com/in/shubhambg"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Linkedin size={13} /> LinkedIn
        </a>
      </footer>

      <Modal open={showMethodology} onClose={() => setShowMethodology(false)} title="How this is scored">
        <MethodologyView config={config} />
      </Modal>
    </div>
  );
}
