// Pure scoring + validation engine for the Supplier Reliability Matrix.
// Higher scores are SAFER everywhere (1-5 scale). Priority 1 is the most
// critical tier, so its adjustment divides by the LARGEST multiplier and can
// only lower the score relative to a less critical tier with identical data.

export const MODEL_VERSION = 2;
export const SCORE_MIN = 0;
export const SCORE_MAX = 5;
export const SCORE_MIDPOINT = 3;
export const PRIORITIES = [1, 2, 3, 4, 5];

export const DEFAULT_CONFIG = Object.freeze({
  weights: Object.freeze({ delivery: 0.65, dependency: 0.35 }),
  multipliers: Object.freeze({ 1: 1.5, 2: 1.3, 3: 1.1, 4: 1.0, 5: 0.9 }),
  thresholds: Object.freeze({ low: 3.75, medium: 2.5, high: 1.5 }),
  minPOs: 3,
  compoundingWeight: 0.15,
  peerGapThreshold: 0.5,
  deliveryBuckets: Object.freeze([
    Object.freeze({ min: 0.9, score: 5 }),
    Object.freeze({ min: 0.75, score: 4 }),
    Object.freeze({ min: 0.6, score: 3 }),
    Object.freeze({ min: 0.45, score: 2 }),
    Object.freeze({ min: 0, score: 1 }),
  ]),
});

export function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Strict numeric reader: numbers pass through, non-blank numeric strings parse, everything else is NaN. */
export function toNumber(v) {
  if (typeof v === "number") return v;
  if (
    typeof v === "string" &&
    v.trim() !== "" &&
    /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v.trim())
  )
    return Number(v.trim());
  return NaN;
}

const isNonNegInt = (n) => Number.isFinite(n) && Number.isInteger(n) && n >= 0;

/* ---------------- configuration validation ---------------- */

/**
 * Validates a (possibly draft / string-valued) config. Returns
 * { ok, errors: {path: message}, config } where config is the numeric,
 * normalized version (only meaningful when ok).
 */
export function validateConfig(draft) {
  const errors = {};
  const d = draft || {};
  const num = (v) => toNumber(v);
  const out = {
    weights: { delivery: num(d.weights?.delivery), dependency: num(d.weights?.dependency) },
    multipliers: {},
    thresholds: {
      low: num(d.thresholds?.low),
      medium: num(d.thresholds?.medium),
      high: num(d.thresholds?.high),
    },
    minPOs: num(d.minPOs),
    compoundingWeight: num(d.compoundingWeight),
    peerGapThreshold: num(d.peerGapThreshold),
    deliveryBuckets: [],
  };

  for (const k of ["delivery", "dependency"]) {
    const w = out.weights[k];
    if (!Number.isFinite(w) || w < 0 || w > 1)
      errors[`weights.${k}`] = "Enter a number from 0 to 1.";
  }
  if (!errors["weights.delivery"] && !errors["weights.dependency"]) {
    const sum = out.weights.delivery + out.weights.dependency;
    if (Math.abs(sum - 1) > 1e-6)
      errors.weights = `Weights must sum to 1 (currently ${+sum.toFixed(4)}).`;
  }

  let prev = Infinity;
  for (const p of PRIORITIES) {
    const m = num(d.multipliers?.[p]);
    out.multipliers[p] = m;
    if (!Number.isFinite(m) || m <= 0 || m > 10) {
      errors[`multipliers.${p}`] = "Enter a positive number up to 10.";
      prev = NaN;
      continue;
    }
    if (Number.isFinite(prev) && m > prev)
      errors[`multipliers.${p}`] =
        `Must be no larger than P${p - 1} (more critical tiers need equal or larger multipliers).`;
    prev = m;
  }

  const { low, medium, high } = out.thresholds;
  if (!Number.isFinite(low) || low <= 0 || low > SCORE_MAX)
    errors["thresholds.low"] = "Enter a number above 0 and at most 5.";
  if (!Number.isFinite(medium)) errors["thresholds.medium"] = "Enter a number.";
  if (!Number.isFinite(high) || high < 0)
    errors["thresholds.high"] = "Enter a number of 0 or more.";
  if (!errors["thresholds.low"] && !errors["thresholds.medium"] && !(low > medium))
    errors["thresholds.medium"] = "Must be below the Low threshold.";
  if (!errors["thresholds.medium"] && !errors["thresholds.high"] && !(medium > high))
    errors["thresholds.high"] = "Must be below the Medium threshold.";

  const buckets = Array.isArray(d.deliveryBuckets) ? d.deliveryBuckets : [];
  if (buckets.length !== 5) errors.deliveryBuckets = "Exactly five delivery buckets are required.";
  let prevMin = Infinity;
  for (let i = 0; i < 5; i++) {
    const score = 5 - i;
    const raw = buckets[i];
    let min = num(raw?.min);
    if (i === 4) min = 0; // final bucket is fixed at 0
    out.deliveryBuckets.push({ min, score });
    if (raw && raw.score !== undefined && toNumber(raw.score) !== score)
      errors.deliveryBuckets = "Bucket scores are fixed at 5, 4, 3, 2, 1.";
    if (i === 4) {
      if (raw && toNumber(raw.min) !== 0 && raw.min !== undefined)
        errors[`deliveryBuckets.4`] = "The lowest bucket always starts at 0%.";
      continue;
    }
    if (!Number.isFinite(min) || min < 0 || min > 1) {
      errors[`deliveryBuckets.${i}`] = "Enter a percentage from 0 to 100.";
      prevMin = NaN;
      continue;
    }
    if (Number.isFinite(prevMin) && !(min < prevMin))
      errors[`deliveryBuckets.${i}`] = `Must be below the score ${score + 1} minimum.`;
    else if (!(min > 0))
      errors[`deliveryBuckets.${i}`] = "Must be above 0% (only score 1 starts at 0%).";
    prevMin = min;
  }

  if (
    !Number.isFinite(out.minPOs) ||
    !Number.isInteger(out.minPOs) ||
    out.minPOs < 1 ||
    out.minPOs > 1000
  )
    errors.minPOs = "Enter a whole number from 1 to 1000.";
  if (
    !Number.isFinite(out.compoundingWeight) ||
    out.compoundingWeight < 0 ||
    out.compoundingWeight > 1
  )
    errors.compoundingWeight = "Enter a number from 0 to 1.";
  if (
    !Number.isFinite(out.peerGapThreshold) ||
    out.peerGapThreshold < 0 ||
    out.peerGapThreshold > 5
  )
    errors.peerGapThreshold = "Enter a number from 0 to 5.";

  return { ok: Object.keys(errors).length === 0, errors, config: out };
}

/** Human labels derived from the ACTIVE bucket minima. */
export function deliveryBucketLabels(buckets) {
  const pct = (m) => `${+(m * 100).toFixed(2)}%`;
  return buckets.map((b, i) =>
    i === 0 ? `\u2265 ${pct(b.min)}` : `${pct(b.min)} to < ${pct(buckets[i - 1].min)}`,
  );
}

/** Explicit, non-overlapping tier ranges for display. */
export function tierRanges(t) {
  return [
    { tier: "Low Risk", range: `${t.low} to 5 (score \u2265 ${t.low})` },
    { tier: "Medium Risk", range: `${t.medium} \u2264 score < ${t.low}` },
    { tier: "High Risk", range: `${t.high} \u2264 score < ${t.medium}` },
    { tier: "Critical Risk", range: `0 \u2264 score < ${t.high}` },
  ];
}

/* ---------------- supplier validation ---------------- */

export function validateSupplier(s) {
  const errors = {};
  const name = typeof s?.name === "string" ? s.name.trim() : "";
  if (!name) errors.name = "Supplier name is required.";
  const total = toNumber(s?.totalPOs);
  const onTime = toNumber(s?.onTimeDeliveries);
  const priority = toNumber(s?.priority);
  const spend = toNumber(s?.annualSpend);
  if (!isNonNegInt(total)) errors.totalPOs = "Total POs must be a whole number of 0 or more.";
  if (!isNonNegInt(onTime))
    errors.onTimeDeliveries = "On-time deliveries must be a whole number of 0 or more.";
  else if (!errors.totalPOs && onTime > total)
    errors.onTimeDeliveries = `On-time deliveries (${onTime}) cannot exceed Total POs (${total}).`;
  if (!(Number.isInteger(priority) && priority >= 1 && priority <= 5))
    errors.priority = "Priority must be P1 to P5.";
  if (!(Number.isFinite(spend) && spend >= 0))
    errors.annualSpend = "Annual spend must be a number of 0 or more.";
  if (typeof s?.singleSource !== "boolean") errors.singleSource = "Sole source must be Yes or No.";
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values: { total, onTime, priority, spend },
  };
}

/* ---------------- scoring ---------------- */

export function computeDeliveryScore(rate, buckets) {
  for (const b of buckets) if (rate >= b.min) return b.score;
  return buckets[buckets.length - 1].score;
}

export function computeDependencyScore(singleSource, priority) {
  if (!singleSource) return 5;
  if (priority <= 2) return 1;
  if (priority === 3) return 2;
  return 3;
}

export function computeRiskTier(score, t) {
  if (score >= t.low) return "Low Risk";
  if (score >= t.medium) return "Medium Risk";
  if (score >= t.high) return "High Risk";
  return "Critical Risk";
}

/** config must be a validated numeric config. */
export function computeSupplier(s, config) {
  const v = validateSupplier(s);
  const base = {
    ...s,
    errors: v.errors,
    status: "scored",
    onTimeRate: null,
    deliveryScore: null,
    dependencyScore: null,
    compoundingPenalty: 0,
    performanceScore: null,
    multiplier: null,
    adjustedScore: null,
    riskTier: null,
    // Validated numeric values (null when that field is invalid; blanks are never coerced to 0).
    spendValue: v.errors.annualSpend ? null : v.values.spend,
    totalValue: v.errors.totalPOs ? null : v.values.total,
    onTimeValue: v.errors.onTimeDeliveries ? null : v.values.onTime,
    priorityValue: v.errors.priority ? null : v.values.priority,
    attention: [],
  };
  if (!v.ok) {
    // Dependency is still meaningful if its own inputs are valid, but an invalid row never gets a tier.
    if (!v.errors.priority && !v.errors.singleSource)
      base.dependencyScore = computeDependencyScore(s.singleSource, v.values.priority);
    if (!v.errors.totalPOs && !v.errors.onTimeDeliveries && v.values.total > 0)
      base.onTimeRate = v.values.onTime / v.values.total;
    const out = { ...base, status: "invalid", riskTier: "Invalid Data" };
    out.attention = computeAttention(out, s, config);
    return out;
  }
  const { total, onTime, priority } = v.values;
  const dependencyScore = computeDependencyScore(s.singleSource, priority);
  const onTimeRate = total > 0 ? onTime / total : null;
  const minPOs = Math.max(1, config.minPOs | 0);
  if (total === 0 || total < minPOs) {
    const out = {
      ...base,
      dependencyScore,
      onTimeRate,
      status: "insufficient",
      riskTier: "Insufficient Data",
    };
    out.attention = computeAttention(out, s, config);
    return out;
  }
  const deliveryScore = computeDeliveryScore(onTimeRate, config.deliveryBuckets);
  const penalty =
    config.compoundingWeight *
    Math.max(0, SCORE_MIDPOINT - deliveryScore) *
    Math.max(0, SCORE_MIDPOINT - dependencyScore);
  const performanceScore = clamp(
    config.weights.delivery * deliveryScore + config.weights.dependency * dependencyScore - penalty,
    SCORE_MIN,
    SCORE_MAX,
  );
  const multiplier = config.multipliers[priority];
  const adjustedScore = clamp(performanceScore / multiplier, SCORE_MIN, SCORE_MAX);
  const out = {
    ...base,
    dependencyScore,
    onTimeRate,
    deliveryScore,
    compoundingPenalty: penalty,
    performanceScore,
    multiplier,
    adjustedScore,
    riskTier: computeRiskTier(adjustedScore, config.thresholds),
  };
  out.attention = computeAttention(out, s, config);
  return out;
}

/**
 * Attention signals independent of the final tier, so a weighted tier cannot mask
 * raw poor delivery or structural dependency. Uses only active thresholds; this is a
 * follow-up prompt, not a probability.
 *  - poor-delivery: scored row whose on-time rate is below the active score-3 bucket minimum.
 *  - structural-dependency: sole-sourced row whose dependency score is 1 or 2 (P1 to P3).
 *  - thin-data-sole-source: sole-sourced row with too few POs to score.
 */
export function computeAttention(d, s, config) {
  const out = [];
  const b3 = config?.deliveryBuckets?.find((b) => b.score === 3);
  if (d.status === "scored" && b3 && d.onTimeRate !== null && d.onTimeRate < b3.min)
    out.push({
      code: "poor-delivery",
      label: "Poor delivery",
      reason: `On-time rate is below the ${Math.round(b3.min * 100)}% minimum for a delivery score of 3, regardless of final tier.`,
    });
  if (s?.singleSource === true && d.dependencyScore !== null && d.dependencyScore <= 2)
    out.push({
      code: "structural-dependency",
      label: "Sole-source dependency",
      reason: "Sole-sourced at priority P1 to P3, so there is no ready alternative for a critical item.",
    });
  if (d.status === "insufficient" && s?.singleSource === true)
    out.push({
      code: "thin-data-sole-source",
      label: "Sole source, thin data",
      reason: "Sole-sourced but has too few POs to score; gather delivery history.",
    });
  return out;
}

/* ---------------- peer comparison (leave-one-out) ---------------- */

export function categoryKey(cat) {
  const k = typeof cat === "string" ? cat.trim().toLowerCase().replace(/\s+/g, " ") : "";
  return k || "uncategorized";
}

export function attachPeerComparison(derived, gap) {
  const groups = new Map();
  for (const s of derived) {
    if (s.status !== "scored") continue;
    const k = categoryKey(s.category);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  return derived.map((s) => {
    const empty = {
      ...s,
      categoryPeerAvg: null,
      categoryPeerCount: 0,
      peerDelta: null,
      peerDeltaPct: null,
      belowPeerAvg: false,
      peerMixedPriorities: false,
    };
    if (s.status !== "scored") return empty;
    const others = (groups.get(categoryKey(s.category)) || []).filter((o) => o !== s);
    if (others.length === 0) return empty;
    const avg = others.reduce((a, o) => a + o.adjustedScore, 0) / others.length;
    const peerDelta = s.adjustedScore - avg;
    const mixed = others.some((o) => Number(o.priority) !== Number(s.priority));
    return {
      ...s,
      categoryPeerAvg: avg,
      categoryPeerCount: others.length,
      peerDelta,
      peerDeltaPct: avg > 0 ? (Math.abs(peerDelta) / avg) * 100 : null,
      belowPeerAvg: peerDelta < -gap,
      peerMixedPriorities: mixed,
    };
  });
}

export function deriveAll(suppliers, config) {
  return attachPeerComparison(
    suppliers.map((s) => computeSupplier(s, config)),
    config.peerGapThreshold,
  );
}

/* ---------------- fingerprint ---------------- */

function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export function configFingerprint(config) {
  const str = `${MODEL_VERSION}|${stableStringify(config)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `m${MODEL_VERSION}-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

export const fmtScore = (n) =>
  n === null || n === undefined || !Number.isFinite(n) ? "N/A" : n.toFixed(2);
