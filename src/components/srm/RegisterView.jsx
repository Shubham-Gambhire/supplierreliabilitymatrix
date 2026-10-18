import React, { useState } from "react";
import { Building2, History } from "lucide-react";
import { C, F_DATA, F_BODY, F_DISPLAY } from "./tokens.js";
import {
  RISK_META,
  TIER_ORDER,
  HeroStat,
  StatStrip,
  buildColorMap,
  deriveRegion,
  formatCurrency,
  pct,
} from "./shared.jsx";
import { fmtScore, deliveryBucketLabels } from "@/lib/srm/scoring.js";

/* RISK MATRIX. x = on-time rate, y = dependency score (higher = more sourcing
   resilience, i.e. alternates exist). Position excludes the priority
   adjustment; when colored by tier, color reflects the adjusted reliability. */
function RiskMatrix({ suppliers, colorBy, onSelectSupplier, config }) {
  const W = 640,
    H = 380,
    PAD = { l: 56, r: 24, t: 20, b: 46 };
  const plotW = W - PAD.l - PAD.r,
    plotH = H - PAD.t - PAD.b;
  const plottable = suppliers.filter((s) => s.status === "scored");
  const nInsufficient = suppliers.filter((s) => s.status === "insufficient").length;
  const nInvalid = suppliers.filter((s) => s.status === "invalid").length;
  const refRate = config.deliveryBuckets[2].min; // active score-3 threshold

  const x = (rate) => PAD.l + rate * plotW;
  const y = (score) => PAD.t + (1 - (score - 1) / 4) * plotH;
  const midX = x(refRate),
    midY = y(3);

  const maxSpend = plottable.reduce((m, s) => Math.max(m, s.spendValue ?? 0), 0);
  const RMAX = 18,
    RVIS = 3;
  // Area proportional to spend (r ∝ sqrt(spend)); a visible minimum radius is disclosed in the legend.
  const radius = (spend) =>
    maxSpend > 0 ? Math.max(RVIS, RMAX * Math.sqrt(Math.max(0, spend) / maxSpend)) : RVIS * 2;

  const groupValue = (s) =>
    colorBy === "category" ? s.category?.trim() || "Uncategorized" : deriveRegion(s.location);
  const colorMap = colorBy !== "risk" ? buildColorMap(plottable.map(groupValue)) : null;
  const pointColor = (s) =>
    colorBy === "risk" ? RISK_META[s.riskTier].color : colorMap.get(groupValue(s));
  const legendEntries =
    colorBy === "risk"
      ? ["Low Risk", "Medium Risk", "High Risk", "Critical Risk"].map((k) => [
          k,
          RISK_META[k].color,
        ])
      : Array.from(colorMap.entries());

  const posKey = (s) => `${s.onTimeRate.toFixed(4)}|${s.dependencyScore}`;
  const posCounts = new Map();
  plottable.forEach((s) => posCounts.set(posKey(s), (posCounts.get(posKey(s)) || 0) + 1));
  const overlapping = Array.from(posCounts.values())
    .filter((n) => n > 1)
    .reduce((a, n) => a + n, 0);
  const sorted = [...plottable].sort((a, b) => (b.spendValue ?? 0) - (a.spendValue ?? 0)); // draw big first, small on top

  if (plottable.length === 0) {
    return (
      <p className="empty-note">
        No suppliers can be plotted yet. A supplier appears here once it has valid data and at least{" "}
        {config.minPOs} purchase orders on file. Add or fix suppliers in the Supplier Ledger.
      </p>
    );
  }

  const label = { font: `italic 10.5px ${F_DISPLAY}` };
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="matrix-svg"
        role="img"
        aria-label={`Reliability matrix with ${plottable.length} plotted suppliers. Use the supplier list below the chart to open a supplier.`}
      >
        <rect
          x={PAD.l}
          y={PAD.t}
          width={midX - PAD.l}
          height={midY - PAD.t}
          fill={C.mediumDim}
          opacity="0.55"
        />
        <rect
          x={midX}
          y={PAD.t}
          width={PAD.l + plotW - midX}
          height={midY - PAD.t}
          fill={C.lowDim}
          opacity="0.55"
        />
        <rect
          x={PAD.l}
          y={midY}
          width={midX - PAD.l}
          height={PAD.t + plotH - midY}
          fill={C.criticalDim}
          opacity="0.7"
        />
        <rect
          x={midX}
          y={midY}
          width={PAD.l + plotW - midX}
          height={PAD.t + plotH - midY}
          fill={C.mediumDim}
          opacity="0.55"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={x(f)}
            y1={PAD.t}
            x2={x(f)}
            y2={PAD.t + plotH}
            stroke={C.paperLineStrong}
            strokeDasharray="2 3"
          />
        ))}
        {[1, 2, 3, 4, 5].map((s) => (
          <line
            key={s}
            x1={PAD.l}
            y1={y(s)}
            x2={PAD.l + plotW}
            y2={y(s)}
            stroke={C.paperLineStrong}
            strokeDasharray="2 3"
          />
        ))}
        <line
          x1={midX}
          y1={PAD.t}
          x2={midX}
          y2={PAD.t + plotH}
          stroke={C.ink}
          strokeOpacity="0.5"
        />
        <rect
          x={PAD.l}
          y={PAD.t}
          width={plotW}
          height={plotH}
          fill="none"
          stroke={C.ink}
          strokeWidth="1.5"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text
            key={f}
            x={x(f)}
            y={PAD.t + plotH + 18}
            textAnchor="middle"
            style={{ font: `11px ${F_DATA}`, fill: C.ink }}
          >
            {Math.round(f * 100)}%
          </text>
        ))}
        {[1, 2, 3, 4, 5].map((s) => (
          <text
            key={s}
            x={PAD.l - 10}
            y={y(s) + 4}
            textAnchor="end"
            style={{ font: `11px ${F_DATA}`, fill: C.ink }}
          >
            {s}
          </text>
        ))}
        <text
          x={PAD.l + plotW / 2}
          y={H - 6}
          textAnchor="middle"
          style={{ font: `600 11px ${F_BODY}`, fill: C.ink, letterSpacing: "0.06em" }}
        >
          ON-TIME DELIVERY RATE →
        </text>
        <text
          x={-(PAD.t + plotH / 2)}
          y={16}
          transform="rotate(-90)"
          textAnchor="middle"
          style={{ font: `600 11px ${F_BODY}`, fill: C.ink, letterSpacing: "0.06em" }}
        >
          DEPENDENCY SCORE (HIGHER = MORE ALTERNATES) →
        </text>
        <text x={PAD.l + 6} y={PAD.t + plotH - 8} style={{ ...label, fill: C.critical }}>
          Highest exposure
        </text>
        <text
          x={PAD.l + plotW - 6}
          y={PAD.t + 14}
          textAnchor="end"
          style={{ ...label, fill: C.low }}
        >
          Strongest raw resilience
        </text>
        <text x={midX + 4} y={PAD.t + plotH - 8} style={{ font: `10px ${F_DATA}`, fill: C.ink }}>
          {Math.round(refRate * 100)}% (score 3 minimum)
        </text>
        {sorted.map((s) => (
          <g
            key={s.id}
            transform={`translate(${x(s.onTimeRate)}, ${y(s.dependencyScore)})`}
            className="matrix-point"
            onClick={() => onSelectSupplier(s.id)}
          >
            <circle
              r={radius(s.spendValue ?? 0)}
              fill={pointColor(s)}
              stroke={C.surface}
              strokeWidth="1.5"
              opacity="0.85"
            />
            <title>{`${s.name}: ${pct(s.onTimeRate)} on-time, dependency ${s.dependencyScore}/5, ${formatCurrency(s.spendValue)} spend, ${s.riskTier}`}</title>
          </g>
        ))}
      </svg>

      <div className="matrix-legend">
        {legendEntries.map(([lab, color]) => (
          <span key={lab} className="legend-item">
            <span className="legend-swatch" style={{ background: color }} />
            {lab}
          </span>
        ))}
        <span className="legend-item legend-note">
          Bubble area proportional to annual spend (largest {formatCurrency(maxSpend)}); very small
          spends drawn at a {RVIS}px minimum.
        </span>
      </div>
      <p className="matrix-explain">
        Position shows raw delivery reliability and sourcing structure only, before the priority
        adjustment. The vertical line marks the active score 3 delivery threshold (
        {deliveryBucketLabels(config.deliveryBuckets)[2]}).
        {colorBy === "risk"
          ? " Color shows the final tier, which includes the priority adjustment, so two nearby points can carry different tiers."
          : ""}
      </p>
      {(nInsufficient > 0 || nInvalid > 0) && (
        <p className="matrix-note">
          Omitted:{" "}
          {nInsufficient > 0 &&
            `${nInsufficient} with fewer than ${config.minPOs} purchase orders on file`}
          {nInsufficient > 0 && nInvalid > 0 && "; "}
          {nInvalid > 0 && `${nInvalid} with invalid data (fix in the Ledger)`}.
        </p>
      )}
      <details className="matrix-list">
        <summary>
          Plotted suppliers ({plottable.length})
          {overlapping > 0 ? `, ${overlapping} share an exact position with another supplier` : ""}
        </summary>
        <ul>
          {sorted.map((s) => (
            <li key={s.id}>
              <button type="button" className="link-btn" onClick={() => onSelectSupplier(s.id)}>
                {s.name}: {pct(s.onTimeRate)} on-time, dependency {s.dependencyScore}/5,{" "}
                {formatCurrency(s.spendValue)}, {s.riskTier}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

const COLOR_BY_OPTIONS = [
  { key: "risk", label: "Risk Tier" },
  { key: "category", label: "Category" },
  { key: "region", label: "Region" },
];

export default function RegisterView({
  derived,
  config,
  onSelectSupplier,
  onRecordSnapshot,
  lastSnapshotAt,
}) {
  const [colorBy, setColorBy] = useState("risk");
  const total = derived.length;
  const scored = derived.filter((s) => s.status === "scored");
  const isCH = (s) => s.riskTier === "Critical Risk" || s.riskTier === "High Risk";
  const critical = derived.filter((s) => s.riskTier === "Critical Risk").length;
  const chCount = derived.filter(isCH).length;
  const insufficientCount = derived.filter((s) => s.status === "insufficient").length;
  const invalidCount = derived.filter((s) => s.status === "invalid").length;
  const spend = (s) =>
    typeof s.spendValue === "number" && Number.isFinite(s.spendValue) ? s.spendValue : 0;
  const avgAdj = scored.length
    ? scored.reduce((a, s) => a + s.adjustedScore, 0) / scored.length
    : null;
  const tierSpend = derived.filter(isCH).reduce((a, s) => a + spend(s), 0);
  const unassessedSpend = derived
    .filter((s) => s.status !== "scored")
    .reduce((a, s) => a + spend(s), 0);
  const invalidSpendUnknown = derived.some((s) => s.status === "invalid" && s.errors?.annualSpend);

  const tierCounts = TIER_ORDER.map((t) => ({
    tier: t,
    count: derived.filter((s) => s.riskTier === t).length,
  }));
  const watchlist = derived.filter(isCH).sort((a, b) => a.adjustedScore - b.adjustedScore);
  const attentionRows = derived
    .filter((s) => s.attention && s.attention.length && !isCH(s))
    .slice(0, 8);
  const laggards = derived.filter((s) => s.belowPeerAvg).sort((a, b) => a.peerDelta - b.peerDelta);

  return (
    <div className="stack-lg">
      <div className="kpi-hero-row">
        <HeroStat
          label="Annual spend in Critical/High tiers"
          value={formatCurrency(tierSpend)}
          sub="USD attached to those tiers; not an expected loss"
          color={chCount > 0 ? C.high : C.ink}
        />
        <HeroStat
          label="Unassessed spend"
          value={formatCurrency(unassessedSpend)}
          sub={`Invalid + insufficient data${invalidSpendUnknown ? "; some spend values invalid" : ""}`}
        />
        <StatStrip
          items={[
            { label: "Suppliers", value: total },
            { label: "Scored", value: scored.length },
            { label: "Insufficient", value: insufficientCount },
            { label: "Invalid", value: invalidCount, color: invalidCount ? C.critical : undefined },
            {
              label: "Critical/High",
              value: chCount,
              color: critical > 0 ? C.critical : undefined,
            },
            {
              label: "Sole-source",
              value: derived.filter((s) => s.singleSource === true).length,
              color: C.brass,
            },
            {
              label: "Avg adjusted reliability (higher = safer)",
              value: avgAdj === null ? "N/A" : fmtScore(avgAdj),
            },
          ]}
        />
      </div>

      <section className="matrix-section" aria-labelledby="matrix-h">
        <div className="matrix-section-head">
          <h2 id="matrix-h">Reliability matrix</h2>
          <span className="panel-hint">
            On-time delivery rate vs. dependency score (higher dependency score = more sourcing
            resilience)
          </span>
        </div>
        <div className="colorby-row">
          <span className="colorby-label" id="colorby-l">
            Color by
          </span>
          <div className="chip-row" role="group" aria-labelledby="colorby-l">
            {COLOR_BY_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={colorBy === o.key}
                className={`chip ${colorBy === o.key ? "chip-active" : ""}`}
                onClick={() => setColorBy(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-outline snapshot-btn"
            onClick={onRecordSnapshot}
            disabled={scored.length === 0}
          >
            <History size={13} /> Record snapshot
          </button>
          {lastSnapshotAt && (
            <span className="snapshot-note">
              Last recorded {new Date(lastSnapshotAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <RiskMatrix
          suppliers={derived}
          colorBy={colorBy}
          onSelectSupplier={onSelectSupplier}
          config={config}
        />
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h3>Risk tier tally</h3>
          </div>
          <div className="tally">
            {tierCounts.map((t) => {
              const m = RISK_META[t.tier];
              return (
                <div key={t.tier} className="tally-row">
                  <span className="tally-label" style={{ color: m.color }}>
                    {t.tier}
                  </span>
                  <div className="tally-track" aria-hidden="true">
                    <div
                      className="tally-fill"
                      style={{
                        width: `${total ? (t.count / total) * 100 : 0}%`,
                        background: m.color,
                      }}
                    />
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
            <span className="panel-hint">
              Critical &amp; High, lowest adjusted reliability first
            </span>
          </div>
          {watchlist.length === 0 ? (
            <p className="empty-note">
              No scored suppliers are currently in Critical or High Risk.
            </p>
          ) : (
            <ul className="watchlist" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {watchlist.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="watchlist-row"
                    onClick={() => onSelectSupplier(s.id)}
                    aria-label={`Open ${s.name}, ${s.riskTier}, adjusted reliability ${fmtScore(s.adjustedScore)}`}
                  >
                    <span className="watchlist-name">
                      <Building2 size={13} color={C.ink} aria-hidden="true" />
                      <span>{s.name}</span>
                    </span>
                    <span
                      className="watchlist-score"
                      style={{ color: RISK_META[s.riskTier].color }}
                    >
                      {fmtScore(s.adjustedScore)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Needs attention</h3>
            <span className="panel-hint">
              Raw signals outside Critical/High, independent of final tier
            </span>
          </div>
          {attentionRows.length === 0 ? (
            <p className="empty-note">
              No other supplier shows poor raw delivery or sole-source dependency.
            </p>
          ) : (
            <ul className="watchlist" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {attentionRows.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="watchlist-row"
                    onClick={() => onSelectSupplier(s.id)}
                    aria-label={`Open ${s.name}, ${s.riskTier}, ${s.attention.map((a) => a.label).join(", ")}`}
                  >
                    <span className="watchlist-name">
                      <Building2 size={13} color={C.ink} aria-hidden="true" />
                      <span>{s.name}</span>
                      <span className="laggard-category">
                        {s.attention.map((a) => a.label).join(" · ")}
                      </span>
                    </span>
                    <span className="watchlist-score" style={{ color: C.brass }}>
                      {s.riskTier.replace(" Risk", "")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="note-line" style={{ marginTop: 8 }}>
            Poor delivery = on-time rate below the active score-3 delivery minimum. Sole-source
            dependency = sole-sourced at P1 to P3. Prompts follow-up; does not change the tier.
          </p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Category laggards</h3>
            <span className="panel-hint">
              Descriptive: below other scored peers in the same category
            </span>
          </div>
          {laggards.length === 0 ? (
            <p className="empty-note">
              No supplier currently sits more than {config.peerGapThreshold} below its category
              peers.
            </p>
          ) : (
            <ul className="watchlist" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {laggards.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="watchlist-row"
                    onClick={() => onSelectSupplier(s.id)}
                    aria-label={`Open ${s.name}, ${fmtScore(-s.peerDelta)} below ${s.categoryPeerCount} peers`}
                  >
                    <span className="watchlist-name">
                      <Building2 size={13} color={C.ink} aria-hidden="true" />
                      <span>{s.name}</span>
                      <span className="laggard-category">
                        {s.category} &middot; {s.categoryPeerCount} peer
                        {s.categoryPeerCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="watchlist-score" style={{ color: C.brass }}>
                      {fmtScore(s.peerDelta)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {laggards.length > 0 && (
            <p className="note-line" style={{ marginTop: 8 }}>
              Small peer groups and mixed priority tiers limit interpretation. Never overrides the
              absolute tier.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
