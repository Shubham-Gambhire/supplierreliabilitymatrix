import { describe, it, expect } from "vitest";
import {
  cloneDefaultConfig,
  validateConfig,
  computeSupplier,
  deriveAll,
  attachPeerComparison,
  configFingerprint,
  deliveryBucketLabels,
  validateSupplier,
} from "./scoring.js";
import { recordSnapshot, splitHistory, trendDelta, HISTORY_LIMIT } from "./history.js";
import { parseSaved, serializeState, normalizeState, buildBackup, parseBackup } from "./storage.js";
import {
  buildImportPreview,
  applyImport,
  buildExportCsv,
  parseSpend,
  parseBool,
  isReservedLabel,
  mapHeaders,
} from "./csv.js";

const cfg = () => validateConfig(cloneDefaultConfig()).config;
const sup = (o = {}) => ({
  id: "S1",
  name: "Acme",
  location: "",
  category: "Components",
  annualSpend: 1000,
  onTimeDeliveries: 9,
  totalPOs: 10,
  priority: 3,
  singleSource: false,
  ...o,
});

describe("priority adjustment", () => {
  it("P1 never scores safer than P5 with identical data (audit example)", () => {
    const c = cfg();
    const p1 = computeSupplier(sup({ priority: 1, onTimeDeliveries: 1, totalPOs: 10 }), c);
    const p5 = computeSupplier(sup({ priority: 5, onTimeDeliveries: 1, totalPOs: 10 }), c);
    expect(p1.performanceScore).toBeCloseTo(2.4, 10);
    expect(p1.adjustedScore).toBeCloseTo(1.6, 10);
    expect(p5.adjustedScore).toBeCloseTo(2.6667, 3);
    expect(p1.riskTier).toBe("High Risk");
    expect(p5.riskTier).toBe("Medium Risk");
  });
  it("is monotone non-increasing in criticality and bounded 0..5 for all inputs", () => {
    const c = cfg();
    const order = ["Critical Risk", "High Risk", "Medium Risk", "Low Risk"];
    for (const ss of [true, false])
      for (let on = 0; on <= 10; on++) {
        let prev = -Infinity,
          prevTier = -1;
        for (const p of [1, 2, 3, 4, 5]) {
          const r = computeSupplier(
            sup({ priority: p, onTimeDeliveries: on, singleSource: ss }),
            c,
          );
          expect(r.performanceScore).toBeGreaterThanOrEqual(0);
          expect(r.performanceScore).toBeLessThanOrEqual(5);
          expect(r.adjustedScore).toBeGreaterThanOrEqual(0);
          expect(r.adjustedScore).toBeLessThanOrEqual(5);
          expect(r.adjustedScore).toBeGreaterThanOrEqual(prev - 1e-12);
          expect(order.indexOf(r.riskTier)).toBeGreaterThanOrEqual(prevTier);
          prev = r.adjustedScore;
          prevTier = order.indexOf(r.riskTier);
        }
      }
  });
  it("rejects increasing multipliers and zero multipliers", () => {
    const d = cloneDefaultConfig();
    d.multipliers[5] = 1.6;
    expect(validateConfig(d).ok).toBe(false);
    const z = cloneDefaultConfig();
    z.multipliers[3] = 0;
    expect(validateConfig(z).errors["multipliers.3"]).toBeTruthy();
  });
});

describe("thresholds and delivery boundaries", () => {
  it("bucket boundaries are inclusive at the minimum", () => {
    const c = cfg();
    expect(computeSupplier(sup({ onTimeDeliveries: 9, totalPOs: 10 }), c).deliveryScore).toBe(5);
    expect(computeSupplier(sup({ onTimeDeliveries: 89, totalPOs: 100 }), c).deliveryScore).toBe(4);
    expect(computeSupplier(sup({ onTimeDeliveries: 60, totalPOs: 100 }), c).deliveryScore).toBe(3);
    expect(computeSupplier(sup({ onTimeDeliveries: 59, totalPOs: 100 }), c).deliveryScore).toBe(2);
    expect(computeSupplier(sup({ onTimeDeliveries: 0, totalPOs: 100 }), c).deliveryScore).toBe(1);
  });
  it("tier boundaries use full precision", () => {
    const c = cfg();
    c.thresholds = { low: 3.75, medium: 2.5, high: 1.5 };
    // P4 multiplier 1.0, non-sole: perf = .65*D + 1.75
    const r = computeSupplier(sup({ priority: 4, onTimeDeliveries: 6, totalPOs: 10 }), c); // D=3 -> 3.7
    expect(r.adjustedScore).toBeCloseTo(3.7, 10);
    expect(r.riskTier).toBe("Medium Risk");
  });
  it("labels derive from active minima", () => {
    const c = cloneDefaultConfig();
    c.deliveryBuckets[0].min = 0.95;
    const v = validateConfig(c);
    expect(deliveryBucketLabels(v.config.deliveryBuckets)[0]).toBe("\u2265 95%");
    expect(deliveryBucketLabels(v.config.deliveryBuckets)[1]).toBe("75% to < 95%");
  });
});

describe("invalid and insufficient rows", () => {
  const c = cfg();
  it("zero and below-min counts are insufficient, never scored", () => {
    expect(computeSupplier(sup({ onTimeDeliveries: 0, totalPOs: 0 }), c).status).toBe(
      "insufficient",
    );
    expect(computeSupplier(sup({ onTimeDeliveries: 2, totalPOs: 2 }), c).status).toBe(
      "insufficient",
    );
    const evil = { ...c, minPOs: 0 };
    const r = computeSupplier(sup({ onTimeDeliveries: 0, totalPOs: 0 }), evil);
    expect(r.adjustedScore).toBeNull();
  });
  for (const [label, patch] of [
    ["blank total", { totalPOs: "" }],
    ["negative", { totalPOs: -1 }],
    ["fractional", { onTimeDeliveries: 2.5 }],
    ["Infinity", { totalPOs: Infinity }],
    ["NaN", { onTimeDeliveries: NaN }],
    ["onTime>total", { onTimeDeliveries: 11 }],
    ["missing onTime", { onTimeDeliveries: undefined }],
    ["bad priority", { priority: 7 }],
    ["string bool", { singleSource: "N" }],
    ["blank name", { name: "  " }],
    ["bad spend", { annualSpend: -5 }],
  ]) {
    it(`flags ${label} as Invalid Data with null scores`, () => {
      const r = computeSupplier(sup(patch), c);
      expect(r.status).toBe("invalid");
      expect(r.riskTier).toBe("Invalid Data");
      expect(r.adjustedScore).toBeNull();
      expect(r.performanceScore).toBeNull();
    });
  }
  it("invalid rows never contribute to peer stats", () => {
    const d = deriveAll([sup({ id: "a" }), sup({ id: "b", onTimeDeliveries: 50 })], c);
    expect(d[0].categoryPeerCount).toBe(0);
  });
});

describe("settings validation", () => {
  const bad = (mut) => {
    const d = cloneDefaultConfig();
    mut(d);
    return validateConfig(d).ok;
  };
  it("rejects bad drafts", () => {
    expect(
      bad((d) => {
        d.weights.delivery = 0.7;
      }),
    ).toBe(false);
    expect(
      bad((d) => {
        d.weights.delivery = "";
      }),
    ).toBe(false);
    expect(
      bad((d) => {
        d.thresholds.medium = 4;
      }),
    ).toBe(false);
    expect(
      bad((d) => {
        d.thresholds.low = 6;
      }),
    ).toBe(false);
    expect(
      bad((d) => {
        d.deliveryBuckets[2].min = 0.8;
      }),
    ).toBe(false);
    expect(
      bad((d) => {
        d.minPOs = 2.5;
      }),
    ).toBe(false);
    expect(
      bad((d) => {
        d.minPOs = 0;
      }),
    ).toBe(false);
    expect(
      bad((d) => {
        d.compoundingWeight = Infinity;
      }),
    ).toBe(false);
    expect(
      bad((d) => {
        d.peerGapThreshold = -1;
      }),
    ).toBe(false);
    expect(bad(() => {})).toBe(true);
  });
  it("invalid saved config never applies (defaults kept, warned)", () => {
    const raw = JSON.stringify({
      suppliers: [],
      config: { weights: { delivery: 2, dependency: 0 } },
    });
    const p = parseSaved(raw);
    expect(p.status).toBe("ok");
    expect(p.state.config.weights.delivery).toBe(0.65);
    expect(p.warnings.join(" ")).toMatch(/invalid/);
  });
});

describe("peers", () => {
  const c = cfg();
  it("uses leave-one-out averages", () => {
    const d = deriveAll(
      [
        sup({ id: "a", onTimeDeliveries: 10, priority: 4 }),
        sup({ id: "b", onTimeDeliveries: 10, priority: 4 }),
        sup({ id: "c", onTimeDeliveries: 1, priority: 4 }),
      ],
      c,
    );
    const a = d[0].adjustedScore,
      low = d[2];
    expect(low.categoryPeerCount).toBe(2);
    expect(low.categoryPeerAvg).toBeCloseTo(a, 10);
    expect(low.belowPeerAvg).toBe(true);
  });
  it("handles prototype-like category names and normalizes keys", () => {
    const d = attachPeerComparison(
      deriveAll(
        [
          sup({ id: "a", category: "__proto__" }),
          sup({ id: "b", category: " __PROTO__ " }),
          sup({ id: "c", category: "constructor" }),
        ],
        c,
      ),
      0.5,
    );
    expect(d[0].categoryPeerCount).toBe(1);
    expect(d[2].categoryPeerCount).toBe(0);
  });
});

describe("CSV", () => {
  const H = "Supplier Name,Annual Spend,On-Time Deliveries,Total POs,Priority,Single Source";
  it("rejects ambiguous and missing headers; On-Time Rate is not a count", () => {
    expect(
      mapHeaders([
        "Supplier",
        "Vendor",
        "Annual Spend",
        "On-Time Deliveries",
        "Total POs",
        "Priority",
        "Single Source",
      ]).ok,
    ).toBe(false);
    const m = mapHeaders([
      "Supplier Name",
      "Annual Spend",
      "On-Time Rate %",
      "Total POs",
      "Priority",
      "Single Source",
    ]);
    expect(m.ok).toBe(false);
    expect(m.errors.join(" ")).toMatch(/onTimeDeliveries/);
  });
  it("parses quoted currency with BOM and grouped commas; never coerces junk to 0", () => {
    const p = buildImportPreview(
      `\uFEFF${H}\n"Acme, Inc.","$1,200.50",5,6,P2,Yes\nBeta,"1.200,50",5,6,2,N`,
      [],
    );
    expect(p.ok).toBe(true);
    expect(p.rows[0].kind).toBe("new");
    expect(p.rows[0].record.name).toBe("Acme, Inc.");
    expect(p.rows[0].record.annualSpend).toBe(1200.5);
    expect(p.rows[1].kind).toBe("invalid");
    expect(parseSpend("abc").ok).toBe(false);
    expect(parseSpend("-5").ok).toBe(false);
  });
  it("rejects unknown booleans and onTime>total", () => {
    expect(parseBool("maybe").ok).toBe(false);
    const p = buildImportPreview(`${H}\nA,100,5,6,1,maybe\nB,100,7,6,1,N`, []);
    expect(p.rows.map((r) => r.kind)).toEqual(["invalid", "invalid"]);
  });
  it("flags duplicates and applies only by explicit choice", () => {
    const existing = [sup({ id: "S1", name: "Acme" })];
    const p = buildImportPreview(`${H}\nacme,100,5,6,1,N\nNewCo,100,5,6,1,N`, existing);
    expect(p.rows[0].kind).toBe("duplicate");
    const skip = applyImport(p, existing, [], "skip");
    expect(skip.suppliers).toHaveLength(2);
    expect(skip.suppliers[0].totalPOs).toBe(10);
    const upd = applyImport(p, existing, [], "update");
    expect(upd.suppliers[0].totalPOs).toBe(6);
    expect(upd.suppliers[0].id).toBe("S1");
  });
  it("escapes formulae and round-trips IDs and custom fields", () => {
    const cols = [{ id: "col_x", label: "Notes" }];
    const d = deriveAll(
      [
        sup({ id: "S-9", name: "=HYPERLINK(1)", custom: { col_x: "+cmd" } }),
        sup({ id: "S-10", name: "\tTab" }),
      ],
      cfg(),
    );
    const csv = buildExportCsv(d, cols);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'\tTab");
    expect(csv.split("\n")[0]).toContain("Custom: Notes");
    const p = buildImportPreview(csv, [], cols);
    expect(p.ok).toBe(true);
    expect(p.rows[0].record.id).toBe("S-9");
    expect(p.rows[0].record.custom.col_x).toBe("'+cmd");
  });
  it("reserves standard labels for custom columns", () => {
    expect(isReservedLabel("Total POs")).toBe(true);
    expect(isReservedLabel("Risk Tier")).toBe(true);
    expect(isReservedLabel("Notes")).toBe(false);
  });
});

describe("storage", () => {
  it("repairs duplicate legacy IDs without dropping records", () => {
    const raw = JSON.stringify({
      suppliers: [
        sup({ id: "SUP-011" }),
        sup({ id: "SUP-011", name: "Other" }),
        sup({ id: "__proto__" }),
      ],
      history: { "SUP-011": [{ ts: "x", riskScore: 2 }] },
    });
    const p = parseSaved(raw);
    const ids = p.state.suppliers.map((s) => s.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("SUP-011");
    expect(p.state.suppliers[1].name).toBe("Other");
    expect(p.state.history["SUP-011"]).toHaveLength(1);
  });
  it("keeps an empty saved ledger and custom-column-only state", () => {
    const state = {
      suppliers: [],
      config: cfg(),
      history: {},
      customCols: [{ id: "col_a", label: "Notes", type: "text" }],
    };
    const p = parseSaved(serializeState(state, "t1"));
    expect(p.status).toBe("ok");
    expect(p.state.suppliers).toEqual([]);
    expect(p.state.customCols).toHaveLength(1);
    expect(p.writeToken).toBe("t1");
  });
  it("reports corrupt saves instead of replacing them", () => {
    expect(parseSaved("{not json").status).toBe("corrupt");
    expect(parseSaved(JSON.stringify({ foo: 1 })).status).toBe("corrupt");
    expect(parseSaved(JSON.stringify({ version: 99, suppliers: [] })).status).toBe("corrupt");
    expect(parseSaved(null).status).toBe("empty");
  });
  it("validates backups before restore", () => {
    const state = { suppliers: [sup()], config: cfg(), history: {}, customCols: [] };
    expect(parseBackup(buildBackup(state)).ok).toBe(true);
    expect(parseBackup(JSON.stringify(state)).ok).toBe(false);
    expect(normalizeState(null).ok).toBe(false);
  });
});

describe("snapshots", () => {
  it("records only scored suppliers, versions entries and compares compatible ones", () => {
    const c = cfg();
    const fp = configFingerprint(c);
    const d = deriveAll([sup({ id: "a" }), sup({ id: "b", totalPOs: 1, onTimeDeliveries: 1 })], c);
    const legacy = { a: [{ ts: "2020", riskScore: 9 }] };
    const r = recordSnapshot(legacy, d, fp, "2026");
    expect(r.count).toBe(1);
    expect(r.history.b).toBeUndefined();
    const split = splitHistory(r.history.a, fp);
    expect(split.compatible).toHaveLength(1);
    expect(split.legacy).toHaveLength(1);
    expect(trendDelta(r.history.a, d[0].adjustedScore, fp)).toBeCloseTo(0, 10);
    const c2 = { ...c, compoundingWeight: 0.2 };
    expect(trendDelta(r.history.a, 1, configFingerprint(c2))).toBeNull();
  });
  it("prevents empty snapshots and bounds history", () => {
    const c = cfg();
    const fp = configFingerprint(c);
    expect(recordSnapshot({}, [], fp).count).toBe(0);
    let h = {};
    const d = deriveAll([sup({ id: "a" })], c);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = recordSnapshot(h, d, fp, String(i)).history;
    expect(h.a).toHaveLength(HISTORY_LIMIT);
  });
  it("validateSupplier accepts a clean row", () => {
    expect(validateSupplier(sup()).ok).toBe(true);
  });
});

describe("review follow-ups", () => {
  const sup = (o = {}) => ({ id: "T1", name: "Test", location: "", category: "", annualSpend: 100, totalPOs: 10, onTimeDeliveries: 9, priority: 3, singleSource: false, ...o });
  it("malformed array-like history never throws", () => {
    const r = parseSaved(JSON.stringify({ suppliers: [sup()], history: { T1: { length: 1e30 } }, config: cloneDefaultConfig() }));
    expect(r.status).toBe("ok");
    expect(r.state.history.T1).toBeUndefined();
  });
  it("custom column ID repair remaps values", () => {
    const n = normalizeState({ suppliers: [sup({ custom: { "bad id": "Important value" } })], customCols: [{ id: "bad id", label: "Owner", type: "text" }], config: cloneDefaultConfig() });
    const newId = n.state.customCols[0].id;
    expect(newId).not.toBe("bad id");
    expect(n.state.suppliers[0].custom[newId]).toBe("Important value");
  });
  it("legacy string spend is normalized for totals", () => {
    const r = parseSaved(JSON.stringify({ suppliers: [sup({ annualSpend: "1200" })], config: cloneDefaultConfig() }));
    const d = computeSupplier(r.state.suppliers[0], validateConfig(r.state.config).config);
    expect(d.spendValue).toBe(1200);
    expect(computeSupplier(sup({ annualSpend: "" }), validateConfig(cloneDefaultConfig()).config).spendValue).toBeNull();
  });
  it("poor raw delivery is flagged even when tier is Medium", () => {
    const d = computeSupplier(sup({ priority: 5, onTimeDeliveries: 0 }), validateConfig(cloneDefaultConfig()).config);
    expect(d.riskTier).toBe("Medium Risk");
    expect(d.attention.map((a) => a.code)).toContain("poor-delivery");
  });
  it("thin-data sole source is flagged", () => {
    const d = computeSupplier(sup({ totalPOs: 1, onTimeDeliveries: 1, singleSource: true, priority: 1 }), validateConfig(cloneDefaultConfig()).config);
    expect(d.attention.map((a) => a.code)).toEqual(expect.arrayContaining(["thin-data-sole-source", "structural-dependency"]));
  });
});
